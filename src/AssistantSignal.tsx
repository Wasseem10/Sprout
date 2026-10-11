import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  BuddyRenderer,
  BuddyRendererDiagnostics,
  BuddyRendererSettings,
} from './buddyRenderer';
import type { AudioPresentationRef } from './audioPresentation';
import type { BuddyBehaviorInput, BuddyBehaviorSnapshot } from './buddyBehavior';
import './assistant-signal.css';

export type BuddyVisualState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'success';

/** Presentation adapter only: voice ownership remains in the conversation hook. */
export function buddyVisualState(voicePhase: string, busy: boolean): BuddyVisualState {
  if (voicePhase === 'speaking') return 'speaking';
  if (busy || ['starting', 'transcribing', 'processing'].includes(voicePhase)) return 'thinking';
  return voicePhase === 'listening' ? 'listening' : 'idle';
}

/** Match static rest to the requested/loaded generation, keeping closed-eye fallbacks before idle. */
export function buddyStillPaths(assetUrl: string | undefined, sleeping: boolean) {
  if (assetUrl?.includes('insight-core-v1')) return ['/buddy/insight-core-v1.png'];
  const version = assetUrl?.match(/v00[2-7](?=\.glb$)/)?.[0] ?? 'v005';
  const idle = `/buddy/sprout-${version}.png`;
  if (sleeping && ['v004', 'v005', 'v006', 'v007'].includes(version))
    return [
      `/buddy/sprout-${version}-sleep.png`,
      ...(version === 'v007' ? ['/buddy/sprout-v006-sleep.png'] : []),
      ...(['v006', 'v007'].includes(version) ? ['/buddy/sprout-v005-sleep.png'] : []),
      ...(['v005', 'v006', 'v007'].includes(version) ? ['/buddy/sprout-v004-sleep.png'] : []),
      idle,
      '/buddy/sprout-v003.png',
      '/buddy/insight-core-v1.png',
    ];
  return [
    idle,
    ...(version === 'v007' ? ['/buddy/sprout-v006.png'] : []),
    ...(['v006', 'v007'].includes(version) ? ['/buddy/sprout-v005.png'] : []),
    ...(['v005', 'v006', 'v007'].includes(version) ? ['/buddy/sprout-v004.png'] : []),
    '/buddy/sprout-v003.png',
    '/buddy/insight-core-v1.png',
  ].filter((path, index, paths) => paths.indexOf(path) === index);
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
  behavior,
  onBehaviorChange,
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
  reflectionProfile?: BuddyRendererSettings['reflectionProfile'];
  behavior?: BuddyBehaviorInput;
  onBehaviorChange?: (snapshot: BuddyBehaviorSnapshot) => void;
  onDiagnostics?: (diagnostics: BuddyRendererDiagnostics) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<BuddyRenderer | null>(null);
  const behaviorHandler = useRef(onBehaviorChange);
  const [character, setCharacter] = useState<BuddyBehaviorSnapshot | null>(null);
  const reportBehavior = useCallback((snapshot: BuddyBehaviorSnapshot) => {
    setCharacter(snapshot);
    behaviorHandler.current?.(snapshot);
  }, []);
  const settings = useRef<BuddyRendererSettings>({
    phase,
    motion,
    audio,
    reaction,
    blink,
    gaze,
    assetUrl,
    reflectionProfile,
    behavior,
    onBehaviorChange: reportBehavior,
  });
  const diagnosticsHandler = useRef(onDiagnostics);
  const [ready, setReady] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [loadedAssetUrl, setLoadedAssetUrl] = useState<string | undefined>(assetUrl);
  const sleepingStill = behavior?.automatic
    ? behavior.automatic.presence === 'asleep'
    : character?.mode === 'sleep';
  const sleepAnchor = character?.headAnchor ?? { x: 0.5, y: 0.52 };
  const showSleepZs = ready
    ? character?.mode === 'sleep' && character.visible && character.headAnchor
    : sleepingStill;
  const stillAssetUrl = loadedAssetUrl ?? assetUrl;
  const imagePaths = buddyStillPaths(stillAssetUrl, Boolean(sleepingStill));
  useEffect(() => {
    setImageIndex(0);
  }, [sleepingStill, stillAssetUrl]);
  const [asset, setAsset] = useState<'sprout' | 'ribbon' | 'loading'>('loading');

  useEffect(() => {
    diagnosticsHandler.current = onDiagnostics;
  }, [onDiagnostics]);
  useEffect(() => {
    behaviorHandler.current = onBehaviorChange;
  }, [onBehaviorChange]);

  useEffect(() => {
    settings.current = {
      phase,
      motion,
      audio,
      reaction,
      blink,
      gaze,
      assetUrl,
      reflectionProfile,
      behavior,
      onBehaviorChange: reportBehavior,
    };
    renderer.current?.update(settings.current);
  }, [
    phase,
    motion,
    audio,
    reaction,
    blink,
    gaze,
    assetUrl,
    reflectionProfile,
    behavior,
    reportBehavior,
  ]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setReady(false);
    setAsset('loading');
    setLoadedAssetUrl(assetUrl);
    setCharacter(null);
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
            setLoadedAssetUrl(diagnostics.assetUrl);
            diagnosticsHandler.current?.(diagnostics);
          },
        );
        if (cancelled) instance?.dispose();
        else {
          renderer.current = instance;
          instance?.update(settings.current, true);
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
      className={`insight-signal${small ? ' is-small' : ''}${ready ? ' is-rendered' : ''}${imageIndex >= imagePaths.length ? ' image-unavailable' : ''}`}
      data-phase={phase}
      data-renderer={ready ? 'webgl' : 'fallback'}
      data-model={asset}
      data-asset-url={loadedAssetUrl}
      data-behavior={!ready && sleepingStill ? 'sleep' : (character?.mode ?? 'normal')}
      data-done={character?.doneActive || undefined}
      aria-hidden="true"
    >
      <span className="signal-halo" />
      <span className="signal-css-fallback">
        <span className="signal-pearl" />
        <span className="signal-ribbon" />
      </span>
      {imageIndex < imagePaths.length && (
        <img
          className="signal-authored-image"
          src={imagePaths[imageIndex]}
          alt=""
          draggable={false}
          onError={() => setImageIndex((index) => Math.min(imagePaths.length, index + 1))}
        />
      )}
      <canvas
        key={`${assetUrl ?? 'default'}:${reflectionProfile ?? 'default'}`}
        ref={canvas}
        className="signal-canvas"
      />
      {showSleepZs && (
        <span
          className="signal-sleep-zs"
          data-moving={Boolean(ready && character?.moving && motion)}
          style={
            {
              '--sleep-head-x': `${sleepAnchor.x * 100}%`,
              '--sleep-head-y': `${sleepAnchor.y * 100}%`,
            } as CSSProperties
          }
        >
          <span>Z</span>
          <span>Z</span>
          <span>Z</span>
        </span>
      )}
    </span>
  );
}
