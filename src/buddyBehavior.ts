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
