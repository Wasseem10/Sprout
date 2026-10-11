import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  Check,
  Circle,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import AssistantSignal, { type BuddyVisualState } from './AssistantSignal';
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
    description: 'A gentle pulse makes attention visible.',
    icon: AudioLines,
  },
  {
    phase: 'thinking',
    label: 'Thinking',
    description: 'A flowing signal gives a moment of thought its own rhythm.',
    icon: LoaderCircle,
  },
  {
    phase: 'speaking',
    label: 'Speaking',
    description: 'Light and motion give the reply a voice.',
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
  const [motionPaused, setMotionPaused] = useState(false);
  const [draft, setDraft] = useState('');
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);
  const current = states.find((state) => state.phase === phase)!;

  useEffect(() => {
    if (expanded) {
      hasOpened.current = true;
      closeButton.current?.focus();
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
        <span className="studio-nav-label">Interaction studio</span>
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
            <h2 id="studio-preview-title">Meet Insight</h2>
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
              aria-controls={expanded ? 'studio-conversation' : undefined}
              aria-label={
                expanded ? 'Collapse conversation preview' : 'Expand conversation preview'
              }
              onClick={() => setExpanded(!expanded)}
            >
              <AssistantSignal phase={phase} motion={!motionPaused} />
              <span className="studio-launcher-caption" aria-hidden="true">
                <MessageSquare size={16} />
                {expanded ? 'Close conversation' : 'Open conversation'}
              </span>
            </button>

            {expanded && (
              <section
                id="studio-conversation"
                className="studio-conversation"
                aria-labelledby="studio-conversation-title"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setExpanded(false);
                }}
              >
                <header className="studio-conversation-header">
                  <AssistantSignal small phase={phase} motion={!motionPaused} />
                  <div>
                    <h3 id="studio-conversation-title">Insight</h3>
                    <p>Conversation preview</p>
                  </div>
                  <button
                    ref={closeButton}
                    className="studio-close"
                    type="button"
                    aria-label="Close conversation panel"
                    onClick={() => setExpanded(false)}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                </header>
                <div className="studio-panel-state">
                  <current.icon size={16} aria-hidden="true" />
                  <span>{current.label} preview</span>
                </div>
                <div className="studio-conversation-body">
                  <p className="studio-example-label">SAMPLE CONVERSATION</p>
                  <div className="studio-user-message">
                    <span>You</span>
                    <p>Can we take this one step at a time?</p>
                  </div>
                  <div className="studio-assistant-message">
                    <span>Insight</span>
                    <p>
                      Of course. You can pause, ask me to repeat a detail, or change direction
                      whenever you need.
                    </p>
                  </div>
                </div>
                <form className="studio-composer" onSubmit={(event) => event.preventDefault()}>
                  <label htmlFor="studio-draft">Preview the message field</label>
                  <div>
                    <textarea
                      id="studio-draft"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Type here to try the layout…"
                      rows={2}
                      maxLength={400}
                      aria-describedby="studio-composer-note"
                    />
                    <button type="button" disabled aria-label="Send unavailable in visual preview">
                      <ArrowUp size={19} aria-hidden="true" />
                    </button>
                  </div>
                  <p id="studio-composer-note">Sample text only. Messages are not sent.</p>
                </form>
              </section>
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
                  onClick={() => setPhase(state.phase)}
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
                onClick={() => setMotionPaused(!motionPaused)}
              >
                {motionPaused ? (
                  <Play size={16} aria-hidden="true" />
                ) : (
                  <Pause size={16} aria-hidden="true" />
                )}
                {motionPaused ? 'Resume motion' : 'Pause motion'}
              </button>
            </div>
          </div>
        </section>
        <dl className="studio-principles">
          <div>
            <dt>Within reach</dt>
            <dd>
              A floating core opens into a compact conversation, then returns to your workspace.
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
        <a href="https://ui.elevenlabs.io/docs/components/orb" target="_blank" rel="noreferrer">
          Interaction reference: ElevenLabs Orb <ArrowRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
