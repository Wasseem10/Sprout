/** Read-only visual samples; capture, playback and phase remain owned by useVoice. */
export type AudioPresentationSample = Readonly<{
  inputLevel: number | null;
  outputLevel: number | null;
  inputSampledAt: number;
  outputSampledAt: number;
  playbackGeneration: number;
  outputPlaying: boolean;
  source: 'voice' | 'simulated';
}>;

export type AudioPresentationRef = Readonly<{ current: AudioPresentationSample }>;

const normalizedRms = (rms: number) =>
  Number.isFinite(rms) ? Math.min(1, Math.max(0, rms * 4)) : 0;

export function createAudioPresentation(now = () => performance.now()) {
  let outputGate: { generation: number; audible: () => boolean } | null = null;
  const ref: { current: AudioPresentationSample } = {
    current: {
      inputLevel: null,
      outputLevel: null,
      inputSampledAt: 0,
      outputSampledAt: 0,
      playbackGeneration: 0,
      outputPlaying: false,
      source: 'voice',
    },
  };
  const presentationRef: AudioPresentationRef = {
    get current() {
      // pause() changes the element synchronously, while its DOM event is queued.
      // Readers must not retain a last audible sample during that event gap.
      if (
        ref.current.outputPlaying &&
        outputGate &&
        outputGate.generation === ref.current.playbackGeneration &&
        !outputGate.audible()
      )
        ref.current = {
          ...ref.current,
          outputLevel: 0,
          outputPlaying: false,
          outputSampledAt: now(),
        };
      return ref.current;
    },
  };
  return {
    ref: presentationRef,
    setInputRms(rms: number) {
      ref.current = { ...ref.current, inputLevel: normalizedRms(rms), inputSampledAt: now() };
    },
    clearInput() {
      ref.current = { ...ref.current, inputLevel: null, inputSampledAt: now() };
    },
    beginOutput() {
      outputGate = null;
      ref.current = {
        ...ref.current,
        outputLevel: null,
        outputSampledAt: now(),
        playbackGeneration: ref.current.playbackGeneration + 1,
        outputPlaying: false,
      };
      return ref.current.playbackGeneration;
    },
    isCurrent(generation: number) {
      return ref.current.playbackGeneration === generation;
    },
    guardOutput(generation: number, audible: (() => boolean) | null) {
      if (ref.current.playbackGeneration === generation)
        outputGate = audible ? { generation, audible } : null;
    },
    setOutput(generation: number, rms: number | null, playing: boolean) {
      if (ref.current.playbackGeneration !== generation) return;
      ref.current = {
        ...ref.current,
        outputLevel: rms === null ? null : playing ? normalizedRms(rms) : 0,
        outputSampledAt: now(),
        outputPlaying: playing,
      };
    },
  };
}

export type AudioPresentationOwner = ReturnType<typeof createAudioPresentation>;

/** A native handoff can abort the old element's still-pending play() promise. */
export async function playOutputAudio(
  audio: HTMLAudioElement,
  current: () => HTMLAudioElement | null,
  isCurrent: () => boolean,
) {
  try {
    await audio.play();
  } catch (error) {
    const replacement = current();
    if (!isCurrent() || !replacement || replacement === audio) throw error;
    // The meter has already started this same native element. Awaiting play again
    // observes its result without creating a second element or audio route.
    await replacement.play();
  }
}

type MeterEnvironment = {
  createContext: () => AudioContext | null;
  createAudio: (src: string) => HTMLAudioElement;
};

type PlaybackSession = {
  audio: HTMLAudioElement;
  generation: number;
  context: AudioContext | null;
  source: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
  timer: ReturnType<typeof setInterval> | null;
  playing: boolean;
  disposed: boolean;
  detach: () => void;
  replace: (previous: HTMLAudioElement, next: HTMLAudioElement) => boolean;
};

