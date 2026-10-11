import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAudioPresentation,
  createOutputAudioMeter,
  playOutputAudio,
} from '../src/audioPresentation';

class FakeAudio extends EventTarget {
  paused = true;
  ended = false;
  readyState = 4;
  currentTime = 0;
  volume = 1;
  muted = false;
  playbackRate = 1;
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  play = vi.fn(async () => {
    this.paused = false;
    this.fire('playing');
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.fire('pause');
  });
  constructor(public src = 'blob:owned-tts') {
    super();
  }
  fire(type: string) {
    if (type === 'ended') this.ended = true;
    const event = new Event(type);
    this.dispatchEvent(event);
    if (type === 'ended') this.onended?.(event);
    if (type === 'error') this.onerror?.(event);
  }
}

class FakeContext extends EventTarget {
  state: AudioContextState = 'suspended';
  destination = { audible: true };
  analyser = {
    fftSize: 1024,
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => {
      samples.fill(0.1);
    }),
  };
  source = { connect: vi.fn(), disconnect: vi.fn() };
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createAnalyser = vi.fn(() => this.analyser);
  createMediaElementSource = vi.fn(() => this.source);
  changeState(state: AudioContextState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

function fixture(context: FakeContext | null = new FakeContext()) {
  let now = 1000;
  const presentation = createAudioPresentation(() => now);
  const native: FakeAudio[] = [];
  const meter = createOutputAudioMeter(presentation, {
    createContext: () => context as unknown as AudioContext | null,
    createAudio: (src) => {
      const audio = new FakeAudio(src);
      native.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
  });
  const audio = new FakeAudio();
  const replace = vi.fn((_previous: HTMLAudioElement, _next: HTMLAudioElement) => true);
  const generation = presentation.beginOutput();
  const prepare = () => meter.prepare(audio as unknown as HTMLAudioElement, generation, replace);
  return {
    presentation,
    meter,
    context,
    native,
    audio,
    replace,
    generation,
    prepare,
    advance: () => {
      now += 40;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('voice-owned presentation samples', () => {
  it('keeps input freshness independent and rejects superseded output generations', () => {
    const f = fixture();
    expect(f.presentation.ref.current.outputLevel).toBeNull();
    f.presentation.setOutput(f.generation, 0.1, true);
    const outputAt = f.presentation.ref.current.outputSampledAt;
    f.advance();
    f.presentation.setInputRms(0.025);
    expect(f.presentation.ref.current.inputLevel).toBe(0.1);
    expect(f.presentation.ref.current.inputSampledAt).toBeGreaterThan(outputAt);
    expect(f.presentation.ref.current.outputSampledAt).toBe(outputAt);
    const next = f.presentation.beginOutput();
    f.presentation.setOutput(f.generation, 1, true);
    expect(f.presentation.ref.current).toMatchObject({
      playbackGeneration: next,
      outputLevel: null,
      outputPlaying: false,
    });
    f.presentation.clearInput();
    expect(f.presentation.ref.current.inputLevel).toBeNull();
  });

  it('bounds finite levels and distinguishes silent samples from unavailable input', () => {
    const f = fixture();
    f.presentation.setInputRms(9);
    expect(f.presentation.ref.current.inputLevel).toBe(1);
    f.presentation.setInputRms(Number.NaN);
    expect(f.presentation.ref.current.inputLevel).toBe(0);
    f.presentation.clearInput();
    expect(f.presentation.ref.current.inputLevel).toBeNull();
  });
});

describe('existing TTS playback analyser branch', () => {
  it('uses one audible destination and samples only after actual playing', async () => {
    const f = fixture();
    expect(await f.prepare()).toBe(f.audio);
    expect(f.context!.source.connect.mock.calls).toEqual([
      [f.context!.destination],
      [f.context!.analyser],
    ]);
    expect(f.presentation.ref.current).toMatchObject({ outputLevel: 0, outputPlaying: false });
    await vi.advanceTimersByTimeAsync(80);
    expect(f.context!.analyser.getFloatTimeDomainData).not.toHaveBeenCalled();
    await f.audio.play();
    expect(f.presentation.ref.current.outputLevel).toBeCloseTo(0.4);
    expect(f.presentation.ref.current.outputPlaying).toBe(true);
    f.meter.stop();
    expect(f.context!.close).toHaveBeenCalledOnce();
    expect(f.context!.source.disconnect).toHaveBeenCalledOnce();
    expect(f.presentation.ref.current).toMatchObject({ outputLevel: null, outputPlaying: false });
  });

  it.each(['pause', 'waiting', 'stalled', 'emptied', 'ended', 'error'])(
    'publishes zero immediately on %s',
    async (event) => {
      const f = fixture();
      await f.prepare();
      await f.audio.play();
      f.audio.fire(event);
      expect(f.presentation.ref.current).toMatchObject({ outputLevel: 0, outputPlaying: false });
      if (event === 'ended' || event === 'error') expect(f.context!.close).toHaveBeenCalledOnce();
      f.meter.stop();
    },
  );

  it('stops old samples and handlers immediately on cancellation while a new TTS fetch is pending', async () => {
    const f = fixture();
    await f.prepare();
    await f.audio.play();
    f.meter.stop();
    const generation = f.presentation.ref.current.playbackGeneration;
    f.audio.fire('playing');
    f.context!.changeState('running');
    await vi.advanceTimersByTimeAsync(120);
    expect(f.presentation.ref.current).toMatchObject({
      playbackGeneration: generation,
      outputLevel: null,
      outputPlaying: false,
    });
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('invalidates the ref synchronously when pause state changes before its DOM event', async () => {
    const f = fixture();
    await f.prepare();
    await f.audio.play();
    expect(f.presentation.ref.current.outputPlaying).toBe(true);
    f.audio.paused = true; // The browser queues its pause event after this state change.
    expect(f.presentation.ref.current).toMatchObject({ outputLevel: 0, outputPlaying: false });
    f.meter.stop();
  });

  it('preserves native playback when Web Audio is unavailable', async () => {
    const f = fixture(null);
    expect(await f.prepare()).toBe(f.audio);
    await f.audio.play();
    expect(f.audio.play).toHaveBeenCalledOnce();
    expect(f.presentation.ref.current).toMatchObject({ outputLevel: null, outputPlaying: false });
  });

  it('does not reroute audio when context resume fails', async () => {
    const context = new FakeContext();
    context.resume.mockRejectedValueOnce(new Error('autoplay'));
    const f = fixture(context);
    expect(await f.prepare()).toBe(f.audio);
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
    expect(f.presentation.ref.current.outputLevel).toBeNull();
  });

  it('falls back promptly if context resume hangs', async () => {
    const context = new FakeContext();
    context.resume.mockImplementationOnce(() => new Promise(() => {}));
    const f = fixture(context);
    const preparing = f.prepare();
    await vi.advanceTimersByTimeAsync(201);
    expect(await preparing).toBe(f.audio);
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('cannot revive output when cancellation races graph preparation', async () => {
    const context = new FakeContext();
    let resume!: () => void;
    context.resume.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    const f = fixture(context);
    const preparing = f.prepare();
    f.meter.stop();
    const generation = f.presentation.ref.current.playbackGeneration;
    resume();
    expect(await preparing).toBeNull();
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
    expect(f.presentation.ref.current).toMatchObject({
      playbackGeneration: generation,
      outputLevel: null,
      outputPlaying: false,
    });
  });

  it('returns a fresh native element if rerouting succeeded but destination connection failed', async () => {
    const context = new FakeContext();
    context.source.connect.mockImplementationOnce(() => {
      throw new Error('destination failed');
    });
    const f = fixture(context);
    expect(await f.prepare()).toBe(f.native[0]);
    expect(f.native[0].src).toBe(f.audio.src);
    expect(context.close).toHaveBeenCalledOnce();
    expect(f.presentation.ref.current.outputLevel).toBeNull();
  });

  it('keeps the audible branch when waveform analysis fails', async () => {
    const f = fixture();
    f.context!.analyser.getFloatTimeDomainData.mockImplementationOnce(() => {
      throw new Error('meter failed');
    });
    await f.prepare();
    await f.audio.play();
    expect(f.presentation.ref.current.outputLevel).toBeNull();
    expect(f.context!.source.disconnect).not.toHaveBeenCalled();
    expect(f.context!.close).not.toHaveBeenCalled();
    expect(f.audio.paused).toBe(false);
    f.meter.stop();
  });

  it('hands suspended playback back to a native element without another TTS request', async () => {
    const f = fixture();
    await f.prepare();
    const ended = vi.fn();
    f.audio.onended = ended;
    f.audio.currentTime = 0.75;
    await f.audio.play();
    f.context!.changeState('suspended');
    const replacement = f.native[0];
    expect(f.replace).toHaveBeenCalledWith(f.audio, replacement);
    expect(replacement.currentTime).toBe(0.75);
    expect(replacement.play).toHaveBeenCalledOnce();
    expect(f.audio.paused).toBe(true);
    expect(f.presentation.ref.current).toMatchObject({ outputLevel: null, outputPlaying: false });
    replacement.fire('ended');
    expect(ended).toHaveBeenCalledOnce();
  });

  it('preserves a native handoff when pausing aborts the original pending play promise', async () => {
    const f = fixture();
    await f.prepare();
    let current = f.audio;
    let rejectOriginal!: (error: Error) => void;
    f.replace.mockImplementation((_previous, next) => {
      current = next as unknown as FakeAudio;
      return true;
    });
    f.audio.play.mockImplementationOnce(() => {
      f.audio.paused = false;
      return new Promise<void>((_resolve, reject) => {
        rejectOriginal = reject;
      });
    });
    f.audio.pause.mockImplementationOnce(() => {
      f.audio.paused = true;
      rejectOriginal(new DOMException('Old play interrupted by handoff', 'AbortError'));
    });
    const playing = playOutputAudio(
      f.audio as unknown as HTMLAudioElement,
      () => current as unknown as HTMLAudioElement,
      () => true,
    );
    f.context!.changeState('suspended');
    await expect(playing).resolves.toBeUndefined();
    expect(current).toBe(f.native[0]);
    expect(current.paused).toBe(false);
    expect(f.native).toHaveLength(1);
  });

  it('does not start a replacement after the voice generation was cancelled', async () => {
    const original = new FakeAudio();
    const replacement = new FakeAudio();
    const error = new DOMException('Cancelled play', 'AbortError');
    original.play.mockRejectedValueOnce(error);
    await expect(
      playOutputAudio(
        original as unknown as HTMLAudioElement,
        () => replacement as unknown as HTMLAudioElement,
        () => false,
      ),
    ).rejects.toBe(error);
    expect(replacement.play).not.toHaveBeenCalled();
  });
});
