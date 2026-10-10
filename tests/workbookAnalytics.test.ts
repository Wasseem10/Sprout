import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { analyzeWorkbookOnDatabricks } from '../server/providers/workbookAnalytics';
import { analyzeSpreadsheet, ensureDemoWorkbook } from '../server/computer/spreadsheet';

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
const cfg = () => ({
  ...config(),
  dbHost: 'https://workspace.example',
  dbWarehouse: 'test-warehouse',
  dbToken: 'test-token',
});
function result(values: unknown[] = ['2', '2700', '1350', 'East', '2700']) {
  return new Response(
    JSON.stringify({
      statement_id: 'test-statement',
      status: { state: 'SUCCEEDED' },
      manifest: {
        schema: {
          columns: ['numeric_count', 'total', 'average', 'category', 'group_total'].map((name) => ({
            name,
          })),
        },
      },
      result: { data_array: [values] },
    }),
  );
}

it('calculates through Databricks with bound values and retains query provenance', async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(body.statement).toContain('AVG(value)');
    expect(body.statement).not.toContain("East'); DROP TABLE");
    expect(body.parameters).toContainEqual({
      name: 'c0',
      value: "East'); DROP TABLE users; --",
      type: 'STRING',
    });
    expect(body.parameters).toContainEqual({ name: 'v0', value: '1200', type: 'DOUBLE' });
    return result();
  });
  vi.stubGlobal('fetch', fetcher);
  const report = await analyzeWorkbookOnDatabricks(
    [
      { category: "East'); DROP TABLE users; --", value: 1200 },
      { category: 'East', value: 1500 },
    ],
    cfg(),
    signal(),
  );
  expect(report).toMatchObject({
    provider: 'databricks',
    count: 2,
    total: 2700,
    average: 1350,
    queryReference: 'Databricks statement test-statement',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not pretend local results came from an unconfigured or failed warehouse', async () => {
  const fetcher = vi.fn(async () => result(['2', 'NaN', '1350', null, null]));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    analyzeWorkbookOnDatabricks(
      [{ category: null, value: 1 }],
      { ...cfg(), dbToken: '' },
      signal(),
    ),
  ).rejects.toThrow('has not been sent');
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    analyzeWorkbookOnDatabricks(
      [
        { category: null, value: 1 },
        { category: null, value: 2 },
      ],
      cfg(),
      signal(),
    ),
  ).rejects.toThrow('invalid workbook totals');
});

it('analyzes Excel locally by default and sends selected numeric data only when Databricks is requested', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'insightos-workbook-'));
  await ensureDemoWorkbook(root);
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(body.parameters).toHaveLength(12);
    expect(JSON.stringify(body.parameters)).not.toContain('January');
    return result(['6', '6200', String(6200 / 6), 'East', '2700']);
  });
  vi.stubGlobal('fetch', fetcher);
  const local = await analyzeSpreadsheet(root, 'Which region has the highest revenue?', undefined, {
    cfg: cfg(),
    signal: signal(),
  });
  expect(local.provider).toBe('local');
  expect(local.summary).toContain('East with 2,700');
  expect(fetcher).not.toHaveBeenCalled();
  const optedOut = await analyzeSpreadsheet(root, 'Analyze revenue without Databricks', undefined, {
    cfg: cfg(),
    signal: signal(),
  });
  expect(optedOut.provider).toBe('local');
  expect(fetcher).not.toHaveBeenCalled();
  const remote = await analyzeSpreadsheet(
    root,
    'Use Databricks to analyze revenue by region',
    undefined,
    { cfg: cfg(), signal: signal() },
  );
  expect(remote.provider).toBe('databricks');
  expect(remote.summary).toContain('Databricks calculated Revenue: total 6,200');
  expect(remote.summary).toContain('East with 2,700');
  expect(remote.queryReference).toBe('Databricks statement test-statement');
});

it('honors Stop before uploading any workbook data', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  controller.abort();
  await expect(
    analyzeWorkbookOnDatabricks([{ category: 'East', value: 1 }], cfg(), controller.signal),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