/** One output graph owned by the voice hook, independent of avatar mount/visibility. */
export function createOutputAudioMeter(
  presentation: AudioPresentationOwner,
  environment: MeterEnvironment = {
    createContext: () => (typeof AudioContext === 'undefined' ? null : new AudioContext()),
    createAudio: (src) => new Audio(src),
  },
) {
  let active: PlaybackSession | null = null;

  function disposeSession(session: PlaybackSession) {
    if (session.disposed) return;
    session.disposed = true;
    presentation.guardOutput(session.generation, null);
    session.detach();
    if (session.timer) clearInterval(session.timer);
    session.timer = null;
    try {
      session.source?.disconnect();
      session.analyser?.disconnect();
    } catch {
      // Analysis cleanup must never replace a voice error with a meter error.
    }
    if (session.context && session.context.state !== 'closed')
      void session.context.close().catch(() => {});
    if (active === session) active = null;
  }

  function isCurrent(session: PlaybackSession) {
    return active === session && !session.disposed && presentation.isCurrent(session.generation);
  }

  function nativeFallback(session: PlaybackSession) {
    if (!isCurrent(session)) return;
    const previous = session.audio;
    const resumePlayback = !previous.paused && !previous.ended;
    const next = environment.createAudio(previous.src);
    next.volume = previous.volume;
    next.muted = previous.muted;
    next.playbackRate = previous.playbackRate;
    next.onended = previous.onended;
    next.onerror = previous.onerror;
    try {
      next.currentTime = previous.currentTime;
    } catch {
      // A browser may require metadata before restoring the native element's position.
      next.addEventListener(
        'loadedmetadata',
        () => {
          try {
            next.currentTime = previous.currentTime;
          } catch {
            /* Native playback remains usable. */
          }
        },
        { once: true },
      );
    }
    presentation.setOutput(session.generation, null, false);
    disposeSession(session);
    previous.onended = null;
    previous.onerror = null;
    previous.pause();
    if (!session.replace(previous, next)) return;
    if (resumePlayback) void next.play().catch(() => next.dispatchEvent(new Event('error')));
  }

  return {
    stop() {
      presentation.beginOutput();
      if (active) disposeSession(active);
    },

    async prepare(
      audio: HTMLAudioElement,
      generation: number,
      replace: PlaybackSession['replace'],
    ): Promise<HTMLAudioElement | null> {
      if (!presentation.isCurrent(generation)) return null;
      if (active) disposeSession(active);
      const session: PlaybackSession = {
        audio,
        generation,
        context: null,
        source: null,
        analyser: null,
        timer: null,
        playing: false,
        disposed: false,
        detach: () => {},
        replace,
      };
      active = session;
      let rerouted = false;
      try {
        const context = environment.createContext();
        session.context = context;
        if (!context) {
          disposeSession(session);
          return audio;
        }
        // Never reroute native speech into a suspended/unusable graph. A stalled resume
        // falls back promptly; media-source routing cannot be undone on the same element.
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            context.resume(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Audio analysis unavailable')), 200);
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        if (!isCurrent(session)) {
          disposeSession(session);
          return null;
        }
        if (context.state !== 'running') throw new Error('Audio analysis suspended');
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        session.analyser = analyser;
        const source = context.createMediaElementSource(audio);
        session.source = source;
        rerouted = true;
        // Exactly one audible destination. The analyser is a parallel, silent branch.
        source.connect(context.destination);
        try {
          source.connect(analyser);
        } catch {
          session.analyser = null;
          analyser.disconnect();
        }
        const samples = new Float32Array(analyser.fftSize);
        const quiet = () => {
          if (!isCurrent(session)) return;
          session.playing = false;
          presentation.setOutput(generation, session.analyser ? 0 : null, false);
        };
        const sample = () => {
          if (!isCurrent(session)) return;
          if (context.state !== 'running') {
            nativeFallback(session);
            return;
          }
          if (!session.playing || audio.paused || audio.ended || audio.readyState < 2) {
            presentation.setOutput(generation, session.analyser ? 0 : null, false);
            return;
          }
          if (!session.analyser) return;
          try {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const value of samples) sum += value * value;
            presentation.setOutput(
              generation,
              audio.muted ? 0 : Math.sqrt(sum / samples.length),
              true,
            );
          } catch {
            // Losing analysis does not disconnect the direct audible branch.
            session.analyser = null;
            presentation.setOutput(generation, null, false);
          }
        };
        const playing = () => {
          if (!isCurrent(session)) return;
          session.playing = true;
          sample();
        };
        const terminal = () => {
          quiet();
          disposeSession(session);
        };
        const stateChanged = () => {
          if (isCurrent(session) && context.state !== 'running') nativeFallback(session);
        };
        for (const event of ['pause', 'waiting', 'stalled', 'emptied'])
          audio.addEventListener(event, quiet);
        audio.addEventListener('playing', playing);
        audio.addEventListener('ended', terminal);
        audio.addEventListener('error', terminal);
        context.addEventListener('statechange', stateChanged);
        session.detach = () => {
          for (const event of ['pause', 'waiting', 'stalled', 'emptied'])
            audio.removeEventListener(event, quiet);
          audio.removeEventListener('playing', playing);
          audio.removeEventListener('ended', terminal);
          audio.removeEventListener('error', terminal);
          context.removeEventListener('statechange', stateChanged);
        };
        session.timer = setInterval(sample, 40);
        presentation.guardOutput(
          generation,
          () =>
            isCurrent(session) &&
            session.playing &&
            !audio.paused &&
            !audio.ended &&
            audio.readyState >= 2 &&
            context.state === 'running',
        );
        presentation.setOutput(generation, session.analyser ? 0 : null, false);
        return audio;
      } catch {
        const current = isCurrent(session);
        disposeSession(session);
        if (!current) return null;
        presentation.setOutput(generation, null, false);
        // A source creation/connection failure can leave the original element rerouted.
        // A fresh native element preserves audible speech without another TTS request.
        return rerouted ? environment.createAudio(audio.src) : audio;
      }
    },
  };
}
