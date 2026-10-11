import { describe, expect, it } from 'vitest';
import {
  SproutPresenceCoordinator,
  SPROUT_IDLE_MS,
  SPROUT_JOY_MS,
  SPROUT_WAKE_MS,
  type PresenceContext,
} from '../src/sproutPresence';

const idle: PresenceContext = {
  working: false,
  connecting: false,
  transcribing: false,
  utteranceActive: false,
  speechRevision: 0,
  output: null,
  visible: true,
  canCelebrate: true,
};

describe('automatic Sprout presence', () => {
  it('starts awake with an exact eligible inactivity deadline; pause is applied after media stops', () => {
    const model = new SproutPresenceCoordinator(0);
    expect(model.update(idle, SPROUT_IDLE_MS - 1)).toBe(false);
    expect(model.update(idle, SPROUT_IDLE_MS)).toBe(true);
    expect(model.getSnapshot().presence).toBe('awake');
    model.pause(SPROUT_IDLE_MS, false);
    expect(model.getSnapshot().presence).toBe('asleep');
    expect(model.update(idle, SPROUT_IDLE_MS * 2)).toBe(false);
  });

  it('resets meaningful activity but not repeated context/noise/hover observations', () => {
    const model = new SproutPresenceCoordinator(0);
    for (let now = 1; now < 119_999; now += 800) model.update({ ...idle }, now);
    model.activity(119_999);
    expect(model.update(idle, 120_000)).toBe(false);
    expect(model.update(idle, 239_999)).toBe(true);
  });

  it.each(['working', 'connecting', 'transcribing', 'utteranceActive'] as const)(
    'never sleeps during %s; starts a fresh window afterward',
    (key) => {
      const model = new SproutPresenceCoordinator(0);
      expect(model.update({ ...idle, [key]: true }, 120_000)).toBe(false);
      expect(model.getSnapshot().deadline).toBeNull();
      model.update(idle, 240_000);
      expect(model.update(idle, 359_999)).toBe(false);
      expect(model.update(idle, 360_000)).toBe(true);
    },
  );

  it.each(['pending', 'playing'] as const)('never sleeps during %s reply output', (state) => {
    const model = new SproutPresenceCoordinator(0);
    const context = { ...idle, output: { generation: 1, replyId: 'reply', state } };
    expect(model.update(context, 120_000)).toBe(false);
    model.update(
      { ...context, output: { ...context.output, state: 'settled', reason: 'ended' } },
      130_000,
    );
    expect(model.getSnapshot().deadline).toBe(250_000);
  });

  it('manual pause defers rest through work and one fresh completion, then sleeps', () => {
    const model = new SproutPresenceCoordinator(0);
    model.pause(500, true);
    model.update({ ...idle, working: true }, 600);
    expect(model.getSnapshot().presence).toBe('awake');
    model.acceptCompletion('task:1', null, 0);
    model.update(idle, 700);
    expect(model.getSnapshot().joy?.id).toBe('task:1');
    expect(model.getSnapshot().pendingRest).toBe(true);
    model.update(idle, 700 + SPROUT_JOY_MS);
    expect(model.getSnapshot().presence).toBe('asleep');
    expect(model.getSnapshot().joy).toBeUndefined();
  });

  it.each([{ canCelebrate: false }, { visible: false }])(
    'rest settles without a renderer completion callback when motion is skipped: %s',
    (patch) => {
      const model = new SproutPresenceCoordinator(0);
      model.pause(100, true);
      model.acceptCompletion('task', null, 0);
      model.update({ ...idle, ...patch }, 200);
      expect(model.getSnapshot().presence).toBe('asleep');
      expect(model.getSnapshot().completionId).toBeNull();
      expect(model.getSnapshot().joy).toBeUndefined();
    },
  );

  it('explicit wake preserves the capture-start bridge; real work preempts it', () => {
    const model = new SproutPresenceCoordinator(0);
    model.pause(100, false);
    model.activity(200, true, true);
    model.update({ ...idle, connecting: true }, 200);
    expect(model.getSnapshot().wake).toBeDefined();
    model.update(idle, 300);
    expect(model.getSnapshot().wake).toBeDefined();
    model.update({ ...idle, working: true }, 400);
    expect(model.getSnapshot().wake).toBeUndefined();
    expect(model.getSnapshot().pendingRest).toBe(false);
  });

  it('panel interaction does not wake, but typing does; no media resources are owned here', () => {
    const model = new SproutPresenceCoordinator(0);
    model.pause(100, false);
    model.activity(200);
    expect(model.getSnapshot().presence).toBe('asleep');
    model.activity(300, true, true);
    expect(model.getSnapshot().presence).toBe('awake');
    model.update(idle, 300 + SPROUT_WAKE_MS);
    expect(model.getSnapshot().wake).toBeUndefined();
    expect(model.getSnapshot().deadline).toBe(300 + SPROUT_IDLE_MS);
  });

  it('holds completion until the matching long final reply ends, not acknowledgment or Promise start', () => {
    const model = new SproutPresenceCoordinator(0);
    model.acceptCompletion('task:2', 'reply:2', 1);
    const acknowledgment = {
      ...idle,
      output: { generation: 1, replyId: null, state: 'settled' as const, reason: 'ended' },
    };
    model.update(acknowledgment, 100);
    expect(model.getSnapshot().joy).toBeUndefined();
    const output = { generation: 2, replyId: 'reply:2', state: 'pending' as const };
    model.update({ ...idle, output }, 101);
    model.update({ ...idle, output: { ...output, state: 'playing' } }, 100_000);
    expect(model.getSnapshot().completionId).toBe('task:2');
    model.update({ ...idle, output: { ...output, state: 'settled', reason: 'ended' } }, 200_000);
    expect(model.getSnapshot().joy?.id).toBe('task:2');
    model.update(idle, 200_000 + SPROUT_JOY_MS);
    model.update(idle, 202_000);
    expect(model.getSnapshot().joy).toBeUndefined();
  });

  it.each(['skipped', 'error'])(
    'successful work may celebrate after a %s final reply',
    (reason) => {
      const model = new SproutPresenceCoordinator(0);
      model.acceptCompletion('success', 'reply', 0);
      model.update(
        { ...idle, output: { generation: 1, replyId: 'reply', state: 'settled', reason } },
        10,
      );
      expect(model.getSnapshot().joy?.id).toBe('success');
    },
  );

  it.each(['paused', 'cancelled', 'interrupted', 'superseded'])(
    'drops completion when reply is %s',
    (reason) => {
      const model = new SproutPresenceCoordinator(0);
      model.acceptCompletion('success', 'reply', 0);
      model.update(
        { ...idle, output: { generation: 1, replyId: 'reply', state: 'settled', reason } },
        10,
      );
      expect(model.getSnapshot().joy).toBeUndefined();
      expect(model.getSnapshot().completionId).toBeNull();
    },
  );

  it('speech supersedes pending or active joy; explicit pause absorbs earlier unflushed speech', () => {
    const model = new SproutPresenceCoordinator(0);
    model.acceptCompletion('task', null, 0);
    model.update(idle, 100);
    expect(model.getSnapshot().joy).toBeDefined();
    model.update({ ...idle, speechRevision: 1, utteranceActive: true }, 200);
    expect(model.getSnapshot().joy).toBeUndefined();
    model.pause(300, false, 2);
    model.update({ ...idle, speechRevision: 2 }, 301);
    expect(model.getSnapshot().presence).toBe('asleep');
  });

  it('a newer unrelated output or hidden surface cannot replay stale completion', () => {
    const model = new SproutPresenceCoordinator(0);
    model.acceptCompletion('task', 'reply', 1);
    model.update({ ...idle, output: { generation: 2, replyId: 'other', state: 'playing' } }, 10);
    expect(model.getSnapshot().completionId).toBeNull();
    model.acceptCompletion('next-task', null, 2);
    model.update({ ...idle, visible: false }, 20);
    model.update(idle, 30);
    expect(model.getSnapshot().joy).toBeUndefined();
  });
});
