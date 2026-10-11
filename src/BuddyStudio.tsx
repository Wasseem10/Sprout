import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  AudioLines,
  Check,
  Circle,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react';
import AssistantSignal, { type BuddyVisualState } from './AssistantSignal';
import type { AudioPresentationSample } from './audioPresentation';
import type { BuddyRendererDiagnostics } from './buddyRenderer';
import { SPROUT_REPLAY, SPROUT_REPLAY_DURATION } from './buddyReplay';
import BuddyPanelPreview from './BuddyPanelPreview';
import './buddy-studio.css';

const states: {
  phase: BuddyVisualState;
  label: string;
  description: string;
  icon: typeof Circle;
}[] = [
  {
    phase: 'idle',
    label: 'Idle',
    description: 'A quiet presence, ready when you are.',
    icon: Circle,
  },
  {
    phase: 'listening',
    label: 'Listening',
    description: 'An attentive pose keeps the eyes easy to read.',
    icon: AudioLines,
  },
  {
    phase: 'thinking',
    label: 'Thinking',
    description: 'A smooth transition keeps the current conversation state visible.',
    icon: LoaderCircle,
  },
  {
    phase: 'speaking',
    label: 'Speaking',
    description: 'The speaking pose can use measured output levels when available.',
    icon: MessageSquare,
  },
  {
    phase: 'success',
    label: 'Done',
    description: 'A settled glow marks a completed step.',
    icon: Check,
  },
];

