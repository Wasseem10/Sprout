import { it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  expect(starterPlan('order everything and pay for it', controller.snapshot()).clarification)
    .toContain('cannot place orders');
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
  expect(starterPlan('Open Google and search for accessible Python tutorials', state).action).toEqual({
    tool: 'search',
    query: 'accessible Python tutorials',
  });
  expect(starterPlan('Search Google for bus schedules and read the results to me', state).action)
    .toEqual({ tool: 'search', query: 'bus schedules' });
  expect(starterPlan('Open Google and search accessible Python tutorials', state).action)
    .toEqual({ tool: 'search', query: 'accessible Python tutorials' });
});
it('regenerates Python when the model uses an unsupported main guard', async () => {
  const { cfg } = await setup({}, { hfToken: 'test-token' });
  const codes = [
    'if __name__ == "__main__":\n    print(1)',
    'for n in range(1, 4):\n    print(n * n)',
  ];
  const mock = vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ filename: 'squares.py', code: codes.shift() }) } }],
  }), { status: 200 }));
  vi.stubGlobal('fetch', mock);
  const result = await generateCode('print squares', cfg, signal());
  expect(result.code).toContain('print(n * n)');
  expect(result.code).not.toContain('__name__');
  expect(mock).toHaveBeenCalledTimes(2);
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
  const redirected = await controller.action(starterPlan('open result two', again.state).action!, signal());
  expect(redirected.state.browser?.url).toBe(origin + '/search');
  expect(redirected.summary).toContain('sent me back to the search results');
});
it('uses actual page controls, rejects stale references, and stops before purchase or personal data', async () => {
  let purchased = false;
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/detail')
      res.end(
        '<html><title>Book details</title><body><h1>The real test book</h1><p>In stock: 7</p><button onclick="location.href=\'/purchase\'">Place order</button><label>Email<input name="email"></label></body></html>',
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
  const email = clicked.state.browser!.controls.find((c) => c.name === 'Email')!;
  const blocked = await controller.action(
    {
      tool: 'fill',
      controlId: email.id,
      pageId: clicked.state.browser!.id,
      value: 'personal@example.test',
    },
    signal(),
  );
  expect(blocked.summary).toContain('Stopped for review');
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
