import { it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { config } from '../server/config';
import { ComputerController, publicUrl } from '../server/computer/controller';
import { computerPlan, generateCode, starterPlan } from '../server/computer/planner';
import { computerActionSchema } from '../shared/computer';

const controllers: ComputerController[] = [],
  servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const controller of controllers.splice(0)) await controller.close();
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function setup(
  options: ConstructorParameters<typeof ComputerController>[1] = {},
  overrides = {},
) {
  const cfg = {
    ...config(),
    hfToken: '',
    host: '127.0.0.1',
    localDir: await mkdtemp(path.join(tmpdir(), 'insightos-computer-')),
    ...overrides,
  };
  const controller = new ComputerController(cfg, options);
  controllers.push(controller);
  await controller.init();
  return { controller, cfg };
}
const signal = () => new AbortController().signal;
it('creates a real file only in an authorized folder, verifies content, and rejects tampering', async () => {
  const { controller, cfg } = await setup();
  await expect(controller.authorizeFolder(cfg.localDir, 'fake-key')).rejects.toThrow(
    'native picker',
  );
  await expect(
    controller.action({ tool: 'createCode', request: 'Fibonacci program' }, signal()),
  ).rejects.toThrow('folder');
  await controller.demoFolder();
  const created = await controller.action(
    { tool: 'createCode', request: 'Fibonacci program' },
    signal(),
  );
  const file = path.join(cfg.localDir, 'code-workspace', created.state.code!.filename);
  expect(await readFile(file, 'utf8')).toBe(created.state.code!.code);
  expect(created.state.code!.status).toBe('created');
  expect(created.state.code!.output).toBe('');
  await writeFile(file, 'print("replaced")');
  await expect(controller.action({ tool: 'runCode' }, signal())).rejects.toThrow('changed outside');
  expect(() => computerActionSchema.parse({ tool: 'runShell', command: 'whoami' })).toThrow();
});
it.skipIf(!config().pythonBin)(
  'executes Python for actual output and refuses filesystem imports',
  async () => {
    const { controller } = await setup();
    await controller.demoFolder();
    await controller.action(
      { tool: 'createCode', request: 'Fibonacci program with 10 numbers' },
      signal(),
    );
    const run = await controller.action({ tool: 'runCode' }, signal());
    expect(run.state.code!.exitCode).toBe(0);
    expect(run.state.code!.output).toContain('[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]');
    const hf = await setup({}, { hfToken: 'test-token' });
    await hf.controller.demoFolder();
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
                      filename: 'bad.py',
                      code: 'import os\nprint(os.listdir())',
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    await hf.controller.action({ tool: 'createCode', request: 'untrusted computation' }, signal());
    const denied = await hf.controller.action({ tool: 'runCode' }, signal());
    expect(denied.state.code!.exitCode).not.toBe(0);
    expect(denied.state.code!.output).toContain('Only math');
    vi.stubEnv('INSIGHTOS_PRIVATE_TEST', 'do-not-leak-this-secret');
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
                      filename: 'environment.py',
                      code: 'import random\nprint("{0.__globals__[_os].environ}".format(random.Random.seed))\n',
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      hf.controller.action({ tool: 'createCode', request: 'environment test' }, signal()),
    ).rejects.toThrow('unsupported private names');
    expect(hf.controller.snapshot().code?.code).not.toContain('INSIGHTOS_PRIVATE_TEST');
  },
);
it('blocks private URLs and never converts missing vision credentials into a canned description', async () => {
  for (const url of [
    'http://example.com',
    'file:///C:/secret',
    'https://127.0.0.1',
    'https://10.1.2.3',
    'https://[::1]',
    'https://user:password@example.com',
  ])
    await expect(publicUrl(url)).rejects.toThrow('Computer browser');
  const { controller } = await setup();
  await expect(controller.action({ tool: 'describeScreen' }, signal())).rejects.toThrow(
    'selected screen',
  );
  expect(starterPlan('order everything and pay for it', controller.snapshot()).action).toBeNull();
  expect(
    starterPlan('order everything and pay for it', controller.snapshot()).clarification,
  ).toContain('cannot place orders');
});
it.skipIf(!config().pythonBin)(
  'completes an explicitly requested create-and-run workflow in one task',
  async () => {
    const { controller } = await setup();
    await controller.demoFolder();
    const plan = starterPlan(
      'Write a Python Fibonacci program with 10 numbers and run it',
      controller.snapshot(),
    );
    expect(plan.action).toMatchObject({ tool: 'createCode', run: true, openEditor: false });
    const result = await controller.action(plan.action!, signal());
    expect(result.state.code?.status).toBe('completed');
    expect(result.state.code?.output).toContain('[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]');
    expect(result.summary).toContain('Exit code: 0.');
    expect(result.summary).toContain('Output:');
  },
);
it('maps a spoken Google request to search without inventing a website action', () => {
  const state = { folder: null, code: null, browser: null, screen: null };
  expect(
    starterPlan('Open Google and search for accessible Python tutorials', state).action,
  ).toEqual({
    tool: 'search',
    query: 'accessible Python tutorials',
  });
  expect(
    starterPlan('Search Google for bus schedules and read the results to me', state).action,
  ).toEqual({ tool: 'search', query: 'bus schedules' });
  expect(starterPlan('Open Google and search accessible Python tutorials', state).action).toEqual({
    tool: 'search',
    query: 'accessible Python tutorials',
  });
});
it('opens an explicitly named HTTPS job listing without relying on model parsing', async () => {
  const state = { folder: null, code: null, browser: null, screen: null };
  const url = 'https://job-boards.greenhouse.io/k18inc/jobs/4065057008';
  const plan = await computerPlan(
    `Open ${url}`,
    state,
    { ...config(), hfToken: 'test-token' },
    signal(),
  );
  expect(plan.action).toEqual({ tool: 'navigate', url });
});
it('regenerates Python when the model uses an unsupported main guard', async () => {
  const { cfg } = await setup({}, { hfToken: 'test-token' });
  const codes = [
    'if __name__ == "__main__":\n    print(1)',
    'for n in range(1, 4):\n    print(n * n)',
  ];
  const mock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ filename: 'squares.py', code: codes.shift() }) },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', mock);
  const result = await generateCode('print squares', cfg, signal());
  expect(result.code).toContain('print(n * n)');
  expect(result.code).not.toContain('__name__');
  expect(mock).toHaveBeenCalledTimes(2);
});
it('analyzes the real synthetic Excel workbook with calculated totals and a top region', async () => {
  const { controller, cfg } = await setup();
  await controller.demoFolder();
  const report = await controller.request(
    'Analyze the Excel sales workbook and tell me the top region',
    signal(),
  );
  expect(report.summary).toContain('sales-demo-synthetic.xlsx (synthetic sample)');
  expect(report.summary).toContain('Revenue totals 6,200');
  expect(report.summary).toContain('East with 2,700');
  expect(report.state.spreadsheet?.rows).toBe(6);
  expect(
    (await readFile(path.join(cfg.localDir, 'code-workspace', 'sales-demo-synthetic.xlsx')))
      .subarray(0, 2)
      .toString(),
  ).toBe('PK');
});
it('turns a model outline into an editable PowerPoint in the selected folder', async () => {
  const { controller, cfg } = await setup({}, { hfToken: 'test-token' });
  await controller.demoFolder();
  const outline = {
    title: 'Job interview preparation',
    subtitle: 'A practical checklist for applicants',
    slides: [
      {
        title: 'Research the role',
        points: ['Read the job description carefully', 'Note the skills you can demonstrate'],
      },
      {
        title: 'Prepare examples',
        points: ['Choose two recent projects', 'Explain your actions and results'],
      },
      {
        title: 'Practice the conversation',
        points: ['Prepare questions for the interviewer', 'Test your camera and microphone'],
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(outline) } }],
          }),
          { status: 200 },
        ),
    ),
  );
  const plan = starterPlan(
    'Create a four slide PowerPoint about job interview preparation',
    controller.snapshot(),
  );
  expect(plan.action).toMatchObject({ tool: 'createPresentation', slides: 4 });
  const created = await controller.action(
    { ...plan.action!, open: false } as Extract<
      NonNullable<typeof plan.action>,
      { tool: 'createPresentation' }
    >,
    signal(),
  );
  expect(created.state.presentation?.slideCount).toBe(4);
  const file = path.join(cfg.localDir, 'code-workspace', created.state.presentation!.filename);
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.length).toBeGreaterThan(5000);
});
it('reads numbered observed search results and opens only the chosen result', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/search' });
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      req.url === '/detail'
        ? '<html><title>Selected article</title><body><h1>Accessible guide</h1></body></html>'
        : '<html><title>Search results</title><body><div id="b_results"><div class="b_algo"><h2><a href="/detail">Accessible guide</a></h2><div class="b_caption"><p>A guide that helps.</p></div></div><div class="b_algo"><h2><a href="/redirect">Redirecting guide</a></h2></div></div></body></html>',
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { controller } = await setup({
    headless: true,
    validateUrl: async (url) => {
      if (new URL(url).origin !== origin) throw new Error('Test origin only');
      return url;
    },
  });
  const search = await controller.action({ tool: 'navigate', url: origin + '/search' }, signal());
  expect(search.state.browser?.searchResults[0]).toMatchObject({
    title: 'Accessible guide',
    snippet: 'A guide that helps.',
  });
  const plan = starterPlan('open result one', search.state);
  expect(plan.action).toMatchObject({ tool: 'openSearchResult', index: 1 });
  const opened = await controller.action(plan.action!, signal());
  expect(opened.state.browser?.title).toBe('Selected article');
  await expect(controller.action(plan.action!, signal())).rejects.toThrow('changed');
  const again = await controller.action({ tool: 'navigate', url: origin + '/search' }, signal());
  const redirected = await controller.action(
    starterPlan('open result two', again.state).action!,
    signal(),
  );
  expect(redirected.state.browser?.url).toBe(origin + '/search');
  expect(redirected.summary).toContain('sent me back to the search results');
});
it('follows a job search result into Apply, keeps a new-tab form controlled, and never submits it', async () => {
  let submitted = false;
  const navigation = Array.from(
    { length: 72 },
    (_, i) => `<a href="/menu?item=${i}">Menu ${i}</a>`,
  ).join('');
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/search')
      res.end(
        `<html><title>Job search</title><body>${navigation}<div id="b_results"><div class="b_algo"><h2><a href="/job">Library assistant opening</a></h2><div class="b_caption"><p>Local accessible work</p></div></div></div></body></html>`,
      );
    else if (req.url === '/job')
      res.end(
        `<html><title>Library assistant opening</title><body>${navigation}<h1>Library assistant</h1><a href="/application" target="_blank">Apply now</a></body></html>`,
      );
    else if (req.url === '/popup-job')
      res.end(
        "<html><title>Popup job</title><body><button onclick=\"window.open('/application', '_blank')\">Apply now</button></body></html>",
      );
    else if (req.url === '/application')
      res.end(
        '<html><title>Library job application</title><body><h1>Apply for Library assistant</h1><form action="/submitted" method="post"><label>Email<input name="email" type="email"></label><label>Why this job?<textarea name="motivation"></textarea></label><button type="button" onclick="location.href=\'/submitted\'">Apply now</button><button>Submit application</button></form></body></html>',
      );
    else if (req.url === '/submitted') {
      submitted = true;
      res.end('submitted');
    } else res.end('<html><title>Menu</title></html>');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { controller } = await setup({
    headless: true,
    validateUrl: async (url) => {
      if (new URL(url).origin !== origin) throw new Error('Test origin only');
      return url;
    },
  });
  const search = await controller.action({ tool: 'navigate', url: origin + '/search' }, signal());
  const pick = starterPlan('apply to the first job', search.state);
  expect(pick.action).toMatchObject({ tool: 'openSearchResult', index: 1 });
  expect(starterPlan('open the first job', search.state).action).toMatchObject({
    tool: 'openSearchResult',
    index: 1,
  });
  const job = await controller.action(pick.action!, signal());
  expect(job.state.browser?.title).toBe('Library assistant opening');
  const apply = job.state.browser!.controls.find((control) => control.name === 'Apply now');
  expect(apply).toMatchObject({ role: 'link', blocked: false });
  const open = starterPlan('click apply', job.state);
  expect(open.action).toMatchObject({ tool: 'click', controlId: apply!.id });
  const application = await controller.action(open.action!, signal());
  expect(application.state.browser?.url).toBe(origin + '/application');
  expect(application.summary).toContain('I found text fields:');
  expect(application.summary).toContain('I will not submit');
  const submitControls = application.state.browser!.controls.filter((control) =>
    ['Apply now', 'Submit application'].includes(control.name),
  );
  expect(submitControls).toHaveLength(2);
  expect(submitControls.every((control) => control.blocked)).toBe(true);
  for (const submit of submitControls) {
    const blocked = await controller.action(
      { tool: 'click', controlId: submit.id, pageId: application.state.browser!.id },
      signal(),
    );
    expect(blocked.summary).toContain('Stopped for review');
  }
  expect(submitted).toBe(false);
  const staged = await controller.request('Fill Email with person@example.test', signal());
  expect(staged.summary).toContain('confirm fill');
  const filled = await controller.request('confirm fill', signal());
  expect(filled.summary).toContain('Filled Email');
  expect(submitted).toBe(false);
  const popupJob = await controller.action(
    { tool: 'navigate', url: origin + '/popup-job' },
    signal(),
  );
  const popupPlan = starterPlan('click apply', popupJob.state);
  const popupResult = await controller.action(popupPlan.action!, signal());
  expect(popupResult.state.browser?.url).toBe(origin + '/application');
  expect(submitted).toBe(false);
});
it('uses actual page controls, rejects stale references, stops purchases, and confirms personal fields', async () => {
  let purchased = false;
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/detail')
      res.end(
        '<html><title>Book details</title><body><h1>The real test book</h1><p>In stock: 7</p><button onclick="location.href=\'/purchase\'">Place order</button><label>Email<input name="email" oninput="document.title=this.value"></label></body></html>',
      );
    else if (req.url === '/purchase') {
      purchased = true;
      res.end('Purchase should never happen');
    } else
      res.end(
        '<html><title>Practice catalog</title><body><h1>Catalog</h1><a href="/detail">Test book</a></body></html>',
      );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { controller } = await setup({
    headless: true,
    validateUrl: async (url) => {
      if (new URL(url).origin !== origin) throw new Error('Test origin only');
      return url;
    },
  });
  const start = await controller.action({ tool: 'navigate', url: origin }, signal());
  expect(start.state.browser!.title).toBe('Practice catalog');
  expect(start.state.browser!.image).toMatch(/^data:image\/png/);
  const link = start.state.browser!.controls.find((c) => c.name === 'Test book')!;
  const clicked = await controller.action(
    { tool: 'click', controlId: link.id, pageId: start.state.browser!.id },
    signal(),
  );
  expect(clicked.state.browser!.text).toContain('In stock: 7');
  await expect(
    controller.action(
      { tool: 'click', controlId: link.id, pageId: start.state.browser!.id },
      signal(),
    ),
  ).rejects.toThrow('page changed');
  const buy = clicked.state.browser!.controls.find((c) => c.name === 'Place order')!;
  expect(buy.blocked).toBe(true);
  const result = await controller.action(
    { tool: 'click', controlId: buy.id, pageId: clicked.state.browser!.id },
    signal(),
  );
  expect(result.summary).toContain('Stopped for review');
  expect(purchased).toBe(false);
  const staged = await controller.request('Fill Email with personal@example.test', signal());
  expect(staged.summary).toContain('confirm fill');
  expect(staged.state.browser?.title).toBe('Book details');
  const filled = await controller.request('confirm fill', signal());
  expect(filled.summary).toContain('form has not been submitted');
  expect(filled.state.browser?.title).toBe('personal@example.test');
  expect(purchased).toBe(false);
});
it.skipIf(!config().pythonBin)(
  'Stop terminates running Python and cannot fabricate a completed result',
  async () => {
    const { controller } = await setup({}, { hfToken: 'test-token' });
    await controller.demoFolder();
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
                      filename: 'loop.py',
                      code: 'while True:\n    pass\n',
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    await controller.action({ tool: 'createCode', request: 'loop' }, signal());
    const run = controller.action({ tool: 'runCode' }, signal());
    const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(controller.snapshot().code!.status).toBe('running'));
    await controller.stop();
    await rejected;
    expect(controller.snapshot().code!.status).toBe('cancelled');
    expect(controller.snapshot().code!.exitCode).not.toBe(0);
  },
);
it('validates model plans before acting and treats page text as observations', async () => {
  const { controller, cfg } = await setup({}, { hfToken: 'test-token' });
  const mock = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"action":{"tool":"runShell","command":"whoami"},"clarification":null}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', mock);
  await expect(computerPlan('do something', controller.snapshot(), cfg, signal())).rejects.toThrow(
    'invalid action',
  );
  expect(JSON.parse(mock.mock.calls[0][1]!.body as string).messages[0].content).toContain(
    'UNTRUSTED',
  );
});
it('Stop cancels an in-flight browser navigation without reporting success', async () => {
  let requested = false;
  const server = createServer((_req, res) => {
    requested = true;
    res.on('close', () => {});
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { controller } = await setup({
    headless: true,
    validateUrl: async (url) => {
      if (new URL(url).origin !== origin) throw new Error('Test origin only');
      return url;
    },
  });
  const pending = controller.action({ tool: 'navigate', url: origin }, signal());
  const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(requested).toBe(true), { timeout: 5000 });
  await controller.stop();
  await assertion;
  expect(controller.snapshot().browser).toBeNull();
});
it('uploads only the explicitly selected image to the configured vision model', async () => {
  const { controller, cfg } = await setup({}, { hfToken: 'test-token' });
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7cAAAAASUVORK5CYII=';
  await controller.selectScreen('Test window', image);
  const fetchMock = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'A small test image is visible.' } }] }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await controller.action({ tool: 'describeScreen' }, signal());
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(body.model).toBe(cfg.hfVisionModel);
  expect(body.messages[1].content[1].image_url.url).toBe(image);
  expect(result.state.screen!.description).toBe('A small test image is visible.');
  expect(controller.clearScreen().screen).toBeNull();
  const missing = await setup();
  await missing.controller.selectScreen('Test window', image);
  await expect(missing.controller.action({ tool: 'describeScreen' }, signal())).rejects.toThrow(
    'HF_TOKEN',
  );
  expect(missing.controller.snapshot().screen!.description).toBeNull();
});
it('locates only a confident navigation control and signs a one-use native click', async () => {
  const { controller, cfg } = await setup({}, { hfToken: 'test-token' });
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7cAAAAASUVORK5CYII=';
  await controller.selectScreen('Main display', image);
  const locate = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  found: true,
                  x: 420,
                  y: 620,
                  observedText: 'Apply now',
                  context: 'listing',
                  actionType: 'navigation',
                  confidence: 0.94,
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', locate);
  expect(starterPlan('click the Apply button on my screen', controller.snapshot()).action).toEqual({
    tool: 'locateScreenTarget',
    target: 'the Apply button',
  });
  const located = await controller.action(
    { tool: 'locateScreenTarget', target: 'Apply button' },
    signal(),
  );
  expect(located.pointer).toMatchObject({
    x: 0.42,
    y: 0.62,
    target: 'Apply button',
    observedText: 'Apply now',
    context: 'listing',
  });
  const require = createRequire(import.meta.url);
  const { verifyPointerAuthorization } = require('../electron/native-pointer.cjs');
  const input = located.pointer!;
  const bridgeKey = await readFile(path.join(cfg.localDir, 'desktop-bridge-key'), 'utf8');
  const capture = { imageHash: createHash('sha256').update(image).digest('hex') };
  const used = new Map<string, number>();
  expect(() =>
    verifyPointerAuthorization(capture, input, input.authorization, bridgeKey, used),
  ).not.toThrow();
  expect(() =>
    verifyPointerAuthorization(capture, input, input.authorization, bridgeKey, used),
  ).toThrow('already used');
  expect(() =>
    verifyPointerAuthorization(
      capture,
      { ...input, observedText: 'Submit application' },
      input.authorization,
      bridgeKey,
      new Map(),
    ),
  ).toThrow('does not match');
  const body = JSON.parse(locate.mock.calls[0][1]!.body as string);
  expect(body.messages[1].content[1].image_url.url).toBe(image);
  await expect(
    controller.action({ tool: 'locateScreenTarget', target: 'Submit application' }, signal()),
  ).rejects.toThrow('cannot click');
  locate.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  found: true,
                  x: 0.42,
                  y: 0.62,
                  observedText: 'Apply now',
                  context: 'form',
                  actionType: 'navigation',
                  confidence: 0.94,
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  const onForm = await controller.action(
    { tool: 'locateScreenTarget', target: 'Apply button' },
    signal(),
  );
  expect(onForm.pointer).toBeUndefined();
  expect(onForm.summary).toContain('Nothing was clicked');
});
