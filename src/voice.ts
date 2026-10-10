import { useRef, useState, useEffect } from 'react';
export function useVoice(onTranscript: (text: string) => void, onError: (text: string) => void) {
  const [phase, setPhase] = useState<
    'idle' | 'starting' | 'listening' | 'transcribing' | 'speaking'
  >('idle');
  const generation = useRef(0),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    url = useRef<string | null>(null);
  const transcriptHandler = useRef(onTranscript),
    errorHandler = useRef(onError);
  transcriptHandler.current = onTranscript;
  errorHandler.current = onError;
  function stop() {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPhase('idle');
  }
  async function start() {
    stop();
    const id = generation.current;
    setPhase('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Microphone access needs the desktop app, localhost, or HTTPS.');
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (id !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const recording = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recording.onerror = () => {
        if (id === generation.current) {
          stop();
          errorHandler.current('Microphone recording failed. You can still type your request.');
        }
      };
      recording.onstop = async () => {
        media.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (id !== generation.current) return;
        const blob = new Blob(chunks, { type: recording.mimeType.split(';')[0] });
        if (!blob.size) {
          setPhase('idle');
          errorHandler.current('No audio was recorded.');
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
          setPhase('idle');
          if (value.text?.trim()) transcriptHandler.current(value.text.trim());
          else
            errorHandler.current(
              'No speech was recognized. Please try again or type your request.',
            );
        } catch (e) {
          if (id === generation.current) {
            setPhase('idle');
            errorHandler.current(
              e instanceof Error && e.name === 'TimeoutError'
                ? 'Transcription took too long. Try again or type your request.'
                : e instanceof Error
                  ? e.message
                  : 'Transcription failed.',
            );
          }
        }
      };
      recording.start();
      setPhase('listening');
      timer.current = setTimeout(() => {
        if (recording.state === 'recording') recording.stop();
      }, 30000);
    } catch (e) {
      if (id === generation.current) {
        stop();
        const name = e instanceof Error ? e.name : '';
        errorHandler.current(
          name === 'NotAllowedError'
            ? 'Microphone permission was denied. Allow microphone access for InsightOS, then try again. You can also type.'
            : name === 'NotFoundError'
              ? 'No microphone was found. Connect one, then try again.'
              : name === 'NotReadableError'
                ? 'The microphone is unavailable or in use by another app. Close that recording and try again.'
                : e instanceof Error
                  ? e.message
                  : 'Microphone unavailable.',
        );
      }
    }
  }
  function finish() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }
  async function speak(text: string) {
    stop();
    const id = generation.current,
      controller = new AbortController();
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
      url.current = URL.createObjectURL(blob);
      const playback = new Audio(url.current);
      audio.current = playback;
      playback.onended = () => {
        if (id === generation.current) stop();
      };
      playback.onerror = () => {
        if (id === generation.current) {
          stop();
          errorHandler.current('Audio playback failed. The full answer remains in the transcript.');
        }
      };
      await playback.play();
    } catch (e) {
      if (id === generation.current) {
        stop();
        errorHandler.current(e instanceof Error ? e.message : 'Voice output failed.');
      }
    }
  }
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
      stream.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { phase, start, finish, speak, stop };
}
