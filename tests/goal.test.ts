import { it, expect, vi, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import * as presentationIntent from '../server/computer/presentation-intent';

const controllers: ComputerController[] = [];
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const c of controllers.splice(0)) await c.close();
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});
const signal = () => new AbortController().signal;
it('passes Databricks workbook findings into a real editable PowerPoint through the coordinator', async () => {
  const { controller, cfg } = await setup();
  cfg.dbHost = 'https://warehouse.example';
  cfg.dbToken = 'test';
  cfg.dbWarehouse = 'warehouse';
  await controller.demoFolder();
  let outlineContext = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      if (String(url).includes('/sql/statements'))
        return new Response(
          JSON.stringify({
            statement_id: 'verified-query',
            status: { state: 'SUCCEEDED' },
            manifest: {
              schema: {
                columns: ['numeric_count', 'total', 'average', 'category', 'group_total'].map(
                  (name) => ({ name }),
                ),
              },
            },
            result: { data_array: [['6', '6200', String(6200 / 6), 'East', '2700']] },
          }),
        );
      let answer: unknown;
      if (body.messages[0].content.includes('PowerPoint outline')) {
        outlineContext = body.messages[1].content;
        answer = {
          title: 'Sales findings',
          subtitle: 'Calculated workbook results',
          slides: [
            {
              title: 'Revenue total',
              points: ['Total revenue is 6,200.', 'Calculated with Databricks SQL.'],
            },
            {
              title: 'Regional result',
              points: ['East leads with 2,700.', 'Six numeric data rows were analyzed.'],
            },
          ],
        };
      } else {
        const c = JSON.parse(body.messages[1].content);
        answer = !c.spreadsheet
          ? {
              decision: 'act',
              message: 'Analyzing the workbook.',
              action: {
                tool: 'analyzeSpreadsheet',
                question: 'Analyze revenue using Databricks',
                open: false,
              },
            }
          : !c.presentation
            ? {
                decision: 'act',
                message: 'Making the slides.',
                action: {
                  tool: 'createPresentation',
                  request: 'Present the workbook findings',
                  slides: 3,
                  open: false,
                },
              }
            : {
                decision: 'done',
                message: 'The workbook analysis and slides are ready.',
                action: null,
              };
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }),
      );
    }),
  );
  const result = await controller.request(
    'Analyze the sample workbook using Databricks and then create a presentation of the results',
    signal(),
  );
  expect(result.state.task?.steps.map((s) => s.tool)).toEqual([
    'analyzeSpreadsheet',
    'createPresentation',
  ]);
  expect(result.state.spreadsheet?.queryReference).toContain('verified-query');
  expect(outlineContext).toContain('total 6,200');
  expect(outlineContext).toContain('East with 2,700');
  const file = await readFile(
    path.join(cfg.localDir, 'code-workspace', result.state.presentation!.filename),
  );
  expect(file.subarray(0, 2).toString()).toBe('PK');
  expect(result.state.presentation?.slideCount).toBe(3);
});
async function setup() {
  // Browser/workbook goals continue through the coordinator after typed domain classification.
  vi.spyOn(presentationIntent, 'interpretPresentationTurn').mockResolvedValue({
    kind: 'request',
    domain: 'other',
    startsNewTask: false,
    awaitingContinuation: false,
    fields: {},
    operations: [],
  });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      req.url === '/product'
        ? '<html><title>Blue notebook</title><body><h1>Blue notebook</h1><p>Five dollars</p><button>Place order</button></body></html>'
        : '<html><title>Catalog</title><body><a href="/product">Blue notebook</a></body></html>',
    );
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cfg = {
    ...config(),
    hfToken: 'test-token',
    cloudUrl: '',
    neonUrl: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-goal-')),
  };
  const controller = new ComputerController(cfg, {
    headless: true,
    validateUrl: async (url) => {
      if (new URL(url).origin !== origin) throw new Error('Test origin only');
      return url;
    },
  });
  controllers.push(controller);
  await controller.init();
  return { controller, cfg, origin };
}
function model(decide: (context: any) => unknown) {
  const contexts: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      const context = JSON.parse(JSON.parse(options.body).messages[1].content);
      contexts.push(context);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(decide(context)) } }] }),
        { status: 200 },
      );
    }),
  );
  return contexts;
}
it('asks once, retains the goal and preference, then navigates and clicks from fresh observations', async () => {
  const { controller, origin } = await setup();
  await controller.request('Remember that I prefer blue stationery', signal());
  const contexts = model((c) => {
    if (c.latestRequest !== 'blue')
      return { decision: 'ask', message: 'Which color?', action: null };
    if (!c.browser.url)
      return {
        decision: 'act',
        message: 'Opening the catalog.',
        action: { tool: 'navigate', url: origin },
      };
    if (c.browser.title === 'Catalog')
      return {
        decision: 'act',
        message: 'Opening the blue notebook.',
        action: { tool: 'click', pageId: c.browser.id, controlId: c.browser.controls[0].id },
      };
    return { decision: 'done', message: 'The blue notebook is open for review.', action: null };
  });
  const asked = await controller.request('Help me shop for a notebook and then open it', signal());
  expect(asked.state.task?.status).toBe('waiting');
  const id = asked.state.task?.id;
  const result = await controller.request('blue', signal());
  expect(result.state.task?.id).toBe(id);
  expect(result.state.task?.status).toBe('completed');
  expect(result.state.task?.steps.map((s) => s.tool)).toEqual(['navigate', 'click']);
  expect(result.state.browser?.title).toBe('Blue notebook');
  expect(contexts.at(-1).task.steps).toHaveLength(2);
  expect(contexts.at(-1).preferences).toEqual(['I prefer blue stationery']);
  expect(contexts.at(-1).task.goal).toContain('shop for a notebook');
});
it('stops a repeating planner when observed state does not change', async () => {
  const { controller, origin } = await setup();
  await controller.action({ tool: 'navigate', url: origin }, signal());
  const contexts = model(() => ({
    decision: 'act',
    message: 'Reading.',
    action: { tool: 'readPage' },
  }));
  const result = await controller.request('Read this page and then open the notebook', signal());
  expect(result.summary).toContain('not making progress');
  expect(result.state.task?.steps).toHaveLength(1);
  expect(contexts).toHaveLength(2);
});
it('cannot complete a goal without evidence or execute an unsupported coordinator tool', async () => {
  const { controller } = await setup();
  model(() => ({ decision: 'done', message: 'Everything is finished.', action: null }));
  const empty = await controller.request('Help me shop for paper', signal());
  expect(empty.state.task?.status).toBe('waiting');
  expect(empty.summary).toContain('not completed');
  model(() => ({ decision: 'act', message: 'Running code.', action: { tool: 'runCode' } }));
  await expect(controller.request('continue', signal())).rejects.toThrow('not available');
  expect(controller.snapshot().task?.status).toBe('failed');
});
it('retains explicitly saved memory across controller restarts and clears it on request', async () => {
  const { controller, cfg } = await setup();
  await controller.request('Remember I prefer remote jobs', signal());
  const restarted = new ComputerController(cfg);
  controllers.push(restarted);
  await restarted.init();
  expect((await restarted.request('What do you remember about me?', signal())).summary).toContain(
    'remote jobs',
  );
  await restarted.request('Forget my saved preferences', signal());
  expect((await controller.request('What do you remember?', signal())).summary).toContain(
    'no saved preferences',
  );
});

it('lets a new Excel request replace a waiting shopping goal', async () => {
  const { controller } = await setup();
  await controller.demoFolder();
  model(() => ({ decision: 'ask', message: 'Which store?', action: null }));
  await controller.request('Help me shop for paper', signal());
  expect(controller.snapshot().task?.status).toBe('waiting');
  const result = await controller.request(
    'Analyze the synthetic sample Excel sales workbook and tell me the top region',
    signal(),
  );
  expect(result.state.task).toBeNull();
  expect(result.state.spreadsheet?.summary).toContain('Revenue totals 6,200');
});
