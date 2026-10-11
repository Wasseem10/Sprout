/** Application presence, independent of animation availability and media ownership. */
export const SPROUT_IDLE_MS = 120_000;
export const SPROUT_JOY_MS = 1_700;
export const SPROUT_WAKE_MS = 1_250;

export type PresenceOutput = {
  generation: number;
  replyId: string | null;
  state: 'pending' | 'playing' | 'settled';
  reason?: string;
};
export type PresenceContext = {
  working: boolean;
  connecting: boolean;
  transcribing: boolean;
  utteranceActive: boolean;
  speechRevision: number;
  output: PresenceOutput | null;
  visible: boolean;
  canCelebrate: boolean;
};
export type PresenceSnapshot = {
  presence: 'awake' | 'asleep';
  pendingRest: boolean;
  revision: number;
  wake?: { id: string };
  joy?: { id: string };
  deadline: number | null;
  nextCheck: number | null;
  completionId: string | null;
};

type Completion = { id: string; replyId: string | null; outputGeneration: number };

/** All clock values are monotonic milliseconds supplied by the application. */
export class SproutPresenceCoordinator {
  private asleep = false;
  private rest = false;
  private revision = 0;
  private serial = 0;
  private wake: { id: string; until: number } | null = null;
  private joy: { id: string; until: number } | null = null;
  private completion: Completion | null = null;
  private deadline: number | null;
  private speechRevision = 0;
  private lastInteraction: number;
  private listeners = new Set<() => void>();
  private snapshot: PresenceSnapshot;

  constructor(now: number) {
    this.lastInteraction = now;
    this.deadline = now + SPROUT_IDLE_MS;
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private clearCues() {
    this.completion = null;
    this.joy = null;
    this.wake = null;
    this.revision++;
  }

  /** Hover/focus are intentionally never passed here. */
  activity(now: number, wake = false, supersede = false) {
    this.lastInteraction = now;
    if (supersede) this.clearCues();
    if (wake) {
      this.rest = false;
      if (this.asleep) {
        this.asleep = false;
        this.revision++;
        this.wake = { id: `wake-${++this.serial}`, until: now + SPROUT_WAKE_MS };
      }
    }
    if (!this.asleep) this.deadline = now + SPROUT_IDLE_MS;
    this.publish();
  }

  /** Called only AFTER the voice owner has stopped media. */
  pause(now: number, working: boolean, speechRevision = this.speechRevision) {
    this.clearCues();
    this.speechRevision = speechRevision;
    this.lastInteraction = now;
    this.rest = true;
    this.asleep = !working;
    this.deadline = null;
    this.publish();
  }

  /** Stop/new canvas/hidden surface discard one-shots, never start media. */
  dismiss(now: number) {
    this.clearCues();
    if (!this.asleep) this.deadline = now + SPROUT_IDLE_MS;
    this.publish();
  }

  acceptCompletion(id: string, replyId: string | null, outputGeneration: number) {
    this.completion = { id, replyId, outputGeneration };
    this.publish();
  }

  private blocked(context: PresenceContext) {
    return (
      context.working ||
      context.connecting ||
      context.transcribing ||
      context.utteranceActive ||
      context.output?.state === 'pending' ||
      context.output?.state === 'playing'
    );
  }

  /** Returns a media-pause command. The caller must re-read media state before applying it. */
  update(context: PresenceContext, now: number): boolean {
    if (context.speechRevision !== this.speechRevision) {
      this.speechRevision = context.speechRevision;
      this.activity(now, true, true);
    }
    if (!context.visible) {
      if (this.completion || this.joy) this.clearCues();
    }
    if (this.wake && this.wake.until <= now) this.wake = null;
    if (this.joy && this.joy.until <= now) this.joy = null;
    const liveInterrupt =
      context.working ||
      context.utteranceActive ||
      context.transcribing ||
      context.output?.state === 'playing';
    if (liveInterrupt) {
      if (this.joy) {
        this.joy = null;
        this.revision++;
      }
      if (this.wake) {
        this.wake = null;
        this.revision++;
      }
    }
    if (this.completion?.replyId) {
      const output = context.output;
      const matches = output?.replyId === this.completion.replyId;
      if (
        (matches &&
          output?.state === 'settled' &&
          ['paused', 'cancelled', 'interrupted', 'superseded'].includes(output.reason ?? '')) ||
        (output && !matches && output.generation > this.completion.outputGeneration)
      ) {
        this.completion = null;
      }
    }
    const completion = this.completion;
    const replySettled =
      completion &&
      (!completion.replyId ||
        (context.output?.replyId === completion.replyId && context.output.state === 'settled'));
    if (completion && replySettled && !this.blocked(context) && !this.wake) {
      this.completion = null;
      if (context.visible && context.canCelebrate) {
        this.asleep = false;
        this.joy = { id: completion.id, until: now + SPROUT_JOY_MS };
      }
    }
    if (this.rest && !this.blocked(context) && !this.completion && !this.joy) {
      if (!this.asleep) this.revision++;
      this.asleep = true;
      this.wake = null;
    }
    const blocked = this.blocked(context) || !!this.wake || !!this.joy || !!this.completion;
    if (this.asleep || blocked) this.deadline = null;
    else if (this.deadline === null) this.deadline = now + SPROUT_IDLE_MS;
    const due =
      !this.asleep &&
      !blocked &&
      this.deadline !== null &&
      now >= this.deadline &&
      now >= this.lastInteraction + SPROUT_IDLE_MS;
    this.publish();
    return due;
  }

  private buildSnapshot(): PresenceSnapshot {
    const checks = [this.deadline, this.wake?.until, this.joy?.until].filter(
      (value): value is number => value != null,
    );
    return {
      presence: this.asleep ? 'asleep' : 'awake',
      pendingRest: this.rest,
      revision: this.revision,
      wake: this.wake ? { id: this.wake.id } : undefined,
      joy: this.joy ? { id: this.joy.id } : undefined,
      deadline: this.deadline,
      nextCheck: checks.length ? Math.min(...checks) : null,
      completionId: this.completion?.id ?? null,
    };
  }

  private publish() {
    const next = this.buildSnapshot();
    const previous = this.snapshot;
    if (
      previous.presence === next.presence &&
      previous.pendingRest === next.pendingRest &&
      previous.revision === next.revision &&
      previous.wake?.id === next.wake?.id &&
      previous.joy?.id === next.joy?.id &&
      previous.deadline === next.deadline &&
      previous.nextCheck === next.nextCheck &&
      previous.completionId === next.completionId
    )
      return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
