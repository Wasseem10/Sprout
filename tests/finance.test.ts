import { it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { calculateLoan, newFinanceState, refreshFinance } from '../shared/finance';
import {
  loadFinanceDemo,
  parseFinanceCsv,
  parseFinanceFile,
  writeFinanceWorkbook,
} from '../server/computer/finance-files';
import { financeOnDatabricks } from '../server/providers/financeAnalytics';
import { spokenComputerReply } from '../src/speechText';
const controllers: ComputerController[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const c of controllers.splice(0)) await c.close();
});
const signal = () => new AbortController().signal;
async function fixture() {
  const cfg = {
    ...config(),
    hfToken: '',
    cloudUrl: '',
    cloudPassphrase: '',
    dbHost: '',
    dbWarehouse: '',
    dbToken: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-finance-')),
  };
  const c = new ComputerController(cfg, { headless: true });
  controllers.push(c);
  await c.init();
  return { c, cfg };
}
it('reconciles income and expenses by exact cents and names actual spending increases', async () => {
  const state = newFinanceState(await loadFinanceDemo(), 'test', true);
  expect(state.analysis.current).toMatchObject({
    income: 300000,
    expenses: 281000,
    remaining: 19000,
  });
  expect(state.analysis.previous).toMatchObject({ expenses: 262000, remaining: 38000 });
  expect(state.analysis.categories.find((c) => c.category === 'Groceries')).toMatchObject({
    change: 10000,
  });
  const micro = parseFinanceCsv(
    'Date,Category,Type,Amount\n2026-09-01,Pay,income,0.30\n2026-09-02,A,expense,0.10\n2026-09-03,A,expense,0.20',
  );
  expect(newFinanceState(micro, 'micro', false).analysis.current.remaining).toBe(0);
});
it('rejects ambiguous money, impossible dates, missing categories, transfers and corrupt archives', async () => {
  for (const csv of [
    'Date,Category,Amount\n2026-02-30,A,-10',
    'Date,Category,Amount\n2026-09-01,A,0.001',
    'Date,Category,Amount\n2026-09-01,,10',
    'Date,Category,Type,Amount\n2026-09-01,A,transfer,10',
  ])
    expect(() => parseFinanceCsv(csv)).toThrow();
  await expect(parseFinanceFile('data.xlsx', Buffer.from('not a workbook'))).rejects.toThrow(
    'XLSX',
  );
  const signed = parseFinanceCsv('Date,Category,Amount\n2026-09-01,Wages,200\n2026-09-02,Food,-50');
  expect(signed.map((r) => r.kind)).toEqual(['income', 'expense']);
});
it('uses a zero-rate branch, accounts for interest, and checks both the limit and cash-flow difference', () => {
  expect(
    calculateLoan({ principal: 120000, apr: 0, months: 24, limit: 3000 }, 19000),
  ).toMatchObject({ payment: 5000, interest: 0, withinLimit: false });
  const loan = calculateLoan({ principal: 120000, apr: 12, months: 24, limit: 6000 }, 19000);
  expect(loan.payment).toBe(5649);
  expect(loan.interest).toBeGreaterThan(15000);
  expect(loan.withinLimit).toBe(true);
  expect(
    calculateLoan({ principal: 120000, apr: 12, months: 24, limit: 6000 }, 1000).withinLimit,
  ).toBe(false);
  expect(
    calculateLoan({ principal: 120000, apr: 0, months: 48, limit: 3000 }, 19000),
  ).toMatchObject({ payment: 2500, withinLimit: true });
});
it('keeps scenarios separate from source data, caps reductions and supports undo and voice corrections', async () => {
  const { c } = await fixture();
  await c.request('Start the finance demo', signal());
  const initial = c.snapshot().finance!.transactions;
  await c.request('Reduce groceries by $100', signal());
  expect(c.snapshot().finance!.scenarioRemaining).toBe(29000);
  expect(c.snapshot().finance!.transactions).toEqual(initial);
  await c.request('Reduce groceries by $900', signal());
  expect(c.snapshot().finance!.scenarioRemaining).toBe(29000);
  await c.request('Undo my finance change', signal());
  expect(c.snapshot().finance!.scenarioRemaining).toBe(19000);
  const result = await c.request(
    'Check a $1200 loan at 12% APR over 24 months with a $30 limit',
    signal(),
  );
  expect(result.state.finance!.loan).toMatchObject({
    payment: 5649,
    limit: 3000,
    withinLimit: false,
  });
  expect(spokenComputerReply(result, 'financeHelp')).toContain('exceeds your $30.00 limit');
  await c.request('Change the payment limit to $60', signal());
  expect(c.snapshot().finance!.loan!.withinLimit).toBe(true);
  await c.request('Change APR to 0%', signal());
  expect(c.snapshot().finance!.loan!.interest).toBe(0);
  await c.request('Reduce groceries by $100', signal());
  expect(c.snapshot().finance).toMatchObject({
    scenarioRemaining: 29000,
    loan: { payment: 5000, remainingAfter: 24000 },
  });
  await c.request('Undo my finance change', signal());
  expect(c.snapshot().finance).toMatchObject({
    scenarioRemaining: 19000,
    loan: { payment: 5000, remainingAfter: 14000 },
  });
});
it('does not steal the energy budget follow-up and keeps both supported workflows', async () => {
  const { c } = await fixture();
  await c.request('Start the finance demo', signal());
  await c.request('Start the energy demo', signal());
  const result = await c.request('My budget is $30 per month', signal());
  expect(result.tool).toBe('energyHelp');
  expect(result.state.energy?.budget).toBe(30);
  const finance = await c.request('Explain my finance spending', signal());
  expect(finance.tool).toBe('financeHelp');
  expect(finance.state.task).toBeNull();
});
it('exports a real editable Excel workbook with formulas and checks file integrity on download', async () => {
  const { c, cfg } = await fixture();
  await c.request('Start the finance demo', signal());
  await c.request('Reduce groceries by $100', signal());
  await c.request('Check a $1200 loan at 12% APR over 24 months with a $30 limit', signal());
  const exportReply = await c.request('Export my finance Excel workbook', signal());
  expect(spokenComputerReply(exportReply, 'financeHelp')).not.toContain('.xlsx');
  const exported = await c.financeExport(),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(exported.bytes as any);
  expect(book.getWorksheet('Monthly totals')!.getCell('D3').value).toMatchObject({
    formula: 'B3-C3',
    result: 190,
  });
  expect(book.getWorksheet('Budget scenario')!.getCell('C3').value).toBe(100);
  expect(book.getWorksheet('Payment comparison')!.getCell('B6').value).toMatchObject({
    result: 56.49,
  });
  expect(book.getWorksheet('Payment comparison')!.getCell('B7').value).toMatchObject({
    formula: 'SUM(Amortization!D2:D361)',
    result: 1355.71,
  });
  const payments = book
    .getWorksheet('Amortization')!
    .getColumn(4)
    .values.slice(2)
    .reduce<number>((sum, value) => sum + Number((value as any).result ?? 0), 0);
  expect(Math.round(payments * 100)).toBe(135571);
  expect(book.getWorksheet('Transactions')!.getCell('A2').value).toBeInstanceOf(Date);
  expect((book.getWorksheet('Monthly totals')!.getCell('B3').value as any).formula).toContain(
    'DATE(2026,9,1)',
  );
  expect(await parseFinanceFile(exported.filename, exported.bytes)).toEqual(
    c.snapshot().finance!.transactions,
  );
  const root = path.join(cfg.localDir, 'finance-workspace');
  await writeFile(path.join(root, exported.filename), 'changed file');
  await expect(c.financeExport()).rejects.toThrow('changed');
});
it('imports genuine XLSX and prevents category text from becoming an Excel formula', async () => {
  const state = newFinanceState(
    parseFinanceCsv('Date,Category,Type,Amount\n2026-09-01,=1+1,expense,25'),
    'source.csv',
    false,
  );
  const folder = await mkdtemp(path.join(tmpdir(), 'finance-book-')),
    file = path.join(folder, 'budget.xlsx');
  await writeFinanceWorkbook(state, file);
  const bytes = await readFile(file),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as any);
  expect(book.getWorksheet('Transactions')!.getCell('C2').type).toBe(ExcelJS.ValueType.String);
  expect((await parseFinanceFile('budget.xlsx', bytes))[0].category).toBe('=1+1');
  state.reductions['=1+1'] = 2600;
  expect(() => refreshFinance(state)).toThrow('reduction');
});
it('interprets a flexible voice request through a real-shaped HF response and rejects invented categories', async () => {
  const { c, cfg } = await fixture();
  await c.request('Start the finance demo', signal());
  cfg.hfToken = 'fixture';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    operation: 'reduce',
                    category: 'Groceries',
                    dollars: 100,
                  }),
                },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  const result = await c.request(
    'What happens if I spend one hundred dollars less on groceries?',
    signal(),
  );
  expect(result.state.finance).toMatchObject({
    scenarioRemaining: 29000,
    narrativeProvider: 'hugging-face',
  });
});
it('runs parameterized Databricks aggregates without descriptions and rejects incorrect remote totals', async () => {
  const cfg = {
    ...config(),
    dbHost: 'https://fixture.cloud.databricks.com',
    dbToken: 'fixture',
    dbWarehouse: 'fixture',
  };
  const rows = await loadFinanceDemo(),
    groups = new Map<string, any[]>();
  for (const r of rows) {
    const key = JSON.stringify([r.date.slice(0, 7), r.category, r.kind]);
    const g = groups.get(key) ?? [r.date.slice(0, 7), r.category, r.kind, 0, 0];
    g[3]++;
    g[4] += r.cents;
    groups.set(key, g);
  }
  let submitted = '';
  let wrong = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init: RequestInit) => {
      submitted = String(init.body ?? submitted);
      const data = [...groups.values()].map((g) => [...g]);
      if (wrong) data[0][4]++;
      return new Response(
        JSON.stringify({
          statement_id: 'finance-query',
          status: { state: 'SUCCEEDED' },
          manifest: {
            schema: {
              columns: ['month', 'category', 'kind', 'row_count', 'total_cents'].map((name) => ({
                name,
              })),
            },
          },
          result: { data_array: data },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  expect(await financeOnDatabricks(rows, cfg, signal())).toMatchObject({
    provider: 'databricks',
    queryReference: 'Databricks statement finance-query',
  });
  expect(submitted).toContain(':ledger');
  expect(submitted).not.toContain('Sample wages');
  wrong = true;
  await expect(financeOnDatabricks(rows, cfg, signal())).rejects.toThrow('did not match');
});
it('does not silently fall back when Databricks was requested without credentials', async () => {
  const { c } = await fixture();
  await c.request('Start the finance demo', signal());
  await expect(c.request('Analyze my finance with Databricks', signal())).rejects.toThrow(
    'Databricks needs',
  );
  expect(c.snapshot().finance!.provider).toBe('local');
});