export default function BuddyStudio() {
  const [phase, setPhase] = useState<BuddyVisualState>('idle');
  const [expanded, setExpanded] = useState(false);
  const [panelVisited, setPanelVisited] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [size, setSize] = useState(96);
  const [reaction, setReaction] = useState(0);
  const [blink, setBlink] = useState(0);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const [simulatedLevel, setSimulatedLevel] = useState(0);
  const [replayRunning, setReplayRunning] = useState(false);
  const [replayTime, setReplayTime] = useState(0);
  const [diagnostics, setDiagnostics] = useState<BuddyRendererDiagnostics | null>(null);
  const audio = useRef<AudioPresentationSample>({
    inputLevel: null,
    outputLevel: null,
    inputSampledAt: 0,
    outputSampledAt: 0,
    playbackGeneration: 0,
    outputPlaying: false,
    source: 'simulated',
  });
  const launcher = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);
  const current = states.find((state) => state.phase === phase)!;

  useEffect(() => {
    const generation = audio.current.playbackGeneration + 1;
    let frame = 0;
    const sample = (now: number) => {
      audio.current = {
        inputLevel: phase === 'listening' ? simulatedLevel : null,
        outputLevel: phase === 'speaking' ? simulatedLevel : null,
        inputSampledAt: now,
        outputSampledAt: now,
        playbackGeneration: generation,
        outputPlaying: phase === 'speaking',
        source: 'simulated',
      };
      frame = requestAnimationFrame(sample);
    };
    sample(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [phase, simulatedLevel]);

  useEffect(() => {
    if (!replayRunning) return;
    let frame = 0;
    const started = performance.now();
    let index = 0;
    let lastLabel = -1;
    setMotionPaused(false);
    setGaze(null);
    const replay = (now: number) => {
      const time = (now - started) / 1000;
      while (index < SPROUT_REPLAY.length && SPROUT_REPLAY[index].at <= time) {
        const event = SPROUT_REPLAY[index++];
        if (event.kind === 'phase') setPhase(event.phase);
        else if (event.kind === 'click') setReaction((value) => value + 1);
        else if (event.kind === 'blink') setBlink((value) => value + 1);
        else if (event.kind === 'gaze') setGaze({ x: event.x, y: event.y });
        else {
          setMotionPaused(!event.moving);
          if (event.moving) setSize(96);
        }
      }
      const label = Math.min(SPROUT_REPLAY_DURATION, Math.floor(time * 4) / 4);
      if (label !== lastLabel) {
        setReplayTime(label);
        lastLabel = label;
      }
      if (time >= SPROUT_REPLAY_DURATION) {
        setReplayRunning(false);
        return;
      }
      frame = requestAnimationFrame(replay);
    };
    frame = requestAnimationFrame(replay);
    return () => cancelAnimationFrame(frame);
  }, [replayRunning]);

  useEffect(() => {
    if (expanded) {
      hasOpened.current = true;
    } else if (hasOpened.current) {
      launcher.current?.focus();
    }
  }, [expanded]);

  return (
    <div className={`buddy-studio${motionPaused ? ' studio-motion-paused' : ''}`}>
      <a className="studio-skip" href="#studio-state-controls">
        Skip to state controls
      </a>
      <header className="studio-nav">
        <a className="studio-brand" href="?demo=public" aria-label="InsightOS sample home">
          <Sparkles size={25} aria-hidden="true" />
          <span>
            Insight<span>OS</span>
          </span>
        </a>
        <a className="studio-nav-label" href="?studio=panel">
          Panel & backgrounds
        </a>
        <a className="studio-back" href="?demo=public">
          Public sample <ArrowRight size={17} aria-hidden="true" />
        </a>
      </header>

      <main className="studio-layout">
        <section className="studio-brief" aria-labelledby="studio-title">
          <p className="studio-kicker">THE DESKTOP COMPANION</p>
          <h1 id="studio-title">
            A little presence.
            <br />
            <span>A world of possibility.</span>
          </h1>
          <p className="studio-intro">
            A companion with its own rhythm. Quiet when you need space, expressive when you need a
            hand.
          </p>
          <p className="studio-preview-note">
            <span>Visual preview</span> All states are simulated. The microphone and AI are not
            connected.
          </p>
        </section>

        <section className="studio-showcase" aria-labelledby="studio-preview-title">
          <div className="studio-preview-heading">
            <h2 id="studio-preview-title">Meet Sprout</h2>
            <span>{expanded ? 'Expanded view' : 'Floating view'}</span>
          </div>
          <div
            className={`studio-preview${expanded ? ' is-expanded' : ''}`}
            data-preview-state={phase}
          >
            <div className="studio-desktop-toolbar" aria-hidden="true">
              <span>YOUR WORKSPACE</span>
              <span>Companion preview</span>
            </div>
            <div className="studio-atmosphere" aria-hidden="true" />
            <button
              ref={launcher}
              className="studio-launcher"
              type="button"
              aria-expanded={expanded}
              aria-controls={panelVisited ? 'buddy-conversation-panel' : undefined}
              aria-label={
                expanded ? 'Collapse conversation preview' : 'Expand conversation preview'
              }
              style={{ '--studio-signal-size': `${size}px` } as CSSProperties}
              onClick={() => {
                setPanelVisited(true);
                setReaction((value) => value + 1);
                setExpanded(!expanded);
              }}
            >
              <AssistantSignal
                phase={phase}
                motion={!motionPaused}
                audio={audio}
                reaction={reaction}
                blink={blink}
                gaze={gaze}
                onDiagnostics={setDiagnostics}
              />
              <span className="studio-launcher-caption" aria-hidden="true">
                <MessageSquare size={16} />
                {expanded ? 'Close conversation' : 'Open conversation'}
              </span>
            </button>

            {panelVisited && (
              <div className="studio-real-panel" hidden={!expanded}>
                <BuddyPanelPreview
                  embedded
                  expanded={expanded}
                  onToggle={() => setExpanded(false)}
                  phase={phase}
                  onPhaseChange={setPhase}
                  audio={audio}
                  visual={{
                    phase,
                    motion: !motionPaused,
                    reaction,
                    blink,
                    gaze,
                    onDiagnostics: setDiagnostics,
                  }}
                />
              </div>
            )}

            <div className="studio-preview-status" role="status" aria-live="polite">
              <span className={`studio-state-light state-${phase}`} aria-hidden="true" />
              <span>
                <strong>{current.label}</strong>
                <span>Simulated state</span>
              </span>
            </div>
          </div>

          <div id="studio-state-controls" className="studio-controls" tabIndex={-1}>
            <div className="studio-control-heading">
              <h3>Explore the states</h3>
              <span>Click a state to preview its motion</span>
            </div>
            <div className="studio-state-buttons" role="group" aria-label="Preview assistant state">
              {states.map((state) => (
                <button
                  key={state.phase}
                  type="button"
                  aria-pressed={phase === state.phase}
                  onClick={() => {
                    setReplayRunning(false);
                    setPhase(state.phase);
                  }}
                >
                  <state.icon size={17} aria-hidden="true" />
                  {state.label}
                </button>
              ))}
            </div>
            <div className="studio-controls-footer">
              <p>{current.description}</p>
              <button
                type="button"
                className="studio-motion-toggle"
                aria-pressed={motionPaused}
                onClick={() => {
                  setReplayRunning(false);
                  setMotionPaused(!motionPaused);
                }}
              >
                {motionPaused ? (
                  <Play size={16} aria-hidden="true" />
                ) : (
                  <Pause size={16} aria-hidden="true" />
                )}
                {motionPaused ? 'Resume motion' : 'Pause motion'}
              </button>
            </div>
            <div className="studio-proof-controls">
              <fieldset>
                <legend>Actual-size comparison</legend>
                <div className="studio-size-buttons">
                  {[44, 96, 160, 320].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={size === value}
                      onClick={() => setSize(value)}
                    >
                      {value}px
                    </button>
                  ))}
                </div>
                <p>44px compact · 96px desktop · 160px detail · 320px material study</p>
              </fieldset>
              <div className="studio-reaction-buttons">
                <button type="button" onClick={() => setReaction((value) => value + 1)}>
                  Click reaction
                </button>
                <button type="button" onClick={() => setBlink((value) => value + 1)}>
                  Blink
                </button>
                <button
                  type="button"
                  aria-pressed={replayRunning}
                  onClick={() => {
                    setReplayTime(0);
                    setReplayRunning(!replayRunning);
                  }}
                >
                  {replayRunning ? 'Stop simulated replay' : 'Run simulated replay'}
                </button>
              </div>
              <p className="studio-replay-note">
                Simulated replay: two idle loops, click → listen, blink/gaze, interrupted blends,
                pause and resume, then Think/Speak transitions.{' '}
                {replayTime > 0
                  ? `${replayTime.toFixed(2)} / ${SPROUT_REPLAY_DURATION.toFixed(2)}s`
                  : ''}
              </p>
              <label className="studio-level-control" htmlFor="studio-audio-level">
                Simulated audio level <span>{Math.round(simulatedLevel * 100)}%</span>
                <input
                  id="studio-audio-level"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={simulatedLevel}
                  aria-valuetext={`${Math.round(simulatedLevel * 100)} percent`}
                  onChange={(event) => setSimulatedLevel(Number(event.target.value))}
                />
              </label>
              <p className="studio-replay-note">
                Synthetic numbers only, used in Listening/Speaking. No microphone or playback
                session.
              </p>
              <details
                className="studio-render-report"
                data-diagnostics={diagnostics ? JSON.stringify(diagnostics) : undefined}
              >
                <summary>Renderer measurement</summary>
                {diagnostics ? (
                  <p>
                    {diagnostics.asset === 'sprout' ? 'Sprout' : 'Ribbon fallback'} ·{' '}
                    {diagnostics.vertices.toLocaleString()} vertices · {diagnostics.drawCalls} draw
                    calls · {diagnostics.resolution}
                    <br />
                    {diagnostics.frames} rendered frames · p95 interval{' '}
                    {diagnostics.intervalP95.toFixed(1)}ms · max{' '}
                    {diagnostics.intervalMax.toFixed(1)}ms · {diagnostics.missedBudgets} intervals
                    above 18ms · p95 render call {diagnostics.renderP95.toFixed(2)}ms
                  </p>
                ) : (
                  <p>Loading or static image fallback. No WebGL measurement available.</p>
                )}
                {diagnostics?.assetIssues.length ? (
                  <p>Sprout export gate: {diagnostics.assetIssues.join('; ')}</p>
                ) : null}
                {diagnostics ? (
                  <p>
                    {Math.round(diagnostics.startup.assetBytes / 1024)} KiB asset · fetch{' '}
                    {diagnostics.startup.fetchMs.toFixed(1)}ms · parse{' '}
                    {diagnostics.startup.parseMs.toFixed(1)}ms · first model render{' '}
                    {diagnostics.startup.firstRenderMs.toFixed(1)}ms
                    <br />
                    {diagnostics.memory.geometries} geometries · {diagnostics.memory.textures}{' '}
                    textures. Total GPU memory is unavailable from WebGL.
                  </p>
                ) : null}
                <p>
                  Local render-clock samples, not a verified presented-frame or real voice report.
                </p>
              </details>
            </div>
          </div>
        </section>
        <dl className="studio-principles">
          <div>
            <dt>Within reach</dt>
            <dd>
              A little companion opens into a compact conversation, then returns to your workspace.
            </dd>
          </div>
          <div>
            <dt>Easy to understand</dt>
            <dd>Distinct visual states pair motion with plain-language status.</dd>
          </div>
          <div>
            <dt>Your pace</dt>
            <dd>
              Pause the motion, explore with your keyboard, and open or close the panel anytime.
            </dd>
          </div>
        </dl>
      </main>
      <footer className="studio-footer">
        <span>InsightOS / Visual exploration</span>
        <span>Keyboard access and reduced motion supported</span>
        <a
          href="https://threejs.org/examples/webgl_animation_skinning_morph.html"
          target="_blank"
          rel="noreferrer"
        >
          Animation technique: Three.js <ArrowRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
