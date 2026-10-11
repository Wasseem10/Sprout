import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';

const controllers: ComputerController[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const c of controllers.splice(0)) await c.close();
});
async function setup() {
  const c = new ComputerController({
    ...config(),
    host: '127.0.0.1',
    hfToken: 'test',
    cloudUrl: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-screen-goal-')),
  });
  controllers.push(c);
  await c.init();
  const png = await readFile(path.resolve('artifacts/workspace.png'));
  await c.selectScreen('Test display', `data:image/png;base64,${png.toString('base64')}`);
  return c;
}
function modelReplies(replies: unknown[]) {
  const calls: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(replies.shift()) } }] }),
        { status: 200 },
      );
    }),
  );
  return calls;
}
const location = {
  found: true,
  x: 400,
  y: 500,
  observedText: 'Demo link',
  context: 'desktop',
  actionType: 'navigation',
  confidence: 0.99,
};
it('grounds the next named click and coordinates in one vision request and returns a signed pointer', async () => {
  const c = await setup(),
    calls = modelReplies([
      { ...location, decision: 'click', target: 'Demo link', message: 'Open the demo page' },
    ]);
  const result = await c.action(
    { tool: 'nextScreenStep', goal: 'Open the Demo link on my screen', history: [] },
    new AbortController().signal,
  );
  expect(calls).toHaveLength(1);
  expect(result.screenStep?.decision).toBe('click');
  expect(result.pointer).toMatchObject({ x: 0.4, y: 0.5, target: 'Demo link' });
  expect(result.pointer?.authorization.proof).toMatch(/^[a-f0-9]{64}$/);
  expect(calls[0].messages[0].content).toContain('FRESH screenshot');
});
it('rejects a destructive target even if the goal model proposes it', async () => {
  const c = await setup(),
    calls = modelReplies([
      {
        ...location,
        decision: 'click',
        target: 'Delete',
        observedText: 'Delete',
        message: 'Remove this',
      },
    ]);
  await expect(
    c.action(
      { tool: 'nextScreenStep', goal: 'Open the menu', history: [] },
      new AbortController().signal,
    ),
  ).rejects.toThrow('destructive');
  expect(calls).toHaveLength(1);
});
it('returns a clarification instead of a click when the locator finds an ambiguous control', async () => {
  const c = await setup();
  modelReplies([
    {
      decision: 'click',
      target: 'Next',
      message: 'Open the next page',
      found: false,
      x: 0,
      y: 0,
      observedText: 'none',
      context: 'other',
      actionType: 'unknown',
      confidence: 0,
    },
  ]);
  const result = await c.action(
    { tool: 'nextScreenStep', goal: 'Open the next page', history: [] },
    new AbortController().signal,
  );
  expect(result.pointer).toBeUndefined();
  expect(result.screenStep?.decision).toBe('ask');
  expect(result.clarification).toBe(true);
});
it('pauses a pending navigation task when the user interrupts between actions', async () => {
  const c = await setup();
  modelReplies([{ decision: 'scroll', direction: 'down', message: 'Look below' }]);
  await c.action(
    { tool: 'nextScreenStep', goal: 'Find the chart below', history: [] },
    new AbortController().signal,
  );
  expect(c.snapshot().task?.status).toBe('running');
  expect((await c.interrupt()).task?.status).toBe('paused');
});
it('enforces the action budget on the backend before issuing another signed pointer', async () => {
  const c = await setup(),
    calls = modelReplies([
      {
        ...location,
        decision: 'click',
        target: 'Next',
        observedText: 'Next',
        message: 'Go forward',
      },
    ]);
  const result = await c.action(
    { tool: 'nextScreenStep', goal: 'Find the chart', history: Array(6).fill('Clicked Next') },
    new AbortController().signal,
  );
  expect(result.screenStep?.decision).toBe('ask');
  expect(result.pointer).toBeUndefined();
  expect(result.state.task?.status).toBe('waiting');
  expect(calls).toHaveLength(1);
});
