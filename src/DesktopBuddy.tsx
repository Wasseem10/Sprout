import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from 'react';
import {
  ArrowUp,
  ChevronUp,
  Code2,
  Eye,
  FolderOpen,
  Globe,
  Maximize2,
  Mic,
  Minus,
  Pause,
  PauseCircle,
  Presentation,
  Settings2,
  Square,
  Table2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ComputerState } from '../shared/computer';
import './buddy.css';
import EnergyPanel from './EnergyPanel';
import FinancePanel from './FinancePanel';
import AssistantSignal, { buddyVisualState } from './AssistantSignal';
import type { AudioPresentationRef } from './audioPresentation';
import { useBuddyPanel, type BuddyReadingMemory } from './useBuddyPanel';
import BuddyDisclosure, { type BuddyDisclosureAction } from './BuddyDisclosure';

type Props = {
  embedded?: boolean;
  /** Presentation-only overrides for the labelled local review studio. */
  visual?: Pick<
    ComponentProps<typeof AssistantSignal>,
    'phase' | 'motion' | 'reaction' | 'blink' | 'gaze' | 'onDiagnostics' | 'assetUrl'
  >;
  expanded: boolean;
  modalOpen: boolean;
  active: boolean;
  conversationActive: boolean;
  busy: boolean;
  enabled: boolean;
  voicePhase: string;
  audio?: AudioPresentationRef;
  voiceReady: boolean;
  speech: boolean;
  speechReady: boolean;
  shortcut: boolean | null;
  state: ComputerState;
  resultView: 'home' | 'code' | 'office' | 'browser' | 'screen' | 'energy' | 'finance';
  request: string;
  messages: { id: string; role: 'user' | 'assistant' | 'error'; text: string }[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  transcriptRef: RefObject<HTMLDivElement | null>;
  readingMemory: RefObject<BuddyReadingMemory>;
  expand: () => void;
  expansionFailed: () => void;
  hide: () => void;
  talk: () => void;
  stop: () => void;
  settings: () => void;
  workspace: () => void;
  folder: () => void;
  screen: () => void;
  toggleSpeech: () => void;
  setRequest: (text: string) => void;
  suggest: (text: string) => void;
  send: () => void;
  run: () => void;
  editor: () => void;
  openPresentation: () => void;
  openSpreadsheet: () => void;
};
export default function DesktopBuddy(p: Props) {
  const Root = p.embedded ? 'section' : 'main';
  const pet = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const [reaction, setReaction] = useState(0);
  const [disclosure, setDisclosure] = useState<'ideas' | 'tools' | null>(null);
  const dismissDisclosure = useCallback(() => setDisclosure(null), []);
  const panel = useBuddyPanel({
    expanded: p.expanded,
    modalOpen: p.modalOpen,
    pet,
    close,
    input: p.inputRef,
    feed: p.transcriptRef,
    readingMemory: p.readingMemory,
    expansionFailed: p.expansionFailed,
  });
  useLayoutEffect(() => {
    // The welcome starts at the beginning; actual conversation updates may follow the bottom.
    if (p.messages.some((message) => message.id !== 'welcome')) panel.followNewContent();
  }, [p.messages, panel.available]);
  useEffect(() => {
    if (!p.expanded || p.modalOpen) dismissDisclosure();
  }, [p.expanded, p.modalOpen, dismissDisclosure]);
  useLayoutEffect(() => {
    const feed = p.transcriptRef.current;
    const form = composer.current;
    if (!feed || !form) return;
    // Disclosures share the reading well. They must never cover the native-window actions.
    const boundDisclosure = () => {
      form.style.setProperty('--buddy-disclosure-height', `${feed.clientHeight}px`);
    };
    boundDisclosure();
    const observer = new ResizeObserver(boundDisclosure);
    observer.observe(feed);
    return () => observer.disconnect();
  }, [p.transcriptRef]);
  const activatePet = () => {
    setReaction((value) => value + 1);
    p.expand();
  };
  const openWorkspace = () => {
    panel.rememberReadingPosition();
    p.workspace();
  };
  const status = p.conversationActive
    ? p.voicePhase === 'speaking'
      ? 'Speaking · listening'
      : p.busy || p.voicePhase === 'processing'
        ? 'Working · listening'
        : p.voicePhase === 'transcribing'
          ? 'Understanding · listening'
          : 'Listening…'
    : p.busy
      ? 'Working…'
      : p.voicePhase === 'starting'
        ? 'Opening mic…'
        : 'Ready to talk';
  const conversation = p.messages.filter((m) => m.id !== 'welcome');
  const voiceHelp = p.conversationActive
    ? 'Speak anytime, even during my reply. Pause ends the voice conversation; Stop also cancels the task.'
    : p.shortcut === false
      ? 'Start a voice conversation with the microphone button.'
      : 'Start a voice conversation with the microphone button or Control + Shift + Space.';
  const voiceControl = (
    <button
      type="button"
      className={`buddy-play ${p.conversationActive ? 'playing' : ''} ${p.voicePhase === 'listening' ? 'listening' : ''}`}
      onClick={p.talk}
      disabled={!p.conversationActive && (!p.enabled || !p.voiceReady || p.busy)}
      aria-label={p.conversationActive ? 'Pause voice conversation' : 'Start voice conversation'}
      aria-pressed={p.conversationActive}
      aria-describedby="buddy-voice-help"
      aria-keyshortcuts={p.shortcut === false ? undefined : 'Control+Shift+Space'}
      title={
        p.conversationActive
          ? 'Pause conversation'
          : p.shortcut === false
            ? 'Start conversation'
            : 'Start conversation · Ctrl+Shift+Space'
      }
    >
      {p.conversationActive ? <Pause size={21} /> : <Mic size={23} />}
    </button>
  );
  const ideas: BuddyDisclosureAction[] = [
    {
      label: 'Understand my finances',
      icon: <Table2 size={18} />,
      onSelect: () => p.suggest('Start the finance demo'),
      disabled: !p.enabled || p.busy,
    },
    {
      label: 'Find jobs near me',
      icon: <Globe size={18} />,
      onSelect: () => p.suggest('Find jobs near me'),
      disabled: !p.enabled || p.busy,
    },
    {
      label: 'Open Calculator',
      icon: <Maximize2 size={18} />,
      onSelect: () => p.suggest('Open Calculator'),
      disabled: !p.enabled || p.busy,
    },
    {
      label: 'Describe my screen',
      icon: <Eye size={18} />,
      onSelect: () => p.suggest('Describe my screen'),
      disabled: !p.enabled || p.busy,
    },
  ];
  const tools: BuddyDisclosureAction[] = [
    {
      label: 'Choose a window to see',
      icon: <Eye size={18} />,
      onSelect: p.screen,
      disabled: p.busy,
    },
    {
      label: 'Change save folder',
      icon: <FolderOpen size={18} />,
      onSelect: p.folder,
      disabled: p.busy,
    },
    {
      label: p.speech ? 'Mute spoken replies' : 'Enable spoken replies',
      icon: p.speech ? <Volume2 size={18} /> : <VolumeX size={18} />,
      onSelect: p.toggleSpeech,
      disabled: !p.speechReady,
      pressed: p.speech,
    },
    {
      label: panel.motionPaused ? 'Resume avatar motion' : 'Pause avatar motion',
      icon: <PauseCircle size={18} />,
      onSelect: panel.toggleMotion,
      pressed: panel.motionPaused,
    },
    {
      label: 'Settings and connections',
      icon: <Settings2 size={18} />,
      onSelect: p.settings,
    },
    {
      label: 'Open full workspace',
      icon: <Maximize2 size={18} />,
      onSelect: openWorkspace,
      restoreFocus: false,
    },
  ];
  const lastMessage = conversation.at(-1);
  const taskMessageRepeated =
    p.state.task &&
    lastMessage?.role !== 'user' &&
    lastMessage?.text.trim() === p.state.task.message.trim();
  return (
    <Root
      className={`buddy ${p.expanded ? 'expanded' : 'collapsed'} ${p.active ? 'active' : ''} ${panel.error ? 'has-layout-error' : ''}`}
      data-panel-stage={panel.stage}
      aria-label="InsightOS desktop buddy"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && p.expanded && !p.modalOpen) {
          event.preventDefault();
          event.stopPropagation();
          p.expand();
        }
      }}
    >
      <h1 className="sr-only">InsightOS desktop assistant</h1>
      <p id="buddy-voice-help" className="sr-only">
        {voiceHelp}
      </p>
      <header className="buddy-bar">
        <button
          ref={pet}
          className={`buddy-face ${p.active ? 'awake' : ''}`}
          onClick={activatePet}
          aria-label={`${p.expanded ? (panel.available ? 'Collapse buddy' : 'Cancel opening buddy') : 'Expand buddy'}. ${status}`}
          aria-expanded={panel.available}
          aria-controls="buddy-conversation-panel"
        >
          <AssistantSignal
            {...p.visual}
            phase={p.visual?.phase ?? buddyVisualState(p.voicePhase, p.busy)}
            audio={p.audio}
            reaction={p.visual?.reaction ?? reaction}
            motion={(p.visual?.motion ?? true) && !panel.motionPaused}
          />
        </button>
        <div className="buddy-dock-controls">
          <div className="buddy-identity">
            <strong>
              insight<span>OS</span>
            </strong>
            <span role="status" title={status}>
              {status}
            </span>
          </div>
          {panel.error && (
            <p
              className="buddy-layout-error"
              role="alert"
              aria-label={panel.error}
              title={panel.error}
            >
              Try opening again.
            </p>
          )}
          <div className="buddy-window-actions">
            {!panel.available && voiceControl}
            {p.active && (
              <button
                className="buddy-icon stop"
                onClick={p.stop}
                aria-label="Stop task and audio"
                title="Stop · Ctrl+Shift+Backspace"
              >
                <Square size={15} />
              </button>
            )}
            <button
              className="buddy-icon"
              onClick={p.hide}
              aria-label="Hide to system tray"
              title="Hide to tray"
            >
              <Minus size={17} />
            </button>
            {panel.available && (
              <button
                ref={close}
                className="buddy-icon"
                onClick={p.expand}
                aria-label="Collapse conversation"
              >
                <ChevronUp size={21} />
              </button>
            )}
          </div>
        </div>
      </header>
      <div ref={panel.shell} className="buddy-panel-glass" aria-hidden="true" />
      <section
        className="buddy-panel"
        id="buddy-conversation-panel"
        aria-labelledby="buddy-panel-title"
        aria-hidden={!panel.available}
        inert={!panel.available}
        data-available={panel.available}
      >
        <h2 id="buddy-panel-title" className="sr-only">
          Conversation
        </h2>
        <div className="buddy-body">
          <div
            className="buddy-feed"
            role="region"
            aria-label="Conversation and task updates"
            ref={p.transcriptRef}
            onScroll={panel.onScroll}
            tabIndex={0}
          >
            <div
              className="buddy-conversation"
              role="log"
              aria-live="polite"
              aria-label="Buddy conversation"
            >
              {!conversation.length && p.state.task && (
                <div className="buddy-welcome">
                  <p>{p.state.task.goal}</p>
                </div>
              )}
              {conversation.map((m) => (
                <div key={m.id} className={`buddy-message ${m.role}`}>
                  <span>
                    {m.role === 'user' ? 'You' : m.role === 'error' ? 'Error' : 'Insight'}
                  </span>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>
            {p.resultView === 'energy' && p.state.bills && !p.state.energy && (
              <section className="energy-panel compact" aria-label="Bill document review">
                <div className="energy-heading">
                  <strong>Your bills, understood.</strong>
                  <span>{p.state.bills.documents.length} DOCUMENTS</span>
                </div>
                <p>
                  {p.state.bills.pendingReadIds.length
                    ? 'I found your bills. Say “yes” to read them.'
                    : p.state.bills.documents.length
                      ? 'Say “confirm this bill” or correct a number. The full workspace shows source quotes and editable fields.'
                      : 'Find saved bills or choose PDFs in the workspace.'}
                </p>
                <div className="energy-actions">
                  <button disabled={p.busy || !p.enabled} onClick={openWorkspace}>
                    Open bill workspace
                  </button>
                </div>
              </section>
            )}
            {p.resultView === 'energy' && p.state.energy && (
              <EnergyPanel
                state={p.state.energy}
                compact
                disabled={p.busy || !p.enabled}
                ask={p.suggest}
              />
            )}
            {p.resultView === 'finance' && p.state.finance && (
              <FinancePanel
                state={p.state.finance}
                compact
                disabled={p.busy || !p.enabled}
                ask={p.suggest}
                workspace={openWorkspace}
              />
            )}
            {p.state.task && (
              <div className="buddy-task" aria-label="Current task">
                <strong>
                  {p.state.task.status === 'running'
                    ? 'Working on it'
                    : p.state.task.status === 'completed'
                      ? 'Task finished'
                      : 'Your next step'}
                </strong>
                {!taskMessageRepeated && <p>{p.state.task.message}</p>}
                <small>{p.state.task.steps.length} steps taken</small>
              </div>
            )}
            {p.resultView === 'office' && p.state.presentation && (
              <div className="buddy-result">
                <div>
                  <Presentation size={15} />
                  <span>{p.state.presentation.filename}</span>
                  <small>{p.state.presentation.slideCount} editable slides</small>
                </div>
                <div className="buddy-result-actions">
                  <button disabled={p.busy || !p.enabled} onClick={p.openPresentation}>
                    Open PowerPoint ↗
                  </button>
                </div>
              </div>
            )}
            {p.resultView === 'office' && p.state.spreadsheet && (
              <div className="buddy-result">
                <div>
                  <Table2 size={15} />
                  <span>{p.state.spreadsheet.filename}</span>
                  <small>
                    {p.state.spreadsheet.provider === 'databricks'
                      ? 'Databricks SQL'
                      : 'Local analysis'}
                  </small>
                </div>
                <div className="buddy-result-actions">
                  <button disabled={p.busy || !p.enabled} onClick={p.openSpreadsheet}>
                    Open Excel ↗
                  </button>
                </div>
                {p.state.spreadsheet.provider === 'databricks' &&
                  p.state.spreadsheet.queryReference && (
                    <details className="buddy-reference">
                      <summary>Query reference</summary>
                      <code>{p.state.spreadsheet.queryReference}</code>
                    </details>
                  )}
              </div>
            )}
            {p.resultView === 'code' && p.state.code && (
              <div className="buddy-result">
                <div>
                  <Code2 size={15} />
                  <span>{p.state.code.filename}</span>
                  <small>
                    {p.state.code.status === 'completed' ? 'Ran successfully' : 'File ready'}
                  </small>
                </div>
                <div className="buddy-result-actions">
                  <button disabled={p.busy || !p.enabled} onClick={p.run}>
                    Run program
                  </button>
                  <button disabled={p.busy || !p.enabled} onClick={p.editor}>
                    Open in VS Code ↗
                  </button>
                </div>
              </div>
            )}
          </div>
          <form
            ref={composer}
            className={`buddy-composer ${p.voicePhase === 'listening' ? 'listening' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              p.send();
            }}
          >
            <label className="sr-only" htmlFor="buddy-request">
              Tell your buddy what to do
            </label>
            <textarea
              ref={p.inputRef}
              id="buddy-request"
              value={p.request}
              disabled={!p.enabled || p.busy}
              onChange={(e) => p.setRequest(e.target.value)}
              placeholder="Ask me anything…"
              maxLength={2000}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  p.send();
                }
              }}
            />
            <div className="buddy-compose-actions">
              <BuddyDisclosure
                label="Ideas"
                open={panel.available && disclosure === 'ideas'}
                actions={ideas}
                toggle={() => setDisclosure(disclosure === 'ideas' ? null : 'ideas')}
                dismiss={dismissDisclosure}
              />
              <BuddyDisclosure
                label="Tools"
                open={panel.available && disclosure === 'tools'}
                actions={tools}
                toggle={() => setDisclosure(disclosure === 'tools' ? null : 'tools')}
                dismiss={dismissDisclosure}
              />
              <div className="buddy-compose-primary">
                {voiceControl}
                <button
                  className="buddy-send"
                  type="submit"
                  disabled={!p.enabled || p.busy || !p.request.trim()}
                  aria-label="Send request"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </Root>
  );
}
