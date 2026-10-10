import { it, expect, vi, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { config } from '../server/config';
import { livePlan, samplePlan } from '../server/providers/planner';
import { Databricks } from '../server/providers/databricks';
import { emptyWorkspace, planSchema } from '../shared/schema';
import { parseCsv, defaultComparison } from '../shared/analysis';
const cfg = {
  ...config(),
  hfToken: 'fake-test-token',
  dbHost: 'https://example.databricks.test',
  dbToken: 'fake-test-token',
  dbWarehouse: 'test-warehouse',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
it('repairs malformed inference once, then rejects unsupported actions', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(reply({ choices: [{ message: { content: 'not json' } }] }))
    .mockResolvedValueOnce(
      reply({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actions: [{ tool: 'inspectDataset', args: {} }],
                clarification: null,
              }),
            },
          },
        ],
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  expect(
    (await livePlan('Describe file', emptyWorkspace(), cfg, new AbortController().signal))
      .actions[0].tool,
  ).toBe('inspectDataset');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      reply({
        choices: [
          {
            message: {
              content: '{"actions":[{"tool":"runShell","args":{}}],"clarification":null}',
            },
          },
        ],
      }),
    ),
  );
  await expect(
    livePlan('Run a command', emptyWorkspace(), cfg, new AbortController().signal),
  ).rejects.toThrow('invalid tool plan twice');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('rejects model SQL arguments and unsafe multi-action saves', () => {
  expect(() =>
    planSchema.parse({
      actions: [{ tool: 'compareRevenue', args: { sql: 'DROP TABLE x' } }],
      clarification: null,
    }),
  ).toThrow();
  expect(() =>
    planSchema.parse({
      actions: [
        { tool: 'saveProject', args: {} },
        { tool: 'compareRevenue', args: {} },
      ],
      clarification: null,
    }),
  ).toThrow();
  expect(samplePlan('top 0 regions', emptyWorkspace()).clarification).toContain('1 and 50');
  expect(samplePlan('What changed?', emptyWorkspace()).actions[0].tool).toBe('describeChanges');
});
it('consumes Databricks result chunks and rejects truncation', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      reply({
        statement_id: 'statement-1',
        status: { state: 'SUCCEEDED' },
        manifest: { schema: { columns: [{ name: 'value' }] } },
        result: {
          data_array: [['1']],
          next_chunk_internal_link: '/api/2.0/sql/statements/statement-1/result/chunks/1',
        },
      }),
    )
    .mockResolvedValueOnce(reply({ data_array: [['2']] }));
  vi.stubGlobal('fetch', fetchMock);
  expect(
    (
      await new Databricks(cfg).statement(
        'SELECT :value',
        [{ name: 'value', value: '1', type: 'INT' }],
        new AbortController().signal,
      )
    ).rows,
  ).toEqual([['1'], ['2']]);
  fetchMock.mockReset().mockResolvedValue(
    reply({
      statement_id: 'statement-2',
      status: { state: 'SUCCEEDED' },
      manifest: { truncated: true },
    }),
  );
  await expect(
    new Databricks(cfg).statement('SELECT 1', [], new AbortController().signal),
  ).rejects.toThrow('truncated');
  expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('/cancel');
});
it('cancels a running Databricks statement when interrupted', async () => {
  const controller = new AbortController(),
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (!url.endsWith('/cancel')) controller.abort();
      return reply({ statement_id: 'statement-3', status: { state: 'RUNNING' } });
    });
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    new Databricks(cfg).statement('SELECT 1', [], controller.signal),
  ).rejects.toHaveProperty('name', 'AbortError');
  expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('/cancel');
});
it('derives live analytics from actual returned aggregates, with parameterized periods', async () => {
  const dataset = parseCsv(
      await readFile('data/operations-synthetic.csv', 'utf8'),
      'Provider contract',
      true,
    ),
    db = new Databricks(cfg);
  vi.spyOn(db, 'seed').mockResolvedValue('`main`.`insightos`.`ops_fixture`');
  const statement = vi.spyOn(db, 'statement').mockResolvedValue({
    id: 'statement-real-result',
    columns: ['region', 'previous', 'current', 'row_count', 'locations', 'all_locations'],
    rows: [
      ['East', '18000.00', '30000.00', '6', '1', '7'],
      ['North', '30000.00', '36000.00', '6', '1', '7'],
      ['South', '24000.00', '18000.00', '6', '1', '7'],
      ['Central', '33000.00', '34500.00', '6', '1', '7'],
      ['West', '21000.00', '22500.00', '6', '1', '7'],
    ],
  });
  const result = await db.analyze(
    dataset,
    { ...defaultComparison(dataset), commonLocations: true },
    new AbortController().signal,
  );
  expect(result.currentTotal).toBe(141000);
  expect(result.previousTotal).toBe(126000);
  expect(result.excludedLocations).toBe(2);
  expect(result.regions[0].region).toBe('East');
  expect(result.queryReference).toContain('statement-real-result');
  expect(statement.mock.calls[0][0]).toContain('operating_start <= :ps');
  expect(statement.mock.calls[0][1]).toContainEqual({
    name: 'common',
    value: 'true',
    type: 'BOOLEAN',
  });
});
