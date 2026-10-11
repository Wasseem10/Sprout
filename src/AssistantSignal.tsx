import { useEffect, useRef, useState } from 'react';
import type {
  BuddyRenderer,
  BuddyRendererDiagnostics,
  BuddyRendererSettings,
} from './buddyRenderer';
import type { AudioPresentationRef } from './audioPresentation';
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
  audio,
  reaction = 0,
  blink = 0,
  gaze,
  assetUrl,
  reflectionProfile,
  onDiagnostics,
}: {
  active?: boolean;
  small?: boolean;
  phase?: BuddyVisualState;
  motion?: boolean;
  audio?: AudioPresentationRef;
  reaction?: number;
  blink?: number;
  gaze?: { x: number; y: number } | null;
  /** Owned local asset variant used by the material review studio. */
  assetUrl?: string;
  reflectionProfile?: 'rectangular' | 'tapered';
  onDiagnostics?: (diagnostics: BuddyRendererDiagnostics) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<BuddyRenderer | null>(null);
  const settings = useRef<BuddyRendererSettings>({
    phase,
    motion,
    audio,
    reaction,
    blink,
    gaze,
    assetUrl,
    reflectionProfile,
  });
  const diagnosticsHandler = useRef(onDiagnostics);
  const [ready, setReady] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [asset, setAsset] = useState<'sprout' | 'ribbon' | 'loading'>('loading');

  useEffect(() => {
    diagnosticsHandler.current = onDiagnostics;
  }, [onDiagnostics]);

  useEffect(() => {
    settings.current = { phase, motion, audio, reaction, blink, gaze, assetUrl, reflectionProfile };
    renderer.current?.update(settings.current);
  }, [phase, motion, audio, reaction, blink, gaze, assetUrl, reflectionProfile]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setReady(false);
    setAsset('loading');
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
          (diagnostics) => {
            if (cancelled) return;
            setAsset(diagnostics.asset);
            diagnosticsHandler.current?.(diagnostics);
          },
        );
        if (cancelled) instance?.dispose();
        else {
          renderer.current = instance;
          instance?.update(settings.current);
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
  }, [assetUrl, reflectionProfile]);

  return (
    <span
      className={`insight-signal${small ? ' is-small' : ''}${ready ? ' is-rendered' : ''}${imageIndex > 1 ? ' image-unavailable' : ''}`}
      data-phase={phase}
      data-renderer={ready ? 'webgl' : 'fallback'}
      data-model={asset}
      aria-hidden="true"
    >
      <span className="signal-halo" />
      <span className="signal-css-fallback">
        <span className="signal-pearl" />
        <span className="signal-ribbon" />
      </span>
      {imageIndex < 2 && (
        <img
          className="signal-authored-image"
          src={imageIndex === 0 ? '/buddy/sprout-v003.png' : '/buddy/insight-core-v1.png'}
          alt=""
          draggable={false}
          onError={() => setImageIndex((index) => Math.min(2, index + 1))}
        />
      )}
      <canvas
        key={`${assetUrl ?? 'default'}:${reflectionProfile ?? 'default'}`}
        ref={canvas}
        className="signal-canvas"
      />
    </span>
  );
}
