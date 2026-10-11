import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CommitStrategy, RealtimeEvents, useScribe } from '@elevenlabs/react';
import {
  createAudioPresentation,
  createOutputAudioMeter,
  playOutputAudio,
} from './audioPresentation';
import {
  createVoiceActivity,
  observeVoicePlayback,
  type VoiceOutputEndReason,
} from './voiceActivity';

type VoicePhase = 'idle' | 'starting' | 'listening' | 'transcribing' | 'processing' | 'speaking';

const SILENCE_AFTER_SPEECH_MS = 800;
const MAX_RECORDING_MS = 30000;

export function useVoice(onTranscript: (text: string) => void, onError: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [conversationActive, setConversationActive] = useState(false);
  const generation = useRef(0);
  const outputGeneration = useRef(0);
  const outputAbort = useRef<AbortController | null>(null);
  const spokenText = useRef('');
  const speechEndedAt = useRef(0);
  const voiceMode = useRef<'off' | 'connecting' | 'realtime' | 'batch'>('off');
  const conversation = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const presentationOwner = useRef<ReturnType<typeof createAudioPresentation> | null>(null);
  if (!presentationOwner.current) presentationOwner.current = createAudioPresentation();
  const presentation = presentationOwner.current;
  const [activityOwner] = useState(() => createVoiceActivity());
  const activity = useSyncExternalStore(activityOwner.subscribe, activityOwner.getSnapshot);
  const outputMeterOwner = useRef<ReturnType<typeof createOutputAudioMeter> | null>(null);
  if (!outputMeterOwner.current) outputMeterOwner.current = createOutputAudioMeter(presentation);
  const outputMeter = outputMeterOwner.current;
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceActivityTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const url = useRef<string | null>(null);
  const monitoringPlayback = useRef(false);
  const speechInterrupted = useRef(false);
  const transcriptHandler = useRef(onTranscript);
  const pendingGreeting = useRef<string | undefined>(undefined);
  const errorHandler = useRef(onError);
  const playbackObserver = useRef<(() => void) | null>(null);
  const scribeObserver = useRef<(() => void) | null>(null);
  const utteranceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  transcriptHandler.current = onTranscript;
  errorHandler.current = onError;

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 0.65,
    minSpeechDurationMs: 200,
    microphone: {
      echoCancellation: true,
      noiseSuppression: true,
      workletPaths: { scribeAudioProcessor: '/scribeAudioProcessor.js' },
    },
  });

  function disconnectScribe() {
    scribeObserver.current?.();
    scribeObserver.current = null;
    scribe.disconnect();
  }

  function endUtterance() {
    if (utteranceTimer.current) clearTimeout(utteranceTimer.current);
    utteranceTimer.current = null;
    activityOwner.endUtterance();
  }

  function realtimeActivity() {
    activityOwner.acceptedSpeech(true);
    if (utteranceTimer.current) clearTimeout(utteranceTimer.current);
    // A partial without a commit (provider filtering/network stall) cannot hold
    // presence awake forever. New partials renew this bounded input lease.
    utteranceTimer.current = setTimeout(endUtterance, MAX_RECORDING_MS);
  }

  function stopOutput(reason: VoiceOutputEndReason = 'cancelled') {
    activityOwner.cancelOutput(reason);
    playbackObserver.current?.();
    playbackObserver.current = null;
    outputMeter.stop();
    outputGeneration.current++;
    outputAbort.current?.abort();
    outputAbort.current = null;
    if (audio.current) speechEndedAt.current = Date.now();
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }

  async function preparePlayback(src: string, isCurrent: () => boolean, outputId: number) {
    const original = new Audio(src);
    audio.current = original;
    const meterGeneration = presentation.ref.current.playbackGeneration;
    const watch = (target: HTMLAudioElement) => {
      playbackObserver.current?.();
      playbackObserver.current = observeVoicePlayback(
        target,
        () => isCurrent() && audio.current === target,
        (state) => {
          activityOwner.outputState(outputId, state);
          // Native playback remains truthful when amplitude analysis is unavailable.
          // The existing meter replaces this zero/null sample with measured RMS.
          presentation.setOutput(
            meterGeneration,
            presentation.ref.current.outputLevel === null ? null : 0,
            state === 'playing',
          );
        },
      );
    };
    watch(original);
    const prepared = await outputMeter.prepare(original, meterGeneration, (previous, next) => {
      if (!isCurrent() || audio.current !== previous) return false;
      audio.current = next;
      activityOwner.outputState(outputId, 'pending');
      watch(next);
      return true;
    });
    if (!prepared || !isCurrent() || !presentation.isCurrent(meterGeneration)) {
      prepared?.pause();
      return null;
    }
    // Meter setup may return a fresh native element if Web Audio cannot preserve output.
    if (audio.current === original && prepared !== original) {
      audio.current = prepared;
      watch(prepared);
    }
    return audio.current;
  }

  function isPlaybackEcho(value: string) {
    if (!audio.current && Date.now() - speechEndedAt.current > 800) return false;
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const heard = normalize(value);
    // A short word may be a command even when it also appears in the reply:
    // “stop”, “no”, and “open” must always be able to interrupt. Only skip a
    // substantial phrase that matches the buddy's own just-played speech.
    return (
      heard.length >= 20 &&
      heard.split(' ').length >= 4 &&
      normalize(spokenText.current).includes(heard)
    );
  }

  function handleRealtimePartial(value: string) {
    if (!conversation.current || voiceMode.current !== 'realtime') return;
    const text = value.trim();
    if (text.length < 3) return;
    if (isPlaybackEcho(text)) return;
    realtimeActivity();
    // The microphone stays open during speech synthesis and playback. As soon
    // as Scribe hears a new utterance, cancel any older audio, including a
    // still-pending TTS response. Its final transcript will start the new task.
    speechInterrupted.current = true;
    if (audio.current || outputAbort.current) stopOutput('interrupted');
    setPhase('listening');
  }

  function handleRealtimeCommit(value: string) {
    if (!conversation.current || voiceMode.current !== 'realtime') return;
    const text = value.trim();
    if (!text) {
      endUtterance();
      speechInterrupted.current = false;
      setPhase('listening');
      return;
    }
    if (isPlaybackEcho(text)) return;
    endUtterance();
    activityOwner.acceptedSpeech(false);
    if (audio.current || outputAbort.current) stopOutput('interrupted');
    setPhase('processing');
    // The handler synchronously supersedes the old request. Clearing this just
    // before dispatch lets the new request speak its own acknowledgment.
    speechInterrupted.current = false;
    transcriptHandler.current(text);
  }

  function handleRealtimeFailure() {
    if (!conversation.current || voiceMode.current !== 'realtime') return;
    endUtterance();
    voiceMode.current = 'batch';
    disconnectScribe();
    // Keep the conversation alive if a realtime socket expires or worklet
    // setup fails. The local recorder remains a usable fallback.
    void start(true);
  }

  function clearMedia(reason: VoiceOutputEndReason = 'cancelled') {
    endUtterance();
    presentation.clearInput();
    generation.current++;
    monitoringPlayback.current = false;
    speechInterrupted.current = false;
    stopOutput(reason);
    abort.current?.abort();
    abort.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (voiceActivityTimer.current) clearInterval(voiceActivityTimer.current);
    voiceActivityTimer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (audioContext.current) void audioContext.current.close().catch(() => {});
    audioContext.current = null;
  }

  function stop(reason: VoiceOutputEndReason = 'cancelled') {
    pendingGreeting.current = undefined;
    conversation.current = false;
    setConversationActive(false);
    voiceMode.current = 'off';
    disconnectScribe();
    clearMedia(reason);
    setPhase('idle');
  }

  async function start(automatic = false, monitorPlayback = false) {
    if (!monitorPlayback) {
      if (voiceMode.current === 'realtime') disconnectScribe();
      voiceMode.current = 'batch';
      clearMedia();
    }
    const id = generation.current;
    monitoringPlayback.current = monitorPlayback;
    if (!monitorPlayback) setPhase('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Microphone access needs the desktop app, localhost, or HTTPS.');
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (id !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      if (automatic && typeof AudioContext === 'undefined')
        throw new Error(
          'Automatic voice detection is unavailable. Use a browser with microphone audio analysis or type your request.',
        );
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recording = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      let heardSpeech = false;
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () => {
        if (id === generation.current) {
          stop();
          errorHandler.current('Microphone recording failed. You can still type your request.');
        }
      };
      recording.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        if (id !== generation.current) return;
        endUtterance();
        presentation.clearInput();
        if (voiceActivityTimer.current) clearInterval(voiceActivityTimer.current);
        voiceActivityTimer.current = null;
        if (audioContext.current) void audioContext.current.close().catch(() => {});
        audioContext.current = null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        recorder.current = null;
        stream.current = null;
        if (automatic && !heardSpeech) {
          // Staying available should not repeatedly send silent clips to ElevenLabs.
          if (conversation.current)
            timer.current = setTimeout(
              () => void start(true, monitoringPlayback.current && !!audio.current),
              150,
            );
          return;
        }
        const blob = new Blob(chunks, { type: recording.mimeType.split(';')[0] });
        if (!blob.size) {
          speechInterrupted.current = false;
          if (conversation.current) timer.current = setTimeout(() => void start(true), 150);
          else {
            setPhase('idle');
            errorHandler.current('No audio was recorded.');
          }
          return;
        }
        setPhase('transcribing');
        const controller = new AbortController();
        abort.current = controller;
        const form = new FormData();
        form.append(
          'audio',
          blob,
          'request.' +
            (blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'),
        );
        try {
          const response = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: form,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
          });
          const value = await response.json();
          if (!response.ok) throw new Error(value.error);
          if (id !== generation.current) return;
          abort.current = null;
          const text = value.text?.trim();
          if (text) {
            activityOwner.acceptedSpeech(false);
            setPhase(conversation.current ? 'processing' : 'idle');
            // The handoff to the new request is synchronous. Until this point,
            // pending speech blocks an older task from starting another reply.
            speechInterrupted.current = false;
            transcriptHandler.current(text);
          } else if (conversation.current) {
            speechInterrupted.current = false;
            void start(true);
          } else {
            setPhase('idle');
            errorHandler.current(
              'No speech was recognized. Please try again or type your request.',
            );
          }
        } catch (error) {
          if (id === generation.current) {
            stop();
            errorHandler.current(
              error instanceof Error && error.name === 'TimeoutError'
                ? 'Transcription took too long. Try again or type your request.'
                : error instanceof Error
                  ? error.message
                  : 'Transcription failed.',
            );
          }
        }
      };
      recording.start();
      if (!monitorPlayback) setPhase('listening');
      timer.current = setTimeout(() => {
        if (recording.state === 'recording') recording.stop();
      }, MAX_RECORDING_MS);

      if (automatic && typeof AudioContext !== 'undefined') {
        const context = new AudioContext();
        audioContext.current = context;
        const source = context.createMediaStreamSource(media);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let voiceFrames = 0;
        let lastSpeech = 0;
        let noiseFloor = 0.006;
        let sampleCount = 0;
        voiceActivityTimer.current = setInterval(() => {
          if (recording.state !== 'recording' || id !== generation.current) return;
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / samples.length);
          presentation.setInputRms(rms);
          // Cap startup calibration: speech may begin on the very first frame.
          if (sampleCount++ < 6) noiseFloor = Math.max(noiseFloor, Math.min(rms, 0.012));
          // During playback, echo cancellation removes most speaker output. The higher
          // threshold and sustained onset avoid treating a stray echo as an interruption.
          const audible = monitoringPlayback.current
            ? rms > Math.max(0.027, noiseFloor * 2.4)
            : rms > Math.max(0.014, noiseFloor * 1.6);
          if (audible) {
            voiceFrames++;
            if (voiceFrames >= (monitoringPlayback.current ? 3 : 2)) {
              if (monitoringPlayback.current) {
                monitoringPlayback.current = false;
                speechInterrupted.current = true;
                activityOwner.cancelOutput('interrupted');
                playbackObserver.current?.();
                playbackObserver.current = null;
                outputMeter.stop();
                audio.current?.pause();
                audio.current = null;
                if (url.current) URL.revokeObjectURL(url.current);
                url.current = null;
                setPhase('listening');
              }
              if (!heardSpeech) activityOwner.acceptedSpeech(true);
              heardSpeech = true;
              lastSpeech = Date.now();
            }
          } else voiceFrames = 0;
          if (heardSpeech && Date.now() - lastSpeech >= SILENCE_AFTER_SPEECH_MS) recording.stop();
        }, 80);
        void context.resume().catch(() => {});
        // Never send repeated silent clips when audio analysis is unavailable.
        setTimeout(() => {
          if (
            id === generation.current &&
            context.state === 'suspended' &&
            recording.state === 'recording'
          ) {
            stop();
            errorHandler.current(
              'Microphone audio analysis could not start. Press play to try again.',
            );
          }
        }, 1500);
      }
    } catch (error) {
      if (id === generation.current) {
        stop();
        const name = error instanceof Error ? error.name : '';
        errorHandler.current(
          name === 'NotAllowedError'
            ? 'Microphone permission was denied. Allow microphone access for Sprout, then try again. You can also type.'
            : name === 'NotFoundError'
              ? 'No microphone was found. Connect one, then try again.'
              : name === 'NotReadableError'
                ? 'The microphone is unavailable or in use by another app. Close that recording and try again.'
                : error instanceof Error
                  ? error.message
                  : 'Microphone unavailable.',
        );
      }
    }
  }

  async function startConversation(greeting?: string) {
    if (conversation.current) return;
    conversation.current = true;
    setConversationActive(true);
    clearMedia();
    pendingGreeting.current = greeting;
    const id = generation.current;
    voiceMode.current = 'connecting';
    setPhase('starting');
    try {
      const response = await fetch('/api/voice/realtime-token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Realtime voice unavailable');
      const value = await response.json();
      if (typeof value.token !== 'string' || !value.token) throw new Error('No realtime token');
      if (!conversation.current || id !== generation.current) return;
      voiceMode.current = 'realtime';
      // connect installs the connection synchronously. Bind before awaiting its
      // Promise so the first session_started cannot outrun the owned handlers.
      const connecting = scribe.connect({ token: value.token });
      const connection = scribe.getConnection();
      if (connection) {
        const isCurrent = () =>
          conversation.current &&
          id === generation.current &&
          voiceMode.current === 'realtime' &&
          scribe.getConnection() === connection;
        const started = () => {
          if (!isCurrent()) return;
          setPhase('listening');
          const greeting = pendingGreeting.current;
          pendingGreeting.current = undefined;
          if (greeting) void speakRealtime(greeting);
        };
        const partial = ({ text }: { text: string }) => {
          if (isCurrent()) handleRealtimePartial(text);
        };
        const committed = ({ text }: { text: string }) => {
          if (isCurrent()) handleRealtimeCommit(text);
        };
        const failed = () => {
          if (isCurrent()) handleRealtimeFailure();
        };
        let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
        const closed = () => {
          // useScribe clears its own connection ref before notifying close.
          disconnectTimer = setTimeout(() => {
            if (
              conversation.current &&
              id === generation.current &&
              voiceMode.current === 'realtime' &&
              !scribe.getConnection()
            )
              handleRealtimeFailure();
          }, 250);
        };
        connection.on(RealtimeEvents.SESSION_STARTED, started);
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, partial);
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, committed);
        connection.on(RealtimeEvents.ERROR, failed);
        connection.on(RealtimeEvents.CLOSE, closed);
        scribeObserver.current = () => {
          if (disconnectTimer) clearTimeout(disconnectTimer);
          connection.off(RealtimeEvents.SESSION_STARTED, started);
          connection.off(RealtimeEvents.PARTIAL_TRANSCRIPT, partial);
          connection.off(RealtimeEvents.COMMITTED_TRANSCRIPT, committed);
          connection.off(RealtimeEvents.ERROR, failed);
          connection.off(RealtimeEvents.CLOSE, closed);
        };
      }
      await connecting;
      // Never disconnect a newer session after this connection was superseded.
      if (
        (!conversation.current || id !== generation.current) &&
        scribe.getConnection() === connection
      )
        disconnectScribe();
    } catch {
      if (!conversation.current || id !== generation.current) return;
      // Still offer continuous conversation with the local recorder if the
      // account, browser, or network cannot start streaming transcription.
      voiceMode.current = 'batch';
      pendingGreeting.current = undefined;
      if (greeting) void speak(greeting);
      else void start(true);
    }
  }

  function pauseConversation() {
    stop('paused');
  }

  function skipSpeech() {
    activityOwner.cancelOutput('skipped');
    playbackObserver.current?.();
    playbackObserver.current = null;
    if (voiceMode.current === 'realtime') {
      stopOutput('skipped');
      if (conversation.current) setPhase('listening');
      else setPhase('idle');
      return;
    }
    if (conversation.current && recorder.current?.state === 'recording') {
      monitoringPlayback.current = false;
      outputMeter.stop();
      audio.current?.pause();
      audio.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
      setPhase('listening');
      return;
    }
    if (conversation.current) void start(true);
    else stop();
  }

  function finish() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  async function speakRealtime(text: string, replyId?: string) {
    if (speechInterrupted.current) {
      const cancelled = activityOwner.beginOutput(replyId);
      activityOwner.settleOutput(cancelled, 'interrupted');
      return;
    }
    stopOutput('superseded');
    const outputId = activityOwner.beginOutput(replyId);
    const id = outputGeneration.current;
    const controller = new AbortController();
    outputAbort.current = controller;
    setPhase('speaking');
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 3000) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Voice output failed.');
      }
      const blob = await response.blob();
      if (id !== outputGeneration.current || !conversation.current) return;
      outputAbort.current = null;
      url.current = URL.createObjectURL(blob);
      const playback = await preparePlayback(
        url.current,
        () => id === outputGeneration.current && conversation.current,
        outputId,
      );
      if (!playback) return;
      spokenText.current = text;
      playback.onended = () => {
        if (id !== outputGeneration.current) return;
        stopOutput('ended');
        if (conversation.current) setPhase('listening');
      };
      playback.onerror = () => {
        if (id !== outputGeneration.current) return;
        stopOutput('error');
        errorHandler.current('Audio playback failed. The full answer remains in the transcript.');
        if (conversation.current) setPhase('listening');
      };
      await playOutputAudio(
        playback,
        () => audio.current,
        () => id === outputGeneration.current && conversation.current,
      );
      if (id === outputGeneration.current && conversation.current && audio.current)
        activityOwner.outputState(outputId, 'playing');
    } catch (error) {
      if (id !== outputGeneration.current || !conversation.current) return;
      stopOutput('error');
      errorHandler.current(error instanceof Error ? error.message : 'Voice output failed.');
      setPhase('listening');
    }
  }

  async function speak(text: string, replyId?: string) {
    if (voiceMode.current === 'realtime' && conversation.current) {
      await speakRealtime(text, replyId);
      return;
    }
    clearMedia('superseded');
    const outputId = activityOwner.beginOutput(replyId);
    const id = generation.current;
    speechInterrupted.current = false;
    const controller = new AbortController();
    abort.current = controller;
    setPhase('speaking');
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 3000) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }
      const blob = await response.blob();
      if (id !== generation.current) return;
      abort.current = null;
      url.current = URL.createObjectURL(blob);
      const playback = await preparePlayback(
        url.current,
        () => id === generation.current,
        outputId,
      );
      if (!playback) return;
      playback.onended = () => {
        if (id !== generation.current) return;
        activityOwner.settleOutput(outputId, 'ended');
        playbackObserver.current?.();
        playbackObserver.current = null;
        outputMeter.stop();
        audio.current = null;
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = null;
        if (conversation.current) {
          if (recorder.current?.state === 'recording') {
            monitoringPlayback.current = false;
            setPhase('listening');
          } else {
            setPhase('starting');
            timer.current = setTimeout(() => void start(true), 150);
          }
        } else {
          clearMedia();
          setPhase('idle');
        }
      };
      playback.onerror = () => {
        if (id !== generation.current) return;
        activityOwner.settleOutput(outputId, 'error');
        errorHandler.current('Audio playback failed. The full answer remains in the transcript.');
        if (conversation.current) void start(true);
        else {
          clearMedia();
          setPhase('idle');
        }
      };
      await playOutputAudio(
        playback,
        () => audio.current,
        () => id === generation.current,
      );
      if (id === generation.current && audio.current)
        activityOwner.outputState(outputId, 'playing');
      // Keep the microphone listening while ElevenLabs speaks. The recording includes
      // the beginning of an interruption, so its first words are not clipped by VAD.
      if (conversation.current && id === generation.current && audio.current)
        void start(true, true);
    } catch (error) {
      if (id === generation.current && !speechInterrupted.current) {
        activityOwner.settleOutput(outputId, 'error');
        errorHandler.current(error instanceof Error ? error.message : 'Voice output failed.');
        if (conversation.current) void start(true);
        else {
          clearMedia();
          setPhase('idle');
        }
      }
    }
  }

  function resumeConversation() {
    if (!conversation.current) return;
    if (voiceMode.current === 'realtime') setPhase('listening');
    else void start(true);
  }

  function isConversationActive() {
    return conversation.current;
  }

  function hasPendingInterruption() {
    return speechInterrupted.current;
  }

  useEffect(
    () => () => {
      conversation.current = false;
      voiceMode.current = 'off';
      disconnectScribe();
      clearMedia();
    },
    [],
  );

  return {
    activity,
    getActivity: activityOwner.getSnapshot,
    presentationAudio: presentation.ref,
    phase,
    conversationActive,
    start,
    startConversation,
    pauseConversation,
    skipSpeech,
    resumeConversation,
    isConversationActive,
    hasPendingInterruption,
    finish,
    speak,
    stop,
  };
}
