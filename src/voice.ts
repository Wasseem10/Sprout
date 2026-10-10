import { useEffect, useRef, useState } from 'react';

type VoicePhase = 'idle' | 'starting' | 'listening' | 'transcribing' | 'processing' | 'speaking';

const SILENCE_AFTER_SPEECH_MS = 1350;
const MAX_RECORDING_MS = 30000;

export function useVoice(onTranscript: (text: string) => void, onError: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [conversationActive, setConversationActive] = useState(false);
  const generation = useRef(0);
  const conversation = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
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
  const errorHandler = useRef(onError);
  transcriptHandler.current = onTranscript;
  errorHandler.current = onError;

  function clearMedia() {
    generation.current++;
    monitoringPlayback.current = false;
    speechInterrupted.current = false;
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
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }

  function stop() {
    conversation.current = false;
    setConversationActive(false);
    clearMedia();
    setPhase('idle');
  }

  async function start(automatic = false, monitorPlayback = false) {
    if (!monitorPlayback) clearMedia();
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
                audio.current?.pause();
                audio.current = null;
                if (url.current) URL.revokeObjectURL(url.current);
                url.current = null;
                setPhase('listening');
              }
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
    }
  }

  function startConversation() {
    conversation.current = true;
    setConversationActive(true);
    void start(true);
  }

  function pauseConversation() {
    stop();
  }

  function skipSpeech() {
    if (conversation.current && recorder.current?.state === 'recording') {
      monitoringPlayback.current = false;
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

  async function speak(text: string) {
    clearMedia();
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
      const playback = new Audio(url.current);
      audio.current = playback;
      playback.onended = () => {
        if (id !== generation.current) return;
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
        void start(true, true);
    } catch (error) {
      if (id === generation.current && !speechInterrupted.current) {
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
    if (conversation.current) void start(true);
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
      clearMedia();
    },
    [],
  );

  return {
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
