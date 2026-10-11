import { useEffect, useRef, useState } from 'react';
import { CommitStrategy, useScribe } from '@elevenlabs/react';
import {
  isInterruptionTranscript,
  isOtherAssistantTurn,
  isUrgentVoiceTurn,
  joinVoiceSegments,
  shouldJoinVoiceSegments,
  voiceTurnDelay,
} from './voiceTurns';

type VoicePhase = 'idle' | 'starting' | 'listening' | 'transcribing' | 'processing' | 'speaking';

const SILENCE_AFTER_SPEECH_MS = 1300;
const MAX_RECORDING_MS = 30000;

export function useVoice(
  onTranscript: (text: string) => void,
  onError: (text: string) => void,
  onSpeechStart?: () => void,
  spokenReplies = true,
) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [conversationActive, setConversationActive] = useState(false);
  const [speechProvider, setSpeechProvider] = useState<string | null>(null);
  const generation = useRef(0);
  const outputGeneration = useRef(0);
  const outputAbort = useRef<AbortController | null>(null);
  const spokenText = useRef('');
  const speechEndedAt = useRef(0);
  const voiceMode = useRef<'off' | 'connecting' | 'realtime' | 'batch'>('off');
  const conversation = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStart = useRef<number | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
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
  const speechStartHandler = useRef(onSpeechStart);
  const recoverySpeechEnabled = useRef(spokenReplies);
  const utteranceSequence = useRef(0);
  const lastCommitted = useRef({ text: '', at: 0, utterance: 0 });
  const pendingTurn = useRef('');
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPartial = useRef('');
  const batchSpeechActive = useRef(false);
  const batchTranscriptions = useRef(0);
  const batchDelivery = useRef<Promise<void>>(Promise.resolve());
  const batchRequests = useRef(new Set<AbortController>());
  const realtimeReadyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  speechStartHandler.current = onSpeechStart;
  recoverySpeechEnabled.current = spokenReplies;
  transcriptHandler.current = onTranscript;
  errorHandler.current = onError;

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 0.85,
    minSpeechDurationMs: 200,
    microphone: {
      echoCancellation: true,
      noiseSuppression: true,
      workletPaths: { scribeAudioProcessor: '/scribeAudioProcessor.js' },
    },
    onSessionStarted: () => {
      if (conversation.current && voiceMode.current === 'realtime')
        waitForRealtimeMicrophone(generation.current, Date.now());
    },
    onPartialTranscript: ({ text }) => handleRealtimePartial(text),
    onCommittedTranscript: ({ text }) => handleRealtimeCommit(text),
    onError: () => handleRealtimeFailure(),
    onDisconnect: () => {
      // An unexpected provider disconnect should not leave Play looking active
      // while nothing is listening. Ignore closes caused by Pause/Stop.
      setTimeout(() => {
        if (conversation.current && voiceMode.current === 'realtime' && !scribe.getConnection())
          handleRealtimeFailure();
      }, 250);
    },
  });

  function waitForRealtimeMicrophone(id: number, startedAt: number) {
    if (id !== generation.current || !conversation.current || voiceMode.current !== 'realtime')
      return;
    // In the pinned ElevenLabs SDK, session_started precedes asynchronous mic/
    // worklet setup. The typed internal track is assigned only after that setup
    // completes. Do not invite speech while the capture pipeline is still absent.
    const track = scribe.getConnection()?._mediaStreamTrack;
    if (track?.readyState === 'live') {
      realtimeReadyTimer.current = null;
      setPhase('listening');
      const greeting = pendingGreeting.current;
      pendingGreeting.current = undefined;
      if (greeting && recoverySpeechEnabled.current) void speakRealtime(greeting);
    } else if (Date.now() - startedAt >= 5000) handleRealtimeFailure();
    else
      realtimeReadyTimer.current = setTimeout(() => waitForRealtimeMicrophone(id, startedAt), 50);
  }

  function stopOutput() {
    outputGeneration.current++;
    outputAbort.current?.abort();
    outputAbort.current = null;
    if (audio.current) speechEndedAt.current = Date.now();
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
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
    if (!isInterruptionTranscript(text)) return;
    if (isPlaybackEcho(text)) return;
    // Identical keepalive partials must not postpone an already committed turn.
    if (pendingTurn.current && text !== lastPartial.current)
      scheduleTurn(Math.max(900, voiceTurnDelay(text)));
    lastPartial.current = text;
    // The microphone stays open during speech synthesis and playback. As soon
    // as Scribe hears a new utterance, cancel any older audio, including a
    // still-pending TTS response. Its final transcript will start the new task.
    if (!speechInterrupted.current) {
      utteranceSequence.current++;
      speechStartHandler.current?.();
    }
    speechInterrupted.current = true;
    if (audio.current || outputAbort.current) stopOutput();
    setPhase('listening');
  }

  function handleRealtimeCommit(value: string) {
    if (!conversation.current || voiceMode.current !== 'realtime') return;
    handleTranscriptSegment(value);
  }

  function clearTurn() {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = null;
    pendingTurn.current = '';
    lastPartial.current = '';
  }

  function flushTurn(force = false) {
    if (!conversation.current || voiceMode.current === 'off') return clearTurn();
    if (!force && (batchSpeechActive.current || batchTranscriptions.current > 0)) {
      scheduleTurn(150);
      return;
    }
    const text = pendingTurn.current;
    clearTurn();
    if (!text) return;
    if (audio.current || outputAbort.current) stopOutput();
    setPhase('processing');
    speechInterrupted.current = false;
    transcriptHandler.current(text);
  }

  function scheduleTurn(delay: number) {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => flushTurn(), delay);
  }

  function handleTranscriptSegment(value: string) {
    if (!conversation.current || voiceMode.current === 'off') return;
    const text = value.trim();
    if (isOtherAssistantTurn(text)) {
      speechInterrupted.current = false;
      if (!audio.current) setPhase('listening');
      return;
    }
    if (!text) {
      speechInterrupted.current = false;
      setPhase('listening');
      return;
    }
    if (isPlaybackEcho(text)) return;
    if (
      text === lastCommitted.current.text &&
      utteranceSequence.current === lastCommitted.current.utterance &&
      Date.now() - lastCommitted.current.at < 1200
    )
      return;
    lastCommitted.current = { text, at: Date.now(), utterance: utteranceSequence.current };
    lastPartial.current = '';
    if (audio.current || outputAbort.current) stopOutput();
    const previous = pendingTurn.current;
    if (isUrgentVoiceTurn(text)) {
      clearTurn();
      pendingTurn.current = text;
      // A stop or short correction supersedes an unfinished thought immediately.
      flushTurn(true);
      return;
    }
    if (previous && !shouldJoinVoiceSegments(previous, text)) {
      clearTurn();
      speechInterrupted.current = false;
      transcriptHandler.current(previous);
    }
    pendingTurn.current =
      previous && shouldJoinVoiceSegments(previous, text)
        ? joinVoiceSegments(previous, text)
        : text;
    speechInterrupted.current = true;
    setPhase('listening');
    scheduleTurn(voiceTurnDelay(pendingTurn.current));
  }

  function handleRealtimeFailure() {
    if (!conversation.current || voiceMode.current !== 'realtime') return;
    voiceMode.current = 'batch';
    if (realtimeReadyTimer.current) clearTimeout(realtimeReadyTimer.current);
    realtimeReadyTimer.current = null;
    scribe.disconnect();
    // Keep the conversation alive if a realtime socket expires or worklet
    // setup fails. The local recorder remains a usable fallback.
    void start(true, !!audio.current || !!outputAbort.current).then(() => {
      const greeting = pendingGreeting.current;
      pendingGreeting.current = undefined;
      if (conversation.current && greeting && recoverySpeechEnabled.current) void speak(greeting);
    });
  }

  function clearMedia() {
    generation.current++;
    monitoringPlayback.current = false;
    speechInterrupted.current = false;
    batchSpeechActive.current = false;
    batchTranscriptions.current = 0;
    batchDelivery.current = Promise.resolve();
    for (const request of batchRequests.current) request.abort();
    batchRequests.current.clear();
    if (realtimeReadyTimer.current) clearTimeout(realtimeReadyTimer.current);
    realtimeReadyTimer.current = null;
    stopOutput();
    abort.current?.abort();
    abort.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (voiceActivityTimer.current) clearInterval(voiceActivityTimer.current);
    voiceActivityTimer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    recordingStart.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (audioContext.current) void audioContext.current.close().catch(() => {});
    audioContext.current = null;
  }

  function stop() {
    pendingGreeting.current = undefined;
    conversation.current = false;
    setConversationActive(false);
    voiceMode.current = 'off';
    scribe.disconnect();
    clearTurn();
    clearMedia();
    setPhase('idle');
  }

  async function start(automatic = false, monitorPlayback = false) {
    if (
      automatic &&
      conversation.current &&
      (recorder.current?.state === 'recording' || recordingStart.current === generation.current)
    ) {
      if (monitorPlayback) monitoringPlayback.current = true;
      return;
    }
    if (!monitorPlayback) {
      if (voiceMode.current === 'realtime') scribe.disconnect();
      voiceMode.current = 'batch';
      if (!automatic || !conversation.current) clearMedia();
    }
    const id = generation.current;
    recordingStart.current = id;
    monitoringPlayback.current = monitorPlayback;
    if (!monitorPlayback) setPhase('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Microphone access needs the desktop app, localhost, or HTTPS.');
      const reusable =
        conversation.current &&
        stream.current?.getAudioTracks().some((track) => track.readyState === 'live');
      const media = reusable
        ? stream.current!
        : await navigator.mediaDevices.getUserMedia({
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
        if (id !== generation.current || !conversation.current) {
          media.getTracks().forEach((track) => track.stop());
          if (id !== generation.current) return;
        }
        if (voiceActivityTimer.current) clearInterval(voiceActivityTimer.current);
        voiceActivityTimer.current = null;
        if (audioContext.current) void audioContext.current.close().catch(() => {});
        audioContext.current = null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        recorder.current = null;
        if (!conversation.current) stream.current = null;
        batchSpeechActive.current = false;
        // Roll capture over before awaiting transcription. Reuse the live mic
        // so the user's next words do not fall into a network/permission gap.
        if (conversation.current) void start(true, true);
        if (automatic && !heardSpeech) {
          // Staying available should not repeatedly send silent clips to ElevenLabs.
          return;
        }
        const blob = new Blob(chunks, { type: recording.mimeType.split(';')[0] });
        if (!blob.size) {
          speechInterrupted.current = !!pendingTurn.current || batchSpeechActive.current;
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
        batchRequests.current.add(controller);
        const form = new FormData();
        form.append(
          'audio',
          blob,
          'request.' +
            (blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'),
        );
        batchTranscriptions.current++;
        const previousDelivery = batchDelivery.current;
        let deliver!: () => void;
        const completed = new Promise<void>((resolve) => (deliver = resolve));
        batchDelivery.current = previousDelivery.then(() => completed);
        try {
          const response = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: form,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
          });
          const value = await response.json().catch(() => null);
          if (!response.ok)
            throw new Error(
              typeof value?.error === 'string'
                ? value.error
                : `Speech recognition is unavailable (HTTP ${response.status}). Please say that again.`,
            );
          if (!value || typeof value.text !== 'string')
            throw new Error(
              'Speech recognition returned an unreadable response. Please say that again.',
            );
          await previousDelivery;
          if (id !== generation.current) return;
          abort.current = null;
          const text = value.text?.trim();
          if (text && !isOtherAssistantTurn(text) && !isPlaybackEcho(text)) {
            setPhase(conversation.current ? 'processing' : 'idle');
            // The handoff to the new request is synchronous. Until this point,
            // pending speech blocks an older task from starting another reply.
            if (conversation.current) handleTranscriptSegment(text);
            else {
              speechInterrupted.current = false;
              transcriptHandler.current(text);
            }
            // Keep listening while the task runs, including commands without
            // an acknowledgment. A result must not be required to reopen the mic.
            if (conversation.current && id === generation.current) void start(true, true);
          } else if (conversation.current) {
            speechInterrupted.current =
              !!pendingTurn.current || batchSpeechActive.current || batchTranscriptions.current > 1;
            void start(true);
          } else {
            setPhase('idle');
            errorHandler.current(
              'No speech was recognized. Please try again or type your request.',
            );
          }
        } catch (error) {
          await previousDelivery;
          if (id === generation.current) {
            abort.current = null;
            speechInterrupted.current =
              !!pendingTurn.current || batchSpeechActive.current || batchTranscriptions.current > 1;
            errorHandler.current(
              error instanceof Error && error.name === 'TimeoutError'
                ? 'Transcription took too long. Try again or type your request.'
                : error instanceof Error
                  ? error.message
                  : 'Transcription failed.',
            );
            // A failed utterance must not silently turn off continuous voice.
            // Do not replay the recording or retry a command: reopen capture
            // and let the user give a fresh instruction without touching Play.
            if (conversation.current) {
              setPhase('listening');
              void start(true, true);
              // Recognition failed, so give a voice-only user a short cue.
              // speak preserves the listening recorder and cancels this cue
              // as soon as new speech starts. Output failures only report an
              // error; they never invoke this path or speak recursively.
              if (recoverySpeechEnabled.current)
                void speak("I couldn't process that. Please say it again.");
            } else setPhase('idle');
          }
        } finally {
          batchRequests.current.delete(controller);
          if (id === generation.current)
            batchTranscriptions.current = Math.max(0, batchTranscriptions.current - 1);
          await previousDelivery;
          deliver();
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
          // Cap startup calibration: speech may begin on the very first frame.
          if (sampleCount++ < 6) noiseFloor = Math.max(noiseFloor, Math.min(rms, 0.012));
          // During playback, echo cancellation removes most speaker output. The higher
          // threshold and sustained onset avoid treating a stray echo as an interruption.
          const audible =
            monitoringPlayback.current && !!audio.current
              ? rms > Math.max(0.027, noiseFloor * 2.4)
              : rms > Math.max(0.014, noiseFloor * 1.6);
          if (audible) {
            voiceFrames++;
            if (voiceFrames >= (monitoringPlayback.current && !!audio.current ? 3 : 2)) {
              if (!heardSpeech) {
                monitoringPlayback.current = false;
                speechInterrupted.current = true;
                speechStartHandler.current?.();
                stopOutput();
                setPhase('listening');
              }
              heardSpeech = true;
              batchSpeechActive.current = true;
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
            ? 'Microphone permission was denied. Allow microphone access for InsightOS, then try again. You can also type.'
            : name === 'NotFoundError'
              ? 'No microphone was found. Connect one, then try again.'
              : name === 'NotReadableError'
                ? 'The microphone is unavailable or in use by another app. Close that recording and try again.'
                : error instanceof Error
                  ? error.message
                  : 'Microphone unavailable.',
        );
      }
    } finally {
      if (recordingStart.current === id) recordingStart.current = null;
    }
  }

  async function startConversation(greeting?: string) {
    if (conversation.current) return;
    conversation.current = true;
    setConversationActive(true);
    clearMedia();
    clearTurn();
    utteranceSequence.current = 0;
    lastCommitted.current = { text: '', at: 0, utterance: 0 };
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
      await scribe.connect({ token: value.token });
      if (!conversation.current || id !== generation.current) scribe.disconnect();
    } catch {
      if (!conversation.current || id !== generation.current) return;
      // Still offer continuous conversation with the local recorder if the
      // account, browser, or network cannot start streaming transcription.
      voiceMode.current = 'batch';
      pendingGreeting.current = undefined;
      await start(true);
      if (
        greeting &&
        recoverySpeechEnabled.current &&
        conversation.current &&
        id === generation.current &&
        recorder.current?.state === 'recording'
      )
        void speak(greeting);
    }
  }

  function pauseConversation() {
    stop();
  }

  function skipSpeech() {
    if (voiceMode.current === 'realtime') {
      stopOutput();
      if (conversation.current) setPhase('listening');
      else setPhase('idle');
      return;
    }
    if (conversation.current && recorder.current?.state === 'recording') {
      monitoringPlayback.current = false;
      stopOutput();
      setPhase('listening');
      return;
    }
    if (conversation.current) void start(true);
    else stop();
  }

  function finish() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  async function speakRealtime(text: string) {
    if (speechInterrupted.current) return;
    stopOutput();
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
        const error = await response.json().catch(() => null);
        throw new Error(
          typeof error?.error === 'string'
            ? error.error
            : `Voice output is unavailable (HTTP ${response.status}). The answer remains in the transcript.`,
        );
      }
      const blob = await response.blob();
      if (!blob.size)
        throw new Error('Voice output returned no audio. The answer remains in the transcript.');
      setSpeechProvider(response.headers.get('X-Insight-Voice-Provider'));
      if (id !== outputGeneration.current || !conversation.current) return;
      outputAbort.current = null;
      url.current = URL.createObjectURL(blob);
      const playback = new Audio(url.current);
      audio.current = playback;
      spokenText.current = text;
      playback.onended = () => {
        if (id !== outputGeneration.current) return;
        stopOutput();
        if (conversation.current) setPhase('listening');
      };
      playback.onerror = () => {
        if (id !== outputGeneration.current) return;
        stopOutput();
        errorHandler.current('Audio playback failed. The full answer remains in the transcript.');
        if (conversation.current) setPhase('listening');
      };
      await playback.play();
    } catch (error) {
      if (id !== outputGeneration.current || !conversation.current) return;
      stopOutput();
      errorHandler.current(error instanceof Error ? error.message : 'Voice output failed.');
      setPhase('listening');
    }
  }

  async function speak(text: string) {
    if (voiceMode.current === 'realtime' && conversation.current) {
      await speakRealtime(text);
      return;
    }
    if (speechInterrupted.current) return;
    if (conversation.current) stopOutput();
    else clearMedia();
    const id = generation.current;
    const outputId = outputGeneration.current;
    speechInterrupted.current = false;
    const controller = new AbortController();
    outputAbort.current = controller;
    setPhase('speaking');
    // The fallback must also permit barge-in while TTS is still loading.
    // Existing recording stays open, preserving the user's first words.
    if (conversation.current) void start(true, true);
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 3000) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          typeof error?.error === 'string'
            ? error.error
            : `Voice output is unavailable (HTTP ${response.status}). The answer remains in the transcript.`,
        );
      }
      const blob = await response.blob();
      if (!blob.size)
        throw new Error('Voice output returned no audio. The answer remains in the transcript.');
      setSpeechProvider(response.headers.get('X-Insight-Voice-Provider'));
      if (id !== generation.current || outputId !== outputGeneration.current) return;
      outputAbort.current = null;
      url.current = URL.createObjectURL(blob);
      const playback = new Audio(url.current);
      audio.current = playback;
      spokenText.current = text;
      playback.onended = () => {
        if (id !== generation.current || outputId !== outputGeneration.current) return;
        speechEndedAt.current = Date.now();
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
        if (id !== generation.current || outputId !== outputGeneration.current) return;
        errorHandler.current('Audio playback failed. The full answer remains in the transcript.');
        if (conversation.current) void start(true);
        else {
          clearMedia();
          setPhase('idle');
        }
      };
      await playback.play();
      // Keep the microphone listening while ElevenLabs speaks. The recording includes
      // the beginning of an interruption, so its first words are not clipped by VAD.
      if (conversation.current && id === generation.current && audio.current === playback)
        monitoringPlayback.current = true;
    } catch (error) {
      if (
        id === generation.current &&
        outputId === outputGeneration.current &&
        !speechInterrupted.current
      ) {
        outputAbort.current = null;
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
    else if (
      recorder.current?.state === 'recording' ||
      recordingStart.current === generation.current
    )
      setPhase('listening');
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
      scribe.disconnect();
      clearTurn();
      clearMedia();
    },
    [],
  );

  return {
    phase,
    speechProvider,
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
