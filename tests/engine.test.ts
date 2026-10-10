import { it, expect, vi } from 'vitest';
import { TaskEngine, WorkflowRegistry, type WorkflowModule } from '../shared/engine';
import { emptyWorkspace, planSchema, type Plan, type ToolResult } from '../shared/schema';
const simple: Plan = { actions: [{ tool: 'inspectDataset', args: {} }], clarification: null };
function setup(execute: WorkflowModule['execute']) {
  const registry = new WorkflowRegistry();
  registry.register({
    id: 'data',
    label: 'Test',
    schemaVersion: 1,
    supportedTools: ['inspectDataset'],
    execute,
    serialize: (s) => s,
    restore: () => emptyWorkspace(),
    artifactSummary: () => '',
  });
  return new TaskEngine(registry);
}
it('never commits a cancelled tool that ignores its abort signal', async () => {
  let resolve!: (r: ToolResult) => void;
  const engine = setup(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
    commit = vi.fn();
  const running = engine.run(
    'test',
    emptyWorkspace(),
    async () => simple,
    () => {},
    commit,
  );
  const assertion = expect(running).rejects.toMatchObject({ name: 'AbortError' });
  await new Promise((r) => setTimeout(r, 0));
  engine.stop();
  resolve({
    state: { ...emptyWorkspace(), title: 'stale' },
    summary: 'done',
    changed: true,
    references: [],
  });
  await assertion;
  expect(commit).not.toHaveBeenCalled();
  expect(engine.busy).toBe(false);
});
it('prevents overlapping requests and commits only observed results', async () => {
  let finish!: () => void;
  const engine = setup(async (a, state) => {
    await new Promise<void>((r) => {
      finish = r;
    });
    return {
      state: { ...state, title: 'observed' },
      summary: 'verified',
      changed: true,
      references: [],
    };
  });
  const commit = vi.fn();
  const run = engine.run(
    'one',
    emptyWorkspace(),
    async () => simple,
    () => {},
    commit,
  );
  await new Promise((r) => setTimeout(r, 0));
  await expect(
    engine.run(
      'two',
      emptyWorkspace(),
      async () => simple,
      () => {},
      commit,
    ),
  ).rejects.toThrow(/already running/);
  finish();
  await run;
  expect(commit).toHaveBeenCalledOnce();
  expect(commit.mock.calls[0][0].title).toBe('observed');
});
it('a failed later tool cannot commit earlier draft changes', async () => {
  let calls = 0;
  const engine = setup(async (a, state) => {
    if (++calls === 2) throw new Error('failed');
    return { state: { ...state, title: 'draft' }, summary: 'first', changed: true, references: [] };
  });
  const commit = vi.fn();
  await expect(
    engine.run(
      'test',
      emptyWorkspace(),
      async () => ({ actions: [simple.actions[0], simple.actions[0]], clarification: null }),
      () => {},
      commit,
    ),
  ).rejects.toThrow('failed');
  expect(commit).not.toHaveBeenCalled();
});
it('rejects unregistered actions and inappropriate generated arguments', () => {
  expect(() =>
    planSchema.parse({
      actions: [{ tool: 'executeShell', args: { command: 'delete' } }],
      clarification: null,
    }),
  ).toThrow();
  expect(() =>
    planSchema.parse({
      actions: [{ tool: 'inspectDataset', args: { topN: 3 } }],
      clarification: null,
    }),
  ).toThrow();
  expect(() =>
    planSchema.parse({
      actions: [{ tool: 'updateChart', args: { topN: 0 } }],
      clarification: null,
    }),
  ).toThrow();
});
