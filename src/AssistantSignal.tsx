import { useEffect, useRef, useState } from 'react';
import type { BuddyRenderer } from './buddyRenderer';
import './assistant-signal.css';

export type BuddyVisualState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'success';

/** Presentation adapter only: voice ownership remains in the conversation hook. */
export function buddyVisualState(voicePhase: string, busy: boolean): BuddyVisualState {
  if (voicePhase === 'speaking') return 'speaking';
  if (busy || ['starting', 'transcribing', 'processing'].includes(voicePhase)) return 'thinking';
  return voicePhase === 'listening' ? 'listening' : 'idle';
}

/** Decorative model. Adjacent HTML always communicates the conversation state. */
export default function AssistantSignal({
  active = false,
  small = false,
  phase = active ? 'speaking' : 'idle',
  motion = true,
}: {
  active?: boolean;
  small?: boolean;
  phase?: BuddyVisualState;
  motion?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<BuddyRenderer | null>(null);
  const settings = useRef({ phase, motion });
  const [ready, setReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    settings.current = { phase, motion };
    renderer.current?.update(phase, motion);
  }, [phase, motion]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Load the engine independently from the text, controls, and voice connection.
    void import('./buddyRenderer')
      .then(async ({ createBuddyRenderer }) => {
        if (cancelled || !canvas.current) return;
        const instance = await createBuddyRenderer(
          canvas.current,
          settings.current,
          (value) => {
            if (!cancelled) setReady(value);
          },
          controller.signal,
        );
        if (cancelled) instance?.dispose();
        else {
          renderer.current = instance;
          instance?.update(settings.current.phase, settings.current.motion);
        }
      })
      .catch(() => {
        /* Authored image remains available without GPU support. */
      });
    return () => {
      cancelled = true;
      controller.abort();
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  return (
    <span
      className={`insight-signal${small ? ' is-small' : ''}${ready ? ' is-rendered' : ''}${imageFailed ? ' image-unavailable' : ''}`}
      data-phase={phase}
      data-renderer={ready ? 'webgl' : 'fallback'}
      aria-hidden="true"
    >
      <span className="signal-halo" />
      <span className="signal-css-fallback">
        <span className="signal-pearl" />
        <span className="signal-ribbon" />
      </span>
      {!imageFailed && (
        <img
          className="signal-authored-image"
          src="/buddy/insight-core-v1.png"
          alt=""
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      )}
      <canvas ref={canvas} className="signal-canvas" />
    </span>
  );
}
