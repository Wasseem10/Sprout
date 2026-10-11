import { it, expect, vi } from 'vitest';
import { runScreenNavigation, screenNavigationGoal } from '../src/screenNavigation';
import { screenDecisionSchema } from '../server/computer/screen-goal';
import type { ComputerResult, ComputerState } from '../shared/computer';

const state: ComputerState = { folder: null, code: null, browser: null, screen: null };
const pointer = {
  x: 0.4,
  y: 0.4,
  target: 'News',
  observedText: 'News',
  context: 'other' as const,
  authorization: { nonce: 'test', expiresAt: 1, proof: 'test' },
};
function controls(decisions: ComputerResult[], images = ['before', 'after', 'end']) {
  let frame = 0;
  return {
    capture: vi.fn(async () => ({
      image: images[frame++] ?? images.at(-1)!,
      name: 'display',
      captureId: `capture-${frame}`,
    })),
    observe: vi.fn(async () => state),
    decide: vi.fn(async (_goal: string, _history: string[], _signal: AbortSignal) =>
      decisions.shift()!,
    ),
    click: vi.fn(async (_capture: { captureId: string }, _pointer: typeof pointer) => ({
      target: 'News',
    })),
    scroll: vi.fn(async (_direction: 'up' | 'down') => undefined),
    phase: vi.fn(),
    settle: vi.fn(async () => undefined),
  };
}
it('captures after each action and passes only completed actions into the next decision', async () => {
  const c = controls([
    { state, summary: 'News', pointer, screenStep: { decision: 'click', target: 'News' } },
    { state, summary: 'Scroll', screenStep: { decision: 'scroll', direction: 'down' } },
    { state, summary: 'The news page is visible.', screenStep: { decision: 'done' } },
  ]);
  const result = await runScreenNavigation(
    'Open News and scroll down',
    c,
    new AbortController().signal,
  );
  expect(c.capture).toHaveBeenCalledTimes(3);
  expect(c.click.mock.calls[0][0].captureId).toBe('capture-1');
  expect(c.decide.mock.calls.map((call) => call[1])).toEqual([
    [],
    ['Clicked News'],
    ['Clicked News', 'Scrolled down'],
  ]);
  expect(result.summary).toContain('visible');
});
it('stops if the screen did not change rather than repeating a click', async () => {
  const c = controls(
    [{ state, summary: 'News', pointer, screenStep: { decision: 'click' } }],
    ['same', 'same'],
  );
  const result = await runScreenNavigation('Open News', c, new AbortController().signal);
  expect(result.clarification).toBe(true);
  expect(result.summary).toContain('did not visibly change');
  expect(c.click).toHaveBeenCalledTimes(1);
  expect(c.decide).toHaveBeenCalledTimes(1);
});
it('does not act after interruption during a model decision', async () => {
  const abort = new AbortController(),
    c = controls([]);
  c.decide.mockImplementation(async () => {
    abort.abort();
    return { state, summary: 'News', pointer, screenStep: { decision: 'click' } };
  });
  await expect(runScreenNavigation('Open News', c, abort.signal)).rejects.toThrow();
  expect(c.click).not.toHaveBeenCalled();
});
it('caps navigation at six actions with a final fresh observation', async () => {
  const c = controls(
    Array.from({ length: 7 }, () => ({
      state,
      summary: 'Scroll',
      screenStep: { decision: 'scroll' as const, direction: 'down' as const },
    })),
    Array.from({ length: 7 }, (_, i) => `frame${i}`),
  );
  const result = await runScreenNavigation(
    'Find the bottom of this page',
    c,
    new AbortController().signal,
  );
  expect(c.scroll).toHaveBeenCalledTimes(6);
  expect(c.capture).toHaveBeenCalledTimes(7);
  expect(result.clarification).toBe(true);
  expect(result.pointer).toBeUndefined();
});
it('recognizes explicit screen goals without intercepting ordinary deck or browser tasks', () => {
  expect(screenNavigationGoal('Navigate to the News tab and scroll down')).toContain('News');
  expect(screenNavigationGoal('Click News then Company on my screen')).toContain('Company');
  expect(screenNavigationGoal('Research solar panels online and make a PowerPoint')).toBeNull();
  expect(
    screenDecisionSchema.safeParse({ decision: 'type', text: 'hello', message: 'typing' }).success,
  ).toBe(false);
});
