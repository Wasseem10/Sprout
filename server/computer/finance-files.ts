import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ledgerSchema, type Transaction, type FinanceState } from '../../shared/finance.js';

function cents(value: unknown, row: number) {
  const raw = String(value ?? '')
    .trim()
    .replace(/[$,]/g, '');
  const normalized = /^\(.*\)$/.test(raw) ? '-' + raw.slice(1, -1) : raw;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error(
      `Computer finance row ${row}: Amount must be a dollar amount with up to two decimal places.`,
    );
  const result = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 100_000_000)
    throw new Error(`Computer finance row ${row}: Amount exceeds the supported range.`);
  return result;
}
function ledger(headers: string[], values: unknown[][]): Transaction[] {
  const names = headers.map((h) => h.trim().toLowerCase());
  if (new Set(names).size !== names.length)
    throw new Error('Computer finance headers must be unique.');
  const index = (name: string) => names.indexOf(name);
  if (['date', 'category', 'amount'].some((h) => index(h) < 0))
    throw new Error(
      'Computer finance file needs Date, Category and Amount columns. Optional: Type and Description. Without Type, positive amounts mean income and negative amounts mean expenses.',
    );
  const rows = values.filter((row) =>
    row.some((v) => v !== null && v !== undefined && String(v).trim() !== ''),
  );
  if (rows.length > 3000)
    throw new Error('Computer finance import supports up to 3,000 transactions.');
  return ledgerSchema.parse(
    rows.map((row, i) => {
      const amount = cents(row[index('amount')], i + 2);
      const type =
        index('type') >= 0
          ? String(row[index('type')] ?? '')
              .trim()
              .toLowerCase()
          : amount < 0
            ? 'expense'
            : 'income';
      if (!['income', 'expense'].includes(type) || (type === 'income' && amount < 0))
        throw new Error(
          `Computer finance row ${i + 2}: Type must be income or expense; transfers must be removed from this cash-flow ledger.`,
        );
      return {
        date: String(row[index('date')] ?? '').trim(),
        category: String(row[index('category')] ?? '').trim(),
        kind: type,
        cents: Math.abs(amount),
        description:
          index('description') >= 0 ? String(row[index('description')] ?? '').slice(0, 200) : '',
      };
    }),
  );
}
export function parseFinanceCsv(text: string) {
  if (Buffer.byteLength(text) > 3 * 1024 * 1024)
    throw new Error('Computer finance CSV must be under 3 MB.');
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (parsed.errors.length || parsed.data.length < 2)
    throw new Error(
      'Computer finance CSV could not be read. Use a header row and transaction rows.',
    );
  const [headers, ...rows] = parsed.data;
  if (rows.some((r) => r.length !== headers.length))
    throw new Error(
      'Computer finance CSV rows must have the same number of columns as the header.',
    );
  return ledger(headers, rows);
}
function excelValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object' && 'result' in value)
    return excelValue(value.result as ExcelJS.CellValue);
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return value;
}
function boundedZip(bytes: Buffer) {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const end = bytes.lastIndexOf(signature);
  if (
    end < 0 ||
    end + 22 > bytes.length ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw new Error('Computer finance workbook must be a normal XLSX archive.');
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (count > 300 || offset >= end)
    throw new Error('Computer finance workbook archive is too complex.');
  let cursor = offset,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Computer finance workbook archive is invalid.');
    total += bytes.readUInt32LE(cursor + 24);
    if (total > 16 * 1024 * 1024)
      throw new Error('Computer finance workbook expands beyond 16 MB.');
    cursor +=
      46 +
      bytes.readUInt16LE(cursor + 28) +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
}
export async function parseFinanceFile(filename: string, bytes: Buffer) {
  if (!/\.(?:xlsx|csv)$/i.test(filename) || bytes.length > 3 * 1024 * 1024)
    throw new Error('Computer finance import needs a CSV or XLSX under 3 MB.');
  if (/\.csv$/i.test(filename)) return parseFinanceCsv(bytes.toString('utf8'));
  boundedZip(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  const sheet = workbook.worksheets.find((s) => s.rowCount > 1);
  if (!sheet || sheet.rowCount > 3001 || sheet.columnCount > 20)
    throw new Error(
      'Computer finance workbook needs up to 3,000 rows and 20 columns in its first populated sheet.',
    );
  const headers = Array.from({ length: sheet.columnCount }, (_, c) =>
    String(excelValue(sheet.getCell(1, c + 1).value) ?? ''),
  );
  const rows = Array.from({ length: sheet.rowCount - 1 }, (_, r) =>
    headers.map((_, c) => excelValue(sheet.getCell(r + 2, c + 1).value)),
  );
  return ledger(headers, rows);
}
export async function loadFinanceDemo() {
  return parseFinanceCsv(await readFile('data/finance-demo-synthetic.csv', 'utf8'));
}
function decorate(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183760' } };
  });
  sheet.columns.forEach((c) => {
    c.width = 23;
  });
}
export async function writeFinanceWorkbook(state: FinanceState, file: string) {
  const book = new ExcelJS.Workbook();
  book.creator = 'InsightOS';
  book.calcProperties.fullCalcOnLoad = true;
  const transactions = book.addWorksheet('Transactions');
  transactions.addRow(['Date', 'Description', 'Category', 'Type', 'Amount']);
  for (const row of state.transactions)
    transactions.addRow([
      new Date(row.date + 'T00:00:00Z'),
      row.description,
      row.category,
      row.kind,
      row.cents / 100,
    ]);
  transactions.getColumn(1).numFmt = 'yyyy-mm-dd';
  transactions.getColumn(5).numFmt = '$#,##0.00;[Red]-$#,##0.00';
  transactions.autoFilter = `A1:E${state.transactions.length + 1}`;
  const monthly = book.addWorksheet('Monthly totals');
  monthly.addRow(['Month', 'Income', 'Spending', 'Difference']);
  for (const m of state.analysis.months) {
    const r = monthly.rowCount + 1;
    const next = new Date(`${m.month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const ranges = `Transactions!$E$2:$E$${transactions.rowCount},Transactions!$D$2:$D$${transactions.rowCount}`;
    const dates = `Transactions!$A$2:$A$${transactions.rowCount},">="&DATE(${Number(m.month.slice(0, 4))},${Number(m.month.slice(5))},1),Transactions!$A$2:$A$${transactions.rowCount},"<"&DATE(${next.getUTCFullYear()},${next.getUTCMonth() + 1},1)`;
    monthly.addRow([
      m.month,
      { formula: `SUMIFS(${ranges},"income",${dates})`, result: m.income / 100 },
      { formula: `SUMIFS(${ranges},"expense",${dates})`, result: m.expenses / 100 },
      { formula: `B${r}-C${r}`, result: m.remaining / 100 },
    ]);
  }
  const scenario = book.addWorksheet('Budget scenario');
  scenario.addRow(['Category', 'Recorded spending', 'Assumed reduction', 'Planned spending']);
  for (const category of state.analysis.categories) {
    const r = scenario.rowCount + 1,
      reduction = state.reductions[category.category] ?? 0;
    scenario.addRow([
      category.category,
      category.current / 100,
      reduction / 100,
      { formula: `MAX(0,B${r}-C${r})`, result: (category.current - reduction) / 100 },
    ]);
    scenario.getCell(r, 3).dataValidation = {
      type: 'decimal',
      operator: 'between',
      formulae: [0, `B${r}`],
      showErrorMessage: true,
      error: 'Reduction must be between zero and recorded spending.',
    };
  }
  const last = scenario.rowCount;
  scenario.addRow([
    'Assumed reductions',
    '',
    { formula: `SUM(C2:C${last})`, result: state.scenarioSavings / 100 },
  ]);
  const sumRow = scenario.rowCount;
  scenario.addRow([
    'Recorded difference',
    {
      formula: `'Monthly totals'!D${monthly.rowCount}`,
      result: state.analysis.current.remaining / 100,
    },
  ]);
  scenario.addRow([
    'Scenario difference',
    { formula: `B${sumRow + 1}+C${sumRow}`, result: state.scenarioRemaining / 100 },
  ]);
  if (state.loan) {
    const loan = book.addWorksheet('Payment comparison');
    loan.addRow(['Assumption', 'Value']);
    loan.addRows([
      ['Amount', state.loan.principal / 100],
      ['APR', state.loan.apr / 100],
      ['Months', state.loan.months],
      ['Monthly limit', state.loan.limit / 100],
      [
        'Estimated monthly payment',
        {
          formula: 'ROUNDUP(IF(B3=0,B2/B4,-PMT(B3/12,B4,B2)),2)',
          result: state.loan.payment / 100,
        },
      ],
      ['Estimated total repaid', state.loan.total / 100],
      ['Estimated interest', state.loan.interest / 100],
      [
        'Scenario difference after payment',
        { formula: `'Budget scenario'!B${sumRow + 2}-B6`, result: state.loan.remainingAfter / 100 },
      ],
      [
        'Within limit and recorded cash flow',
        {
          formula: `IF(AND(B6<=B5,B9>=0),"Within assumptions","Above assumptions")`,
          result: state.loan.withinLimit ? 'Within assumptions' : 'Above assumptions',
        },
      ],
    ]);
    const schedule = book.addWorksheet('Amortization');
    schedule.addRow([
      'Month',
      'Starting balance',
      'Balance with interest',
      'Payment',
      'Ending balance',
    ]);
    let balance = state.loan.principal / 100;
    for (let month = 1; month <= 360; month++) {
      const r = month + 1,
        active = month <= state.loan.months;
      const due = active ? balance * (1 + state.loan.apr / 1200) : 0;
      const paid = !active
        ? 0
        : month === state.loan.months
          ? Math.round(due * 100) / 100
          : Math.min(state.loan.payment / 100, Math.round(due * 100) / 100);
      const end = active ? Math.max(0, due - paid) : 0;
      schedule.addRow([
        month,
        {
          formula: `IF(A${r}>'Payment comparison'!$B$4,0,${month === 1 ? "'Payment comparison'!$B$2" : `E${r - 1}`})`,
          result: active ? balance : 0,
        },
        { formula: `B${r}*(1+'Payment comparison'!$B$3/12)`, result: due },
        {
          formula: `IF(A${r}>'Payment comparison'!$B$4,0,IF(A${r}='Payment comparison'!$B$4,ROUND(C${r},2),MIN('Payment comparison'!$B$6,ROUND(C${r},2))))`,
          result: paid,
        },
        { formula: `MAX(0,C${r}-D${r})`, result: end },
      ]);
      balance = end;
    }
    loan.getCell('B7').value = {
      formula: 'SUM(Amortization!D2:D361)',
      result: state.loan.total / 100,
    };
    loan.getCell('B8').value = { formula: 'B7-B2', result: state.loan.interest / 100 };
    loan.getCell('B4').dataValidation = {
      type: 'whole',
      operator: 'between',
      formulae: [1, 360],
      showErrorMessage: true,
      error: 'Term must be 1 to 360 months.',
    };
    for (const [cell, upper] of [
      ['B2', 1000000],
      ['B3', 1],
      ['B5', 1000000],
    ] as const)
      loan.getCell(cell).dataValidation = {
        type: 'decimal',
        operator: 'between',
        formulae: [cell === 'B2' ? 1 : 0, upper],
        showErrorMessage: true,
        error: 'Enter a supported non-negative assumption.',
      };
    for (let col = 2; col <= 5; col++) schedule.getColumn(col).numFmt = '$#,##0.00;[Red]-$#,##0.00';
    decorate(schedule);
    loan.getCell('B3').numFmt = '0.00%';
    for (const r of [2, 5, 6, 7, 8, 9]) loan.getCell(r, 2).numFmt = '$#,##0.00;[Red]-$#,##0.00';
    decorate(loan);
  }
  const notes = book.addWorksheet('Read me');
  notes.addRow(['Source and assumptions', 'Details']);
  notes.addRows([
    ['Source', state.sourceName],
    ['Sample data', state.synthetic ? 'Synthetic demo transactions' : 'User-imported records'],
    [
      'Analysis',
      state.provider === 'databricks' ? state.queryReference : 'Local integer-cent calculations',
    ],
    [
      'Scope',
      'USD; recorded transactions only. Difference is not an account balance. Transfers must be excluded.',
    ],
    ['Scenario', 'Reductions are hypothetical and have not happened.'],
    ['Payment', 'User-entered assumptions; fixed-rate, no fees. No lender offer or approval.'],
    [
      'Excel',
      'Source formula cells use stored cached results; generated workbook formulas recalculate in Excel.',
    ],
    ['Created', state.updatedAt],
  ]);
  for (const s of [monthly, scenario])
    for (let col = 2; col <= 4; col++) s.getColumn(col).numFmt = '$#,##0.00;[Red]-$#,##0.00';
  for (const s of [transactions, monthly, scenario, notes]) decorate(s);
  notes.getColumn(2).width = 95;
  notes.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    rows: state.transactions.length,
  };
}
