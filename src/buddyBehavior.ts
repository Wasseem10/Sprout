import type { AudioPresentationSample } from './audioPresentation';
import type { BuddyVisualState } from './AssistantSignal';

/** Persistent application intent. This never acquires or releases media resources. */
export type BuddyAutomaticBehavior = {
  presence: 'awake' | 'asleep';
  /** Supersession epoch: changed by pause, new work or another explicit interruption. */
  revision: number;
  wake?: { id: string };
  joy?: { id: string };
  /** Genuine input/work/playback, not a quiet open mic or microphone startup. */
  interrupt: boolean;
};

/** Read-only presentation inputs. This epoch never controls a task or voice resource. */
export type BuddyBehaviorInput = {
  generation: number;
  manualEligible: boolean;
  pendingInterruption?: boolean;
  /** Existing voice ref accessor; checked by the existing animation clock. */
  isInterrupted?: () => boolean;
  request?: { id: number; action: 'joy' | 'sleep' | 'wake' };
  /** Monotonic performance.now timestamp; the integration deduplicates real completions. */
  done?: { id: string; generation: number; issuedAt: number } | null;
  automatic?: BuddyAutomaticBehavior;
};

export type BuddyBehaviorMode = 'normal' | 'joy' | 'enter-sleep' | 'sleep' | 'wake' | 'recover';
export type BuddyBehaviorCapabilities = { joy: boolean; sleep: boolean; done: boolean };
export type BuddyBehaviorSnapshot = {
  mode: BuddyBehaviorMode;
  sleeping: boolean;
  moving: boolean;
  visible: boolean;
  capabilities: BuddyBehaviorCapabilities;
  doneActive: boolean;
  /** Normalized avatar-owner coordinates, only emitted at discrete state changes. */
  headAnchor: { x: number; y: number } | null;
  revision: number;
};

export const SPROUT_BEHAVIOR_CLIPS = [
  'Sprout_JoyJump',
  'Sprout_SleepEnter',
  'Sprout_SleepLoop',
  'Sprout_Wake',
  'Sprout_Done',
] as const;
export const NO_BUDDY_BEHAVIORS: BuddyBehaviorCapabilities = {
  joy: false,
  sleep: false,
  done: false,
};
export const DONE_CUE_LIFETIME_MS = 1000;
/** Pending TTS is not audible speech. Studio samples remain explicitly simulated. */
export function buddyPlaybackPhase(
  phase: BuddyVisualState,
  audio?: AudioPresentationSample,
): BuddyVisualState {
  return phase === 'speaking' && audio?.source === 'voice' && !audio.outputPlaying
    ? 'thinking'
    : phase;
}
