import type { RefObject } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  FolderOpen,
  Maximize2,
  Mic,
  Minus,
  Settings2,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ComputerState } from '../shared/computer';
import './buddy.css';

type Props = {
  expanded: boolean;
  active: boolean;
  busy: boolean;
  enabled: boolean;
  voicePhase: string;
  voiceReady: boolean;
  speech: boolean;
  speechReady: boolean;
  shortcut: boolean | null;
  state: ComputerState;
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
  send: () => void;
  run: () => void;
  editor: () => void;
};
export default function DesktopBuddy(p: Props) {
  const pending = ['starting', 'transcribing'].includes(p.voicePhase);
  const status = p.busy
    ? 'Working on your request'
    : p.voicePhase === 'listening'
      ? 'I’m listening…'
      : p.voicePhase === 'starting'
        ? 'Opening microphone…'
        : p.voicePhase === 'transcribing'
          ? 'Getting your words…'
          : p.voicePhase === 'speaking'
            ? 'Speaking'
            : 'Here when you need me';
  const conversation = p.messages.filter((m) => m.id !== 'welcome');
  return (
    <section
      className={`buddy ${p.expanded ? 'expanded' : 'collapsed'} ${p.active ? 'active' : ''}`}
      aria-label="InsightOS desktop buddy"
    >
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
        {p.active ? (
          <button
            className="buddy-icon stop"
            onClick={p.stop}
            aria-label="Stop task and audio"
            title="Stop · Ctrl+Shift+Backspace"
          >
            <Square size={15} />
          </button>
        ) : (
          <button
            className="buddy-icon talk"
            onClick={p.talk}
            disabled={!p.enabled || !p.voiceReady}
            aria-label="Start voice recording"
          >
            <Mic size={18} />
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
            {!conversation.length && (
              <div className="buddy-welcome">
                <span className="buddy-eyebrow">A LITTLE HELP. RIGHT HERE.</span>
                <h1>What’s on your mind?</h1>
                <p>
                  Ask me to write and run code in VS Code, search the web and read results, or
                  describe your screen aloud.
                </p>
                <div className="buddy-suggestion">
                  <Code2 size={15} />
                  <span>“Write a Python program, run it, and open it in VS Code.”</span>
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
          {p.state.code && (
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
                  ? 'Listening. Press the mic again to send…'
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
                {p.shortcut === false
                  ? 'Use the microphone to talk'
                  : 'Ctrl + Shift + Space to talk'}
              </span>
              <button
                type="button"
                className="buddy-icon"
                disabled={!p.enabled || p.busy || pending || !p.voiceReady}
                onClick={p.talk}
                aria-label={
                  p.voicePhase === 'listening' ? 'Finish recording' : 'Record a voice request'
                }
                aria-keyshortcuts="Control+Shift+Space"
              >
                <Mic size={18} />
              </button>
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
                aria-label="Choose code folder"
                title="Choose folder"
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
    </section>
  );
}
