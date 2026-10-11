import { useRef, useState, type ComponentProps } from 'react';
import DesktopBuddy from './DesktopBuddy';
import type AssistantSignal from './AssistantSignal';
import type { BuddyVisualState } from './AssistantSignal';
import type { BuddyReadingMemory } from './useBuddyPanel';
import type { ComputerState } from '../shared/computer';
import './buddy-panel-preview.css';
import { SPROUT_DAYLIGHT_ASSET, SPROUT_ORIGINAL_ASSET, sproutReviewAsset } from './buddyAppearance';

const empty: ComputerState = { folder: null, code: null, browser: null, screen: null };
type Message = { id: string; role: 'user' | 'assistant' | 'error'; text: string };
const sample: Message[] = [
  { id: 'sample-user', role: 'user', text: 'Can we take this one step at a time?' },
  {
    id: 'sample-assistant',
    role: 'assistant',
    text: 'Of course. You can pause, ask me to repeat a detail, or change direction whenever you need.',
  },
];

/** The production panel with local fixture data: no API, capture or voice session owner. */
export default function BuddyPanelPreview({
  embedded = false,
  expanded: expandedProp,
  onToggle,
  phase: phaseProp,
  onPhaseChange,
  visual,
  audio,
}: {
  embedded?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  phase?: BuddyVisualState;
  onPhaseChange?: (phase: BuddyVisualState) => void;
  visual?: Pick<
    ComponentProps<typeof AssistantSignal>,
    | 'phase'
    | 'motion'
    | 'reaction'
    | 'blink'
    | 'gaze'
    | 'onDiagnostics'
    | 'assetUrl'
    | 'behavior'
    | 'onBehaviorChange'
  >;
  audio?: ComponentProps<typeof AssistantSignal>['audio'];
}) {
  const [expandedLocal, setExpandedLocal] = useState(true);
  const [phaseLocal, setPhaseLocal] = useState<BuddyVisualState>('idle');
  const [background, setBackground] = useState('light');
  const [previewAsset, setPreviewAsset] = useState(() => sproutReviewAsset(window.location.search));
  const [large, setLarge] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [request, setRequest] = useState('');
  const [messages, setMessages] = useState<Message[]>(sample);
  const [notice, setNotice] = useState('');
  const [speech, setSpeech] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const memory = useRef<BuddyReadingMemory>({ scrollTop: 0, followLatest: true });
  const sequence = useRef(0);
  const expanded = expandedProp ?? expandedLocal;
  const phase = phaseProp ?? phaseLocal;
  const busy = phase === 'thinking';
  const talking = phase === 'listening' || phase === 'speaking';
  const setPhase = (value: BuddyVisualState) =>
    onPhaseChange ? onPhaseChange(value) : setPhaseLocal(value);
  const explain = (action: string) =>
    setNotice(`${action} is available in the desktop app. This preview uses local sample data.`);
  const toggle = () => (onToggle ? onToggle() : setExpandedLocal((value) => !value));
  const send = () => {
    const text = request.trim();
    if (!text) return;
    const id = ++sequence.current;
    setMessages((current) => [
      ...current,
      { id: `preview-user-${id}`, role: 'user', text },
      {
        id: `preview-reply-${id}`,
        role: 'assistant',
        text: 'Sample reply: your message stays in this local preview. No AI request was made.',
      },
    ]);
    setRequest('');
  };
  return (
    <div className={`buddy-panel-preview${embedded ? ' is-embedded' : ''}`}>
      {!embedded && (
        <header className="panel-preview-heading">
          <a href="?studio=buddy">← Character studio</a>
          <h1>Sprout, within reach.</h1>
          <p>
            The actual conversation panel, with local sample messages. Voice and computer actions
            are simulated.
          </p>
          <div className="panel-preview-controls">
            <fieldset>
              <legend>Background</legend>
              {['light', 'dark', 'busy'].map((value) => (
                <button
                  key={value}
                  onClick={() => setBackground(value)}
                  aria-pressed={background === value}
                >
                  {value}
                </button>
              ))}
            </fieldset>
            <label>
              <input
                type="checkbox"
                checked={large}
                onChange={(event) => setLarge(event.target.checked)}
              />{' '}
              Large text
            </label>
            <label>
              Simulated state{' '}
              <select
                value={phaseLocal}
                onChange={(event) => setPhaseLocal(event.target.value as BuddyVisualState)}
              >
                <option value="idle">Idle</option>
                <option value="listening">Listening</option>
                <option value="thinking">Thinking</option>
                <option value="speaking">Speaking</option>
              </select>
            </label>
            <label>
              Sprout appearance{' '}
              <select
                value={previewAsset}
                onChange={(event) => setPreviewAsset(event.target.value)}
              >
                <option value={SPROUT_DAYLIGHT_ASSET}>Daylight</option>
                <option value={SPROUT_ORIGINAL_ASSET}>Original</option>
                {previewAsset !== SPROUT_DAYLIGHT_ASSET &&
                  previewAsset !== SPROUT_ORIGINAL_ASSET && (
                    <option value={previewAsset}>Legacy reference</option>
                  )}
              </select>
            </label>
          </div>
        </header>
      )}
      <div className={`panel-preview-scene background-${background}${large ? ' large-text' : ''}`}>
        {hidden ? (
          <button className="panel-preview-restore" onClick={() => setHidden(false)}>
            Show companion again
          </button>
        ) : (
          <div className={`buddy-shell${large ? ' large-text' : ''}`}>
            <DesktopBuddy
              embedded={embedded}
              visual={{ ...visual, assetUrl: visual?.assetUrl ?? previewAsset }}
              audio={audio}
              expanded={expanded}
              modalOpen={false}
              active={busy || talking}
              conversationActive={talking}
              busy={busy}
              enabled
              voiceReady
              speech={speech}
              speechReady
              shortcut={false}
              state={empty}
              resultView="home"
              voicePhase={
                phase === 'thinking' ? 'processing' : phase === 'success' ? 'idle' : phase
              }
              request={request}
              messages={messages}
              inputRef={input}
              transcriptRef={transcript}
              readingMemory={memory}
              expand={toggle}
              expansionFailed={() => setExpandedLocal(false)}
              hide={() => (embedded ? onToggle?.() : setHidden(true))}
              talk={() => setPhase(talking ? 'idle' : 'listening')}
              stop={() => {
                setPhase('idle');
                setNotice('Simulated task and audio stopped.');
              }}
              settings={() => explain('Settings')}
              workspace={() => explain('Workspace')}
              folder={() => explain('Folder selection')}
              screen={() => explain('Window selection')}
              toggleSpeech={() => setSpeech((value) => !value)}
              setRequest={setRequest}
              suggest={(text) => {
                setRequest(text);
                input.current?.focus();
              }}
              send={send}
              run={() => explain('Run')}
              editor={() => explain('Editor')}
              openPresentation={() => explain('Presentation')}
              openSpreadsheet={() => explain('Spreadsheet')}
            />
          </div>
        )}
      </div>
      <p className="panel-preview-notice" role="status">
        {notice || 'Local preview · no microphone, AI or computer actions'}
      </p>
    </div>
  );
}
