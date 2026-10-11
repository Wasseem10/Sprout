import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the resource-owning hook's commands without a browser or microphone.
// React mounting/subscription behavior remains covered by the existing browser suite.
const harness = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  connection: null as FakeConnection | null,
  connections: [] as FakeConnection[],
}));
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [typeof value === 'function' ? value() : value, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  },
}));
vi.mock('@elevenlabs/react', () => ({
  CommitStrategy: { VAD: 'vad' },
  RealtimeEvents: {
    SESSION_STARTED: 'session_started',
    PARTIAL_TRANSCRIPT: 'partial_transcript',
    COMMITTED_TRANSCRIPT: 'committed_transcript',
    ERROR: 'error',
    CLOSE: 'close',
  },
  useScribe: () => ({
    connect: async () => {
      const connection = new FakeConnection();
      harness.connection = connection;
      harness.connections.push(connection);
      // The first event arrives before the connect Promise's continuation.
      queueMicrotask(() => connection.emit('session_started'));
    },
    disconnect: () => {
      const old = harness.connection;
      harness.connection = null;
      old?.emit('close');
    },
    getConnection: () => harness.connection,
  }),
}));

import { useVoice } from '../src/voice';

class FakeConnection {
  listeners = new Map<string, Set<(value: any) => void>>();
  on(event: string, handler: (value: any) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(handler);
    this.listeners.set(event, listeners);
  }
  off(event: string, handler: (value: any) => void) {
    this.listeners.get(event)?.delete(handler);
  }
  emit(event: string, value?: unknown) {
    for (const handler of this.listeners.get(event) ?? []) handler(value);
  }
}

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  paused = true;
  ended = false;
  readyState = 4;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    super();
    FakeAudio.instances.push(this);
  }
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  finish() {
    this.ended = true;
    this.dispatchEvent(new Event('ended'));
    this.onended?.();
  }
}

