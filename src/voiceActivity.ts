export type VoiceOutputEndReason =
  'ended' | 'error' | 'skipped' | 'paused' | 'cancelled' | 'interrupted' | 'superseded';

export type VoiceOutputSnapshot = Readonly<{
  generation: number;
  replyId: string | null;
  state: 'pending' | 'playing' | 'settled';
  reason?: VoiceOutputEndReason;
}>;

/** Semantic voice facts, independent of renderer visibility and amplitude sampling. */
export type VoiceActivitySnapshot = Readonly<{
  revision: number;
  speechRevision: number;
  lastSpeechAt: number;
  utteranceActive: boolean;
  output: VoiceOutputSnapshot | null;
}>;

/** The voice hook owns writes; consumers receive only snapshot/subscription access. */
export function createVoiceActivity(now = () => performance.now()) {
  let outputGeneration = 0;
  let snapshot: VoiceActivitySnapshot = {
    revision: 0,
    speechRevision: 0,
    lastSpeechAt: 0,
    utteranceActive: false,
    output: null,
  };
  const listeners = new Set<() => void>();
  const publish = (next: Omit<VoiceActivitySnapshot, 'revision'>) => {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  };
  const settleOutput = (generation: number, reason: VoiceOutputEndReason) => {
    const output = snapshot.output;
    if (!output || output.generation !== generation || output.state === 'settled') return;
    publish({ ...snapshot, output: { ...output, state: 'settled', reason } });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    acceptedSpeech(utteranceActive: boolean) {
      publish({
        ...snapshot,
        speechRevision: snapshot.speechRevision + 1,
        lastSpeechAt: now(),
        utteranceActive,
      });
    },
    endUtterance() {
      if (snapshot.utteranceActive) publish({ ...snapshot, utteranceActive: false });
    },
    beginOutput(replyId?: string) {
      if (snapshot.output) settleOutput(snapshot.output.generation, 'superseded');
      const generation = ++outputGeneration;
      publish({ ...snapshot, output: { generation, replyId: replyId ?? null, state: 'pending' } });
      return generation;
    },
    outputState(generation: number, state: 'pending' | 'playing') {
      const output = snapshot.output;
      if (
        !output ||
        output.generation !== generation ||
        output.state === 'settled' ||
        output.state === state
      )
        return;
      publish({ ...snapshot, output: { ...output, state } });
    },
    settleOutput,
    cancelOutput(reason: VoiceOutputEndReason = 'cancelled') {
      if (snapshot.output) settleOutput(snapshot.output.generation, reason);
    },
  };
}

/** Rebind when the existing output meter hands playback to a fresh native element. */
export function observeVoicePlayback(
  audio: HTMLAudioElement,
  current: () => boolean,
  onState: (state: 'pending' | 'playing') => void,
) {
  const playing = () => {
    if (current()) onState('playing');
  };
  const pending = () => {
    if (current()) onState('pending');
  };
  audio.addEventListener?.('playing', playing);
  for (const event of ['pause', 'waiting', 'stalled', 'emptied'])
    audio.addEventListener?.(event, pending);
  return () => {
    audio.removeEventListener?.('playing', playing);
    for (const event of ['pause', 'waiting', 'stalled', 'emptied'])
      audio.removeEventListener?.(event, pending);
  };
}
