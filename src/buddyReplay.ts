import type { BuddyVisualState } from './AssistantSignal';
import type { SproutMotionController, SproutMotionSnapshot } from './buddyMotionController';

export type BuddyReplayEvent = { at: number } & (
  | { kind: 'phase'; phase: BuddyVisualState }
  | { kind: 'click' }
  | { kind: 'blink' }
  | { kind: 'gaze'; x: number; y: number }
  | { kind: 'motion'; moving: boolean }
);

/** Simulated test inputs only. No provider, microphone or task calls. */
export const SPROUT_REPLAY: BuddyReplayEvent[] = [
  { at: 0, kind: 'phase', phase: 'idle' },
  { at: 12, kind: 'click' },
  { at: 12.15, kind: 'phase', phase: 'listening' },
  { at: 12.5, kind: 'blink' },
  { at: 12.5, kind: 'gaze', x: 0.7, y: 0.3 },
  { at: 13, kind: 'phase', phase: 'idle' },
  { at: 13.15, kind: 'phase', phase: 'listening' },
  { at: 13.3, kind: 'phase', phase: 'idle' },
  { at: 14, kind: 'motion', moving: false },
  { at: 15, kind: 'motion', moving: true },
  { at: 15, kind: 'gaze', x: 0, y: 0 },
  { at: 15.5, kind: 'phase', phase: 'thinking' },
  { at: 16.3, kind: 'phase', phase: 'speaking' },
  { at: 17.3, kind: 'phase', phase: 'idle' },
  { at: 17.6, kind: 'blink' },
];
export const SPROUT_REPLAY_DURATION = 18.3;
export const REPLAY_SAMPLES = [
  0, 5.98, 6, 6.02, 11.98, 12, 12.15, 12.25, 12.5, 12.6, 13, 13.15, 13.3, 13.4, 13.6, 14, 14.5, 15,
  15.25, 15.5, 15.65, 16.3, 16.45, 17.3, 17.55, 17.6, 17.7, 18.2,
];

export function applyReplayEvent(controller: SproutMotionController, event: BuddyReplayEvent) {
  if (event.kind === 'phase') controller.setPhase(event.phase);
  else if (event.kind === 'click') controller.react('Sprout_Click');
  else if (event.kind === 'blink') controller.react('Sprout_Blink');
  else if (event.kind === 'gaze') controller.setGaze(event.x, event.y);
  else controller.setMotion(event.moving);
}

/** Split at events and capture times: different update rates deliver the same input timestamps. */
export function runSproutReplay<T = SproutMotionSnapshot>(
  controller: SproutMotionController,
  updatesPerSecond: number,
  capture: (controller: SproutMotionController) => T = (instance) => instance.snapshot() as T,
): { at: number; pose: T }[] {
  const boundaries = [
    ...new Set([...REPLAY_SAMPLES, ...SPROUT_REPLAY.map((event) => event.at)]),
  ].sort((a, b) => a - b);
  const result: { at: number; pose: T }[] = [];
  let now = 0;
  for (const boundary of boundaries) {
    while (now < boundary - 1e-10) {
      const delta = Math.min(1 / updatesPerSecond, boundary - now);
      controller.update(delta);
      now += delta;
    }
    for (const event of SPROUT_REPLAY)
      if (event.at === boundary) applyReplayEvent(controller, event);
    if (REPLAY_SAMPLES.includes(boundary)) result.push({ at: boundary, pose: capture(controller) });
  }
  return result;
}