const ttsResponse = () => new Response(new Blob(['audio'], { type: 'audio/mpeg' }));
const tokenResponse = () => Response.json({ token: 'fixture' });
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  harness.cleanups = [];
  harness.connections = [];
  harness.connection = null;
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path.includes('realtime-token') ? tokenResponse() : ttsResponse(),
    ),
  );
});
afterEach(() => {
  for (const cleanup of harness.cleanups) cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('voice-owned reply and activity lifecycle', () => {
  it('registers pending synchronously and resolves speak before final playback completion', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const voice = useVoice(vi.fn(), vi.fn());
    const speaking = voice.speak('Final answer', 'task:final');
    expect(voice.getActivity().output).toMatchObject({ replyId: 'task:final', state: 'pending' });
    release(ttsResponse());
    await speaking;
    expect(voice.getActivity().output?.state).toBe('playing');
    expect(voice.presentationAudio.current).toMatchObject({
      outputPlaying: true,
      outputLevel: null,
    });
    FakeAudio.instances.at(-1)!.dispatchEvent(new Event('waiting'));
    expect(voice.getActivity().output?.state).toBe('pending');
    expect(voice.presentationAudio.current.outputPlaying).toBe(false);
    FakeAudio.instances.at(-1)!.dispatchEvent(new Event('playing'));
    FakeAudio.instances.at(-1)!.finish();
    expect(voice.getActivity().output).toMatchObject({
      replyId: 'task:final',
      state: 'settled',
      reason: 'ended',
    });
    expect(voice.presentationAudio.current.outputPlaying).toBe(false);
  });

  it('distinguishes output skip from microphone pause and ignores old ended events', async () => {
    const voice = useVoice(vi.fn(), vi.fn());
    await voice.startConversation();
    await voice.speak('First reply', 'first');
    const first = FakeAudio.instances.at(-1)!;
    const oldEnd = first.onended;
    voice.skipSpeech();
    expect(voice.isConversationActive()).toBe(true);
    expect(voice.getActivity().output?.reason).toBe('skipped');
    await voice.speak('Second reply', 'second');
    oldEnd?.();
    expect(voice.getActivity().output).toMatchObject({ replyId: 'second', state: 'playing' });
    voice.pauseConversation();
    expect(voice.isConversationActive()).toBe(false);
    expect(voice.getActivity().output?.reason).toBe('paused');
    expect(FakeAudio.instances.at(-1)!.paused).toBe(true);
  });

  it('never plays a late paused TTS response, even after a newer session starts', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path.includes('realtime-token')
          ? Promise.resolve(tokenResponse())
          : new Promise<Response>((resolve) => {
              release = resolve;
            }),
      ),
    );
    const voice = useVoice(vi.fn(), vi.fn());
    await voice.startConversation();
    const pending = voice.speak('Obsolete', 'old-final');
    voice.pauseConversation();
    await voice.startConversation();
    release(ttsResponse());
    await pending;
    expect(FakeAudio.instances).toHaveLength(0);
    expect(voice.getActivity().output?.reason).toBe('paused');
    expect(voice.isConversationActive()).toBe(true);
  });

  it('keeps the first greeting and rejects old-session transcript callbacks after rapid resume', async () => {
    const transcript = vi.fn();
    const voice = useVoice(transcript, vi.fn());
    await voice.startConversation('Hello');
    await flush();
    expect(voice.getActivity().output).not.toBeNull();
    const old = harness.connection!;
    const latePartial = [...old.listeners.get('partial_transcript')!][0];
    const lateCommit = [...old.listeners.get('committed_transcript')!][0];
    old.emit('partial_transcript', { text: 'New words' });
    expect(voice.getActivity().utteranceActive).toBe(true);
    voice.pauseConversation();
    expect(voice.getActivity().utteranceActive).toBe(false);
    await voice.startConversation();
    const revision = voice.getActivity().speechRevision;
    latePartial({ text: 'Old delayed words' });
    lateCommit({ text: 'Old delayed command' });
    expect(voice.getActivity().speechRevision).toBe(revision);
    expect(transcript).not.toHaveBeenCalled();
    harness.connection!.emit('committed_transcript', { text: 'Current command' });
    expect(transcript).toHaveBeenCalledWith('Current command');
    expect(voice.getActivity().utteranceActive).toBe(false);
  });

  it('bounds an orphaned realtime partial and preserves short-word interruption threshold', async () => {
    const voice = useVoice(vi.fn(), vi.fn());
    await voice.startConversation();
    harness.connection!.emit('partial_transcript', { text: 'no' });
    expect(voice.getActivity().speechRevision).toBe(0);
    harness.connection!.emit('partial_transcript', { text: 'stop' });
    expect(voice.getActivity()).toMatchObject({ speechRevision: 1, utteranceActive: true });
    await vi.advanceTimersByTimeAsync(30000);
    expect(voice.getActivity()).toMatchObject({ speechRevision: 1, utteranceActive: false });
  });

  it('reports batch VAD onset once, ignores quiet noise, and clears an utterance on pause', async () => {
    let sample = 129;
    const stopTrack = vi.fn();
    const media = { getTracks: () => [{ stop: stopTrack }] };
    class InputContext {
      state = 'running';
      async resume() {
        this.state = 'running';
      }
      async close() {
        this.state = 'closed';
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createAnalyser() {
        return { fftSize: 2048, getByteTimeDomainData: (data: Uint8Array) => data.fill(sample) };
      }
    }
    class Recorder {
      static isTypeSupported() {
        return true;
      }
      state = 'inactive';
      mimeType = 'audio/webm';
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    vi.stubGlobal('AudioContext', InputContext);
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => media) } });
    const voice = useVoice(vi.fn(), vi.fn());
    await voice.start(true);
    await vi.advanceTimersByTimeAsync(480);
    expect(voice.getActivity().speechRevision).toBe(0);
    sample = 140;
    await vi.advanceTimersByTimeAsync(160);
    expect(voice.getActivity()).toMatchObject({ speechRevision: 1, utteranceActive: true });
    await vi.advanceTimersByTimeAsync(320);
    expect(voice.getActivity().speechRevision).toBe(1);
    voice.pauseConversation();
    expect(voice.getActivity().utteranceActive).toBe(false);
    expect(stopTrack).toHaveBeenCalled();
  });

  it('settles a failed final reply without pretending playback occurred', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'TTS unavailable' }, { status: 503 })),
    );
    const error = vi.fn();
    const voice = useVoice(vi.fn(), error);
    await voice.speak('Unavailable', 'final');
    expect(voice.getActivity().output).toMatchObject({
      replyId: 'final',
      state: 'settled',
      reason: 'error',
    });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(error).toHaveBeenCalledWith('TTS unavailable');
  });
});
