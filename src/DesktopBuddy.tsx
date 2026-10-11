import type { RefObject } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  FolderOpen,
  Globe,
  Maximize2,
  Minus,
  Pause,
  Play,
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
import StudioPanel from './StudioPanel';

type Props = {
  expanded: boolean;
  active: boolean;
  conversationActive: boolean;
  busy: boolean;
  enabled: boolean;
  voicePhase: string;
  backupVoice?: boolean;
  voiceReady: boolean;
  speech: boolean;
  speechReady: boolean;
  shortcut: boolean | null;
  state: ComputerState;
  resultView: 'home' | 'code' | 'office' | 'browser' | 'screen' | 'energy' | 'finance' | 'studio';
  request: string;
  messages: { id: string; role: 'user' | 'assistant' | 'error'; text: string }[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  transcriptRef: RefObject<HTMLDivElement | null>;
  expand: () => void;
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
  const presentationProject = p.state.presentation?.project;
  const graphIndex = presentationProject?.orderedDeck?.slides.findIndex((slide) => slide.type === 'flowchart') ?? -1;
  const diagramIndex = presentationProject?.orderedDeck
    ? graphIndex >= 0 ? graphIndex : presentationProject.orderedDeck.slides.findIndex((slide) => slide.type === 'process')
    : presentationProject
      ? presentationProject.deck.slides.length + 1
      : -1;
  const sourceCount = presentationProject?.assets.length ?? 0;
  const voiceStatus =
    p.voicePhase === 'starting'
      ? 'Opening mic…'
      : p.conversationActive
        ? p.voicePhase === 'speaking'
          ? 'Speaking · listening'
          : p.busy || p.voicePhase === 'processing'
            ? 'Working · listening'
            : p.voicePhase === 'transcribing'
              ? 'Understanding · listening'
              : 'Listening…'
        : p.busy
          ? 'Working…'
          : 'Ready to talk';
  const status = `${voiceStatus}${p.backupVoice ? ' · Windows voice' : ''}`;
  const conversation = p.messages.filter((m) => m.id !== 'welcome');
  return (
    <main
      className={`buddy ${p.expanded ? 'expanded' : 'collapsed'} ${p.active ? 'active' : ''}`}
      aria-label="InsightOS desktop buddy"
    >
      <h1 className="sr-only">InsightOS desktop assistant</h1>
      <header className="buddy-bar">
        <button
          className={`buddy-face ${p.active ? 'awake' : ''}`}
          onClick={p.expand}
          aria-label={p.expanded ? 'Collapse buddy' : 'Expand buddy'}
        >
          <span />
          <span />
        </button>
        <div className="buddy-identity">
          <strong>
            insight<span>OS</span>
          </strong>
          <span role="status">{status}</span>
        </div>
        <button
          className={`buddy-play ${p.conversationActive ? 'playing' : ''} ${p.voicePhase === 'listening' ? 'listening' : ''}`}
          onClick={p.talk}
          disabled={!p.conversationActive && (!p.enabled || !p.voiceReady || p.busy)}
          aria-label={
            p.conversationActive ? 'Pause voice conversation' : 'Start voice conversation'
          }
          aria-pressed={p.conversationActive}
          aria-keyshortcuts="Control+Shift+Space"
          title={
            p.conversationActive ? 'Pause conversation' : 'Start conversation · Ctrl+Shift+Space'
          }
        >
          {p.conversationActive ? (
            <Pause size={22} fill="currentColor" />
          ) : (
            <Play size={23} fill="currentColor" />
          )}
        </button>
        <div className="buddy-window-actions">
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
            onClick={p.expand}
            aria-label={p.expanded ? 'Collapse conversation' : 'Expand conversation'}
          >
            {p.expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          <button
            className="buddy-icon"
            onClick={p.hide}
            aria-label="Hide to system tray"
            title="Hide to tray"
          >
            <Minus size={17} />
          </button>
        </div>
      </header>
      {p.expanded && (
        <div className="buddy-body">
          <div
            className="buddy-conversation"
            role="log"
            aria-live="polite"
            aria-label="Buddy conversation"
            ref={p.transcriptRef}
            tabIndex={0}
          >
            {!conversation.length && p.state.task && (
              <div className="buddy-welcome">
                <span className="buddy-eyebrow">YOUR CURRENT TASK</span>
                <p>{p.state.task.goal}</p>
              </div>
            )}
            {!conversation.length && !p.state.task && (
              <div className="buddy-welcome">
                <span className="buddy-eyebrow">A LITTLE HELP. RIGHT HERE.</span>
                <h2>What’s on your mind?</h2>
                <p>
                  Press Play and talk naturally. I’ll keep listening, even while I reply. Ask me to
                  explore a spreadsheet, check its evidence, or create Excel and PowerPoint files.
                </p>
                <div className="buddy-suggestions" aria-label="Ideas to try">
                  <button
                    disabled={!p.enabled || p.busy}
                    onClick={() => p.suggest('Start the analysis demo')}
                  >
                    Try an analysis
                  </button>
                  <button
                    disabled={!p.enabled || p.busy}
                    onClick={() => p.suggest('Find jobs near me')}
                  >
                    <Globe size={15} /> Find jobs near me
                  </button>
                  <button
                    disabled={!p.enabled || p.busy}
                    onClick={() => p.suggest('Open Calculator')}
                  >
                    <Maximize2 size={15} /> Open Calculator
                  </button>
                  <button
                    disabled={!p.enabled || p.busy}
                    onClick={() => p.suggest('Describe my screen')}
                  >
                    <Eye size={15} /> Describe my screen
                  </button>
                </div>
              </div>
            )}
            {conversation.map((m) => (
              <div key={m.id} className={`buddy-message ${m.role}`}>
                <span>
                  {m.role === 'user' ? 'YOU' : m.role === 'error' ? 'LET’S FIX THAT' : 'INSIGHT'}
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
                <button disabled={p.busy || !p.enabled} onClick={p.workspace}>
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
              workspace={p.workspace}
            />
          )}
          {p.resultView === 'studio' && p.state.studio && (
            <StudioPanel
              state={p.state.studio}
              compact
              disabled={p.busy || !p.enabled}
              ask={p.suggest}
              workspace={p.workspace}
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
              <p>{p.state.task.message}</p>
              <small>{p.state.task.steps.length} steps taken</small>
            </div>
          )}
          {p.resultView === 'office' && p.state.presentation && (
            <div className="buddy-result">
              <div>
                <Presentation size={15} />
                <span>{p.state.presentation.title}</span>
                <small>
                  {presentationProject?.orderedDeck?.slides.length ??
                    p.state.presentation.slideCount}{' '}
                  editable slides
                  {p.state.presentation.project
                    ? ` · revision ${p.state.presentation.project.revision} · ${sourceCount} source ${sourceCount === 1 ? 'image' : 'images'}`
                    : ''}
                </small>
              </div>
              <div className="buddy-result-actions">
                {diagramIndex >= 0 && (
                  <button
                    disabled={p.busy || !p.enabled}
                    onClick={() => p.suggest(`Read slide ${diagramIndex + 1}`)}
                  >
                    Read the diagram
                  </button>
                )}
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
          <form
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
              placeholder={
                p.voicePhase === 'listening'
                  ? 'Listening. I’ll respond when you finish speaking…'
                  : 'Ask me anything I can help with…'
              }
              maxLength={2000}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  p.send();
                }
              }}
            />
            <div>
              <span>
                {p.voicePhase === 'starting'
                  ? 'Opening your microphone…'
                  : p.conversationActive
                    ? 'Conversation on · Speak anytime, even during my reply'
                    : p.shortcut === false
                      ? 'Press play to talk'
                      : 'Press play or Ctrl + Shift + Space'}
              </span>
              <button
                className="buddy-send"
                type="submit"
                disabled={!p.enabled || p.busy || !p.request.trim()}
                aria-label="Send request"
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </form>
          <footer className="buddy-tools">
            <div>
              <button
                className="buddy-icon"
                disabled={p.busy}
                onClick={p.screen}
                aria-label="Choose a window to see"
                title="See a window"
              >
                <Eye size={17} />
              </button>
              <button
                className="buddy-icon"
                disabled={p.busy}
                onClick={p.folder}
                aria-label="Change save folder"
                title="Change save folder"
              >
                <FolderOpen size={17} />
              </button>
              <button
                className="buddy-icon"
                disabled={!p.speechReady}
                onClick={p.toggleSpeech}
                aria-label={p.speech ? 'Mute spoken replies' : 'Enable spoken replies'}
              >
                {p.speech ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
            </div>
            <div>
              <button
                className="buddy-icon"
                onClick={p.settings}
                aria-label="Settings and connections"
              >
                <Settings2 size={17} />
              </button>
              <button
                className="buddy-icon"
                onClick={p.workspace}
                aria-label="Open full workspace"
                title="Open workspace"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </footer>
        </div>
      )}
    </main>
  );
}
