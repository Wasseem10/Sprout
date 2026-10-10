import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  AudioLines,
  Check,
  Code2,
  Eye,
  FolderOpen,
  Globe,
  LoaderCircle,
  Mic,
  Presentation,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { ComputerAction, ComputerResult, ComputerState } from '../shared/computer';
import { api, backend, type Status } from './api';
import { useVoice } from './voice';
import { spokenComputerReply } from './speechText';
import './computer.css';
import ConnectionsPanel from './ConnectionsPanel';
import DesktopBuddy from './DesktopBuddy';

const empty: ComputerState = { folder: null, code: null, browser: null, screen: null };
type Message = { id: string; role: 'user' | 'assistant' | 'error'; text: string };
type Source = { id: string; name: string; thumbnail: string };

export default function ComputerCompanion() {
  const desktopBuddy = new URLSearchParams(window.location.search).get('desktop') === 'buddy';
  const [dockMode, setDockMode] = useState(desktopBuddy);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [globalVoice, setGlobalVoice] = useState<boolean | null>(null);
  const desktopCommand = useRef<(command: string) => void>(() => {});
  const [state, setState] = useState<ComputerState>(empty),
    [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Tell me what you want to do. I can write code, create PowerPoint slides, analyze an Excel workbook, browse the web, fill a form with your confirmation, or describe your screen.',
    },
  ]);
  const [request, setRequest] = useState(''),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState('Ready when you are');
  const [tab, setTab] = useState<'code' | 'office' | 'browser' | 'screen'>('code'),
    [modal, setModal] = useState<'settings' | 'screens' | null>(null);
  const [sources, setSources] = useState<Source[]>([]),
    [speech, setSpeech] = useState(() =>
      desktopBuddy
        ? localStorage.getItem('insightos.buddySpeech') !== 'false'
        : localStorage.getItem('insightos.speech') === 'true',
    );
  const [largeText, setLargeText] = useState(
    () => localStorage.getItem('insightos.largeText') === 'true',
  );
  const [locked, setLocked] = useState(false),
    [passphrase, setPassphrase] = useState('');
  const [fieldValue, setFieldValue] = useState(''),
    [announcement, setAnnouncement] = useState('');
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    inFlight = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null),
    transcript = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    upload = useRef<HTMLInputElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  const runRef = useRef<(text: string) => Promise<void>>(async () => {});
  const add = (role: Message['role'], text: string) => {
    setMessages((old) => [...old, { id: crypto.randomUUID(), role, text }]);
    setAnnouncement(text);
  };
  const voice = useVoice(
    (text) => void runRef.current(text),
    (text) => add('error', text),
  );
  const enabled = !!status && !locked && !!status.computer?.local;
  const sync = async () => setState(await api<ComputerState>('/computer/state'));
  const applyState = (next: ComputerState, tool?: string) => {
    setState(next);
    if (/navigate|search|SearchResult|click|fill|readPage|goBack/.test(tool ?? ''))
      setTab('browser');
    else if (/describeScreen/.test(tool ?? '')) setTab('screen');
    else if (/Presentation|Spreadsheet/.test(tool ?? '')) setTab('office');
    else if (/Code|Editor/.test(tool ?? '')) setTab('code');
  };
  const perform = async (text: string, action?: ComputerAction, fromVoice = false) => {
    if (!enabled || inFlight.current || !text.trim()) return;
    if (!fromVoice) voice.stop();
    if (dockMode) setDockExpanded(true);
    inFlight.current = true;
    setBusy(true);
    setRequest('');
    const current = ++generation.current,
      abort = new AbortController();
    controller.current = abort;
    add('user', text);
    setPhase(action ? text : 'Understanding your request');
    const before = state;
    try {
      const spokenScreenRequest =
        !action &&
        !!window.insightos?.captureCurrentScreen &&
        /\b(describe|read|what|tell me)\b.*\b(screen|display)\b/i.test(text);
      let result: ComputerResult;
      if (spokenScreenRequest) {
        setPhase('Capturing one snapshot of the main display');
        const image = await window.insightos!.captureCurrentScreen();
        if (abort.signal.aborted) return;
        await api<ComputerState>('/computer/screen', image, abort.signal);
        setPhase('Describing the snapshot');
        result = await api<ComputerResult>(
          '/computer/action',
          { tool: 'describeScreen' },
          abort.signal,
        );
      } else
        result = await api<ComputerResult>(
          action ? '/computer/action' : '/computer/request',
          action ?? { request: text },
          abort.signal,
        );
      if (current !== generation.current) return;
      let tool = spokenScreenRequest ? 'describeScreen' : action?.tool;
      if (!tool) {
        if (result.state.browser?.capturedAt !== before.browser?.capturedAt) tool = 'readPage';
        if (result.state.presentation?.filename !== before.presentation?.filename)
          tool = 'createPresentation';
        if (result.state.spreadsheet?.summary !== before.spreadsheet?.summary)
          tool = 'analyzeSpreadsheet';
        if (
          result.state.code?.filename !== before.code?.filename ||
          result.state.code?.status !== before.code?.status
        )
          tool = 'runCode';
        if (result.state.screen?.description !== before.screen?.description)
          tool = 'describeScreen';
      }
      applyState(result.state, tool);
      if (tool === 'fill' || tool === 'confirmFill') setFieldValue('');
      add('assistant', result.summary);
      setPhase(result.clarification ? 'Choose your next step' : 'Result received');
      if (fromVoice && !voice.isConversationActive()) return;
      if (speech && status?.integrations.elevenLabs.ttsConfigured)
        void voice.speak(spokenComputerReply(result, tool));
      else if (fromVoice) voice.resumeConversation();
    } catch (error) {
      if (current !== generation.current || abort.signal.aborted) return;
      add('error', error instanceof Error ? error.message : 'Task could not complete.');
      setPhase('Needs attention');
      await sync().catch(() => {});
      if (fromVoice) voice.resumeConversation();
    } finally {
      if (current === generation.current) {
        inFlight.current = false;
        setBusy(false);
        controller.current = null;
        input.current?.focus();
      }
    }
  };
  runRef.current = (text) => perform(text, undefined, true);
  const stop = async () => {
    ++generation.current;
    controller.current?.abort();
    controller.current = null;
    voice.stop();
    inFlight.current = true;
    setBusy(true);
    setPhase('Stopping');
    try {
      applyState(await api<ComputerState>('/computer/stop', {}));
      add(
        'assistant',
        'Stopped. Completed file writes remain on disk. The controlled browser was closed.',
      );
      setPhase('Stopped');
    } catch (error) {
      add('error', error instanceof Error ? error.message : 'Could not confirm Stop.');
      setPhase('Needs attention');
    } finally {
      inFlight.current = false;
      setBusy(false);
      input.current?.focus();
    }
  };
  const setup = async (kind: 'folder' | 'demo' | 'screen') => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (kind === 'screen') {
        if (window.insightos) {
          setSources(await window.insightos.screenSources());
          setModal('screens');
        } else upload.current?.click();
      } else {
        const next =
          kind === 'folder' && window.insightos
            ? await window.insightos.chooseFolder()
            : await api<ComputerState>('/computer/demo-folder', {});
        if (next) {
          applyState(next);
          add('assistant', `Selected ${next.folder!.name}. New files will be saved here.`);
        }
      }
    } catch (error) {
      add('error', error instanceof Error ? error.message : 'Selection failed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const capture = async (source: Source) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const image = await window.insightos!.captureScreen(source.id);
      applyState(await api<ComputerState>('/computer/screen', image));
      setTab('screen');
      setModal(null);
      add(
        'assistant',
        `Captured ${image.name}. This snapshot stays local until you request an AI description.`,
      );
    } catch (error) {
      add('error', error instanceof Error ? error.message : 'Capture failed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await backend.session(passphrase);
      setStatus(await backend.status());
      setLocked(false);
      await sync();
    } catch (error) {
      add('error', error instanceof Error ? error.message : 'Unlock failed.');
    }
  };
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await backend.status();
        if (!active) return;
        setStatus(cfg);
        if (cfg.sessionRequired && !cfg.authenticated) {
          setLocked(true);
          return;
        }
        await backend.session();
        let next = await api<ComputerState>('/computer/state');
        if (desktopBuddy && cfg.computer?.local && !next.folder)
          next = await api<ComputerState>('/computer/demo-folder', {});
        if (active) setState(next);
      } catch (error) {
        if (active)
          add('error', error instanceof Error ? error.message : 'Start the backend first.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' });
  }, [messages]);
  useEffect(() => {
    if (tab === 'code' && state.code && ['completed', 'failed'].includes(state.code.status))
      document.querySelector('.computer-terminal')?.scrollIntoView({ block: 'nearest' });
  }, [state.code?.status, tab]);
  useEffect(() => {
    localStorage.setItem(
      desktopBuddy ? 'insightos.buddySpeech' : 'insightos.speech',
      String(speech),
    );
  }, [speech, desktopBuddy]);
  useEffect(() => {
    localStorage.setItem('insightos.largeText', String(largeText));
  }, [largeText]);
  useEffect(() => {
    if (modal) {
      lastFocus.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      lastFocus.current?.focus();
    }
  }, [modal]);
  const active = busy || voice.conversationActive || voice.phase !== 'idle';
  const voicePending = voice.phase === 'starting' || voice.phase === 'transcribing';
  const toggleRecording = () => {
    if (voice.isConversationActive()) {
      voice.pauseConversation();
      return;
    }
    if (!enabled || inFlight.current || voicePending || !status?.integrations.elevenLabs.configured)
      return;
    if (dockMode) setDockExpanded(true);
    voice.startConversation();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (modal || event.repeat) return;
      if (event.ctrlKey && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        if (!globalVoice) toggleRecording();
      } else if (event.key === 'Escape' && active) {
        event.preventDefault();
        void stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    modal,
    enabled,
    busy,
    voice.phase,
    voice.conversationActive,
    globalVoice,
    status?.integrations.elevenLabs.configured,
  ]);
  const hideBuddy = async () => {
    if (active) await stop();
    setDockExpanded(false);
    await window.insightos?.hideBuddy?.();
  };
  desktopCommand.current = (command) => {
    if (command === 'hide') {
      void hideBuddy();
      return;
    }
    if (command === 'stop') {
      void stop();
      return;
    }
    if (command === 'workspace') {
      setDockMode(false);
      return;
    }
    setDockMode(true);
    setDockExpanded(true);
    if (command === 'settings') setModal('settings');
    if (command === 'voice' && !modal) toggleRecording();
  };
  useEffect(() => {
    if (!desktopBuddy) return;
    document.documentElement.classList.add('desktop-buddy');
    window.insightos
      ?.desktopShortcuts?.()
      .then((s) => setGlobalVoice(s.voice))
      .catch(() => setGlobalVoice(false));
    const unsubscribe = window.insightos?.onDesktopCommand?.((command) =>
      desktopCommand.current(command),
    );
    return () => {
      unsubscribe?.();
      document.documentElement.classList.remove('desktop-buddy');
    };
  }, [desktopBuddy]);
  useEffect(() => {
    if (!desktopBuddy) return;
    void window.insightos
      ?.setBuddyMode?.(!dockMode ? 'workspace' : dockExpanded || modal ? 'panel' : 'pill')
      .catch(() => {});
  }, [desktopBuddy, dockMode, dockExpanded, modal]);
  const toggleSpeech = () => {
    if (speech && voice.phase === 'speaking') voice.skipSpeech();
    setSpeech(!speech);
  };
  return (
    <div className={`${dockMode ? 'buddy-shell' : 'companion'} ${largeText ? 'large-text' : ''}`}>
      {dockMode ? (
        <DesktopBuddy
          expanded={dockExpanded}
          active={active}
          busy={busy}
          enabled={enabled}
          voicePhase={voice.phase}
          conversationActive={voice.conversationActive}
          voiceReady={!!status?.integrations.elevenLabs.configured}
          speech={speech}
          speechReady={!!status?.integrations.elevenLabs.ttsConfigured}
          shortcut={globalVoice}
          state={state}
          request={request}
          messages={messages}
          inputRef={input}
          transcriptRef={transcript}
          expand={() => setDockExpanded(!dockExpanded)}
          hide={() => void hideBuddy()}
          talk={toggleRecording}
          stop={() => void stop()}
          toggleSpeech={toggleSpeech}
          settings={() => {
            setDockExpanded(true);
            setModal('settings');
          }}
          workspace={() => setDockMode(false)}
          folder={() => void setup(window.insightos ? 'folder' : 'demo')}
          screen={() => void setup('screen')}
          setRequest={setRequest}
          send={() => void perform(request)}
          run={() => void perform('Run my program', { tool: 'runCode' })}
          editor={() => void perform('Open in VS Code', { tool: 'openEditor' })}
          openPresentation={() =>
            void perform('Open the presentation', { tool: 'openPresentation' })
          }
        />
      ) : (
        <>
          {desktopBuddy && (
            <div className="desktop-workspace-bar">
              <span>InsightOS workspace</span>
              <button
                onClick={() => {
                  setDockMode(true);
                  setDockExpanded(false);
                }}
              >
                Return to desktop buddy ↗
              </button>
            </div>
          )}
          <a className="skip-link" href="#computer-request">
            Skip to request input
          </a>
          <header className="companion-header">
            <a className="brand" href="/" aria-label="InsightOS home">
              <span className="brand-symbol">
                <Sparkles size={23} aria-hidden="true" />
              </span>
              <span>
                insight<span className="brand-os">OS</span>
              </span>
            </a>
            <span className="companion-tag">YOUR COMPUTER, WITHIN REACH</span>
            <div className="companion-header-actions">
              <a href="/?workspace=data">Data workspace</a>
              <button
                className="icon-button"
                aria-label="Settings and connections"
                onClick={() => setModal('settings')}
              >
                <Settings2 size={20} aria-hidden="true" />
              </button>
            </div>
          </header>
          {locked && (
            <form className="unlock-banner" onSubmit={unlock}>
              <label htmlFor="computer-passphrase">Unlock private workspace</label>
              <input
                id="computer-passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                required
              />
              <button type="submit">Unlock</button>
            </form>
          )}
          {status && !status.computer?.local && (
            <div className="error-banner">
              Computer control runs on your laptop.{' '}
              <a href="/?workspace=data">Open hosted data workspace</a>
            </div>
          )}
          <div className="companion-layout">
            <main id="computer-main" className="computer-work">
              <div className="computer-heading">
                <div>
                  <div className="eyebrow">
                    <span /> LESS FRICTION. MORE FREEDOM.
                  </div>
                  <h1>Just say the next step.</h1>
                  <p>Create something. Explore the web. See what’s in front of you.</p>
                </div>
                <div className={`companion-orb ${active ? 'is-active' : ''}`} aria-hidden="true">
                  <AudioLines size={37} />
                </div>
              </div>
              <nav className="computer-tabs" aria-label="Computer tools">
                {[
                  { id: 'code', title: 'Create & run', icon: Code2 },
                  { id: 'office', title: 'Office tasks', icon: Presentation },
                  { id: 'browser', title: 'Browse the web', icon: Globe },
                  { id: 'screen', title: 'See my screen', icon: Eye },
                ].map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    aria-pressed={tab === id}
                    onClick={() => setTab(id as typeof tab)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {title}
                  </button>
                ))}
              </nav>
              {tab === 'code' && (
                <section className="computer-artifact" aria-label="Python workspace">
                  <div className="computer-artifact-heading">
                    <div>
                      <span className="small-label">ACTUAL FILES. ACTUAL OUTPUT.</span>
                      <h2>{state.code?.filename ?? 'Make your first program.'}</h2>
                      <p>
                        {state.folder
                          ? `Folder: ${state.folder.name}`
                          : 'Choose where to create your files.'}
                      </p>
                    </div>
                    <Code2 size={25} aria-hidden="true" />
                  </div>
                  <div className="computer-toolbar">
                    {window.insightos && (
                      <button
                        className="secondary-button"
                        disabled={!enabled || busy}
                        onClick={() => void setup('folder')}
                      >
                        <FolderOpen size={16} aria-hidden="true" />
                        Choose folder
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      disabled={!enabled || busy}
                      onClick={() => void setup('demo')}
                    >
                      Use demo folder
                    </button>
                    <button
                      className="primary-button"
                      disabled={!enabled || busy || !state.folder}
                      onClick={() =>
                        void perform('Write a Python program that computes 20 Fibonacci numbers', {
                          tool: 'createCode',
                          request: 'Write a Python program that computes 20 Fibonacci numbers',
                        })
                      }
                    >
                      Create Fibonacci program
                    </button>
                  </div>
                  {state.code ? (
                    <>
                      <div className="artifact-meta">
                        <span>
                          {state.code.provider === 'starter-template'
                            ? 'Starter template'
                            : 'Hugging Face generated'}
                        </span>
                        <span>
                          {state.code.status === 'completed' ? (
                            <>
                              <Check size={15} aria-hidden="true" />
                              Executed · exit {state.code.exitCode}
                            </>
                          ) : (
                            state.code.status
                          )}
                        </span>
                      </div>
                      <pre className="computer-code" tabIndex={0} aria-label="Python source">
                        <code>{state.code.code}</code>
                      </pre>
                      <div className="computer-toolbar">
                        <button
                          className="primary-button"
                          disabled={busy || !enabled || !status?.computer.pythonConfigured}
                          onClick={() => void perform('Run my program', { tool: 'runCode' })}
                        >
                          Run with Python
                        </button>
                        <button
                          className="secondary-button"
                          disabled={busy || !enabled || !status?.computer.editorConfigured}
                          onClick={() =>
                            void perform('Open my program in VS Code', { tool: 'openEditor' })
                          }
                        >
                          Open in VS Code
                        </button>
                      </div>
                      <div className="terminal-heading">
                        <span className="small-label">PYTHON OUTPUT</span>
                        <span>
                          {state.code.exitCode === null
                            ? 'Not completed'
                            : `Exit code ${state.code.exitCode}`}
                        </span>
                      </div>
                      <pre className="computer-terminal" tabIndex={0} aria-label="Program output">
                        {state.code.output || 'Run the program to see its actual output here.'}
                      </pre>
                      <details className="computer-details">
                        <summary>File verification</summary>
                        <p>
                          Read back from disk after creation. SHA-256:{' '}
                          <code>{state.code.sha256}</code>
                        </p>
                        <p>
                          Execution supports computation and terminal output, with a 10-second
                          limit. Files, shell and network access are outside this demo runner.
                        </p>
                      </details>
                    </>
                  ) : (
                    <div className="computer-empty">
                      <span className="empty-glyph">
                        <Code2 size={35} aria-hidden="true" />
                      </span>
                      <h3>“Write a Fibonacci program.”</h3>
                      <p>Your request becomes a file you can run and open in VS Code.</p>
                      <div className="computer-step">
                        <span>01</span> Select a folder <span>02</span> Create your program{' '}
                        <span>03</span> Run & inspect
                      </div>
                    </div>
                  )}
                </section>
              )}
              {tab === 'office' && (
                <section className="computer-artifact" aria-label="Office tasks">
                  <div className="computer-artifact-heading">
                    <div>
                      <span className="small-label">EDITABLE FILES. CALCULATED RESULTS.</span>
                      <h2>Work with slides and spreadsheets</h2>
                      <p>
                        {state.folder
                          ? `Folder: ${state.folder.name}`
                          : 'Choose a folder for your files.'}
                      </p>
                    </div>
                    <Presentation size={25} aria-hidden="true" />
                  </div>
                  <p className="computer-caption">
                    Say “Create a four-slide PowerPoint about job interview preparation” or “Analyze
                    the Excel workbook and tell me the top region.” Workbooks must be .xlsx files in
                    the selected folder.
                  </p>
                  <div className="computer-toolbar">
                    {window.insightos && (
                      <button
                        className="secondary-button"
                        disabled={!enabled || busy}
                        onClick={() => void setup('folder')}
                      >
                        <FolderOpen size={16} aria-hidden="true" /> Choose folder
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      disabled={!enabled || busy}
                      onClick={() => void setup('demo')}
                    >
                      Use demo folder
                    </button>
                    <button
                      className="primary-button"
                      disabled={!enabled || busy || !state.folder}
                      onClick={() =>
                        void perform(
                          'Create a four slide PowerPoint about preparing for a job interview',
                        )
                      }
                    >
                      Create sample PowerPoint
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!enabled || busy || !state.folder}
                      onClick={() =>
                        void perform('Analyze the Excel sales workbook and tell me the top region')
                      }
                    >
                      Analyze sample Excel
                    </button>
                  </div>
                  {state.presentation && (
                    <div className="office-result">
                      <h3>{state.presentation.title}</h3>
                      <p>
                        {state.presentation.slideCount} editable slides ·{' '}
                        {state.presentation.filename}
                      </p>
                      <ol>
                        {state.presentation.slideTitles.map((title, index) => (
                          <li key={`${index}-${title}`}>{title}</li>
                        ))}
                      </ol>
                      <button
                        className="secondary-button"
                        disabled={!enabled || busy}
                        onClick={() =>
                          void perform('Open the presentation', { tool: 'openPresentation' })
                        }
                      >
                        Open in PowerPoint
                      </button>
                    </div>
                  )}
                  {state.spreadsheet && (
                    <div className="office-result">
                      <h3>{state.spreadsheet.filename}</h3>
                      <p>{state.spreadsheet.summary}</p>
                      <button
                        className="secondary-button"
                        disabled={!enabled || busy}
                        onClick={() =>
                          void perform('Open the spreadsheet', { tool: 'openSpreadsheet' })
                        }
                      >
                        Open in Excel
                      </button>
                    </div>
                  )}
                </section>
              )}
              {tab === 'browser' && (
                <section className="computer-artifact" aria-label="Controlled browser">
                  <div className="computer-artifact-heading">
                    <div>
                      <span className="small-label">A VISIBLE BROWSER YOU CONTROL</span>
                      <h2>{state.browser?.title || 'Go somewhere useful.'}</h2>
                      <p>Links and buttons come from the actual webpage.</p>
                    </div>
                    <Globe size={25} aria-hidden="true" />
                  </div>
                  <div className="computer-toolbar">
                    <button
                      className="primary-button"
                      disabled={!enabled || busy}
                      onClick={() =>
                        void perform('Open the public practice book catalog', {
                          tool: 'navigate',
                          url: 'https://books.toscrape.com/',
                        })
                      }
                    >
                      Open practice book catalog
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!enabled || busy || !state.browser}
                      onClick={() => void perform('Read this page', { tool: 'readPage' })}
                    >
                      Read current page
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!enabled || busy || !state.browser}
                      onClick={() => void perform('Go back', { tool: 'goBack' })}
                    >
                      Back
                    </button>
                  </div>
                  {state.browser ? (
                    <>
                      <div className="browser-address">
                        <span className="status-dot" />
                        <span>{state.browser.url}</span>
                      </div>
                      <img
                        className="browser-preview"
                        src={state.browser.image}
                        alt={`Actual browser snapshot: ${state.browser.title}`}
                      />
                      <div className="terminal-heading">
                        <span className="small-label">OBSERVED CONTROLS</span>
                        <span>
                          Captured {new Date(state.browser.capturedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="computer-caption">
                        Click a control here, or say its exact name. Personal contact fields require
                        “confirm fill.” Payments, passwords, and final submission stay blocked.
                      </p>
                      <div className="browser-controls">
                        {state.browser.controls.map((c) =>
                          c.role === 'textbox' ? (
                            <div className="browser-field" key={c.id}>
                              <label htmlFor={c.id}>{c.name}</label>
                              <input
                                id={c.id}
                                value={fieldValue}
                                onChange={(e) => setFieldValue(e.target.value)}
                                disabled={busy || c.blocked}
                              />
                              <button
                                disabled={busy || c.blocked || !fieldValue}
                                onClick={() =>
                                  void perform(`Type in ${c.name}`, {
                                    tool: 'fill',
                                    controlId: c.id,
                                    pageId: state.browser!.id,
                                    value: fieldValue,
                                  })
                                }
                              >
                                Type
                              </button>
                            </div>
                          ) : (
                            <button
                              key={c.id}
                              disabled={busy || c.blocked || c.sensitive || c.role === 'select'}
                              onClick={() =>
                                void perform(`Click ${c.name}`, {
                                  tool: 'click',
                                  controlId: c.id,
                                  pageId: state.browser!.id,
                                })
                              }
                            >
                              <span>{c.role}</span>
                              {c.name}
                              {(c.blocked || c.sensitive) && <small>Manual review</small>}
                            </button>
                          ),
                        )}
                      </div>
                      <details className="computer-details">
                        <summary>Page text</summary>
                        <pre tabIndex={0}>{state.browser.text}</pre>
                      </details>
                    </>
                  ) : (
                    <div className="computer-empty">
                      <span className="empty-glyph">
                        <Globe size={35} aria-hidden="true" />
                      </span>
                      <h3>“Find a mechanical keyboard online.”</h3>
                      <p>
                        Navigate, read and interact in a separate Chromium window. The practice
                        catalog is a real public website for testing, with no checkout.
                      </p>
                    </div>
                  )}
                </section>
              )}
              {tab === 'screen' && (
                <section className="computer-artifact" aria-label="Selected screen">
                  <div className="computer-artifact-heading">
                    <div>
                      <span className="small-label">YOUR CHOICE. ONE SNAPSHOT.</span>
                      <h2>{state.screen?.name || 'A second pair of eyes.'}</h2>
                      <p>Choose a window to capture. Request a description when you’re ready.</p>
                    </div>
                    <Eye size={25} aria-hidden="true" />
                  </div>
                  <div className="computer-toolbar">
                    <button
                      className="primary-button"
                      disabled={!enabled || busy}
                      onClick={() => void setup('screen')}
                    >
                      {window.insightos ? 'Choose a window or screen' : 'Select a PNG screenshot'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={
                        !enabled ||
                        busy ||
                        !state.screen ||
                        !status?.integrations.huggingFace.configured
                      }
                      onClick={() =>
                        void perform('Describe my selected screen with Hugging Face', {
                          tool: 'describeScreen',
                        })
                      }
                    >
                      Describe with AI
                    </button>
                    {state.screen && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          void api<ComputerState>('/computer/clear-screen', {})
                            .then(setState)
                            .catch((e) => add('error', e.message))
                        }
                      >
                        Clear snapshot
                      </button>
                    )}
                  </div>
                  <p className="computer-caption">
                    “Describe with AI” sends only this selected snapshot to Hugging Face.{' '}
                    {status?.integrations.huggingFace.configured
                      ? 'A vision-capable model is required.'
                      : 'Add HF_TOKEN in .env to enable descriptions.'}
                  </p>
                  {state.screen ? (
                    <>
                      <img
                        className="screen-preview"
                        src={state.screen.image}
                        alt={`Selected snapshot of ${state.screen.name}`}
                      />
                      <span className="computer-caption">
                        Captured {new Date(state.screen.capturedAt).toLocaleString()}. Select again
                        to refresh.
                      </span>
                      {state.screen.description && (
                        <div className="screen-description">
                          <h3>AI screen description</h3>
                          <p>{state.screen.description}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="computer-empty">
                      <span className="empty-glyph">
                        <Eye size={35} aria-hidden="true" />
                      </span>
                      <h3>“What’s on this screen?”</h3>
                      <p>
                        You choose what it sees. Capture first, preview it, then ask for a
                        description.
                      </p>
                    </div>
                  )}
                </section>
              )}
              <div className="computer-foot">
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  {status?.integrations.huggingFace.configured
                    ? 'Hugging Face selected for AI commands and code'
                    : 'Starter commands available · connect Hugging Face for flexible AI'}{' '}
                  · Stop ends the current task
                </span>
              </div>
            </main>
            <aside className="computer-conversation" aria-label="Computer companion conversation">
              <div className="conversation-heading">
                <div>
                  <span className="small-label">HERE WITH YOU</span>
                  <h2>Your companion</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label={speech ? 'Turn spoken replies off' : 'Turn spoken replies on'}
                  disabled={!status?.integrations.elevenLabs.ttsConfigured}
                  onClick={() => {
                    if (speech && voice.phase === 'speaking') voice.skipSpeech();
                    setSpeech(!speech);
                  }}
                >
                  {speech ? (
                    <Volume2 size={19} aria-hidden="true" />
                  ) : (
                    <VolumeX size={19} aria-hidden="true" />
                  )}
                </button>
              </div>
              <div
                className="computer-transcript"
                ref={transcript}
                role="log"
                aria-live="off"
                tabIndex={0}
                aria-label="Conversation transcript"
              >
                {messages.map((m) => (
                  <div key={m.id} className={`computer-message ${m.role}`}>
                    <span>
                      {m.role === 'user'
                        ? 'YOU'
                        : m.role === 'error'
                          ? 'NEEDS ATTENTION'
                          : 'INSIGHTOS'}
                    </span>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
              <div className="computer-phase">
                {busy ? (
                  <LoaderCircle size={15} className="spin" aria-hidden="true" />
                ) : (
                  <span className="status-dot" />
                )}
                <span role="status" aria-live="polite">
                  {voice.phase === 'idle'
                    ? phase
                    : voice.phase === 'starting'
                      ? 'Opening microphone…'
                      : voice.phase === 'listening'
                        ? 'Listening — I will respond when you finish speaking'
                        : voice.phase === 'transcribing'
                          ? 'Transcribing your request…'
                          : voice.phase === 'processing'
                            ? 'Working on your request…'
                            : 'Reading the answer aloud'}
                </span>
                {active && (
                  <button onClick={() => void stop()} className="computer-stop">
                    <Square size={13} aria-hidden="true" />
                    Stop
                  </button>
                )}
              </div>
              <form
                className="computer-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(request);
                }}
              >
                <label className="sr-only" htmlFor="computer-request">
                  Tell your computer what to do
                </label>
                <textarea
                  ref={input}
                  id="computer-request"
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  maxLength={2000}
                  placeholder="Tell me the next step…"
                  disabled={!enabled || busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void perform(request);
                    }
                  }}
                />
                <div>
                  <span>
                    {status?.integrations.elevenLabs.configured
                      ? 'Type or use your voice'
                      : 'Type a request · voice needs ElevenLabs'}
                  </span>
                  <button
                    type="button"
                    className={`icon-button ${voice.phase === 'listening' ? 'listening' : ''}`}
                    aria-label={
                      voice.conversationActive ? 'Pause conversation' : 'Start conversation'
                    }
                    aria-keyshortcuts="Control+Shift+Space"
                    disabled={
                      !enabled ||
                      (!voice.conversationActive && (busy || voicePending)) ||
                      !status?.integrations.elevenLabs.configured
                    }
                    onClick={toggleRecording}
                  >
                    <Mic size={19} aria-hidden="true" />
                  </button>
                  <button
                    type="submit"
                    className="computer-send"
                    aria-label="Send request"
                    disabled={!enabled || busy || !request.trim()}
                  >
                    <ArrowUp size={20} aria-hidden="true" />
                  </button>
                </div>
              </form>
              <p className="computer-voice-note">
                Ctrl+Shift+Space starts or pauses conversation. Speak naturally; silence sends each
                request. Esc stops the task and audio.
              </p>
            </aside>
          </div>
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>
        </>
      )}
      <input
        ref={upload}
        hidden
        aria-label="Select a PNG screenshot file"
        type="file"
        accept="image/png"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            if (file.size > 3.5 * 1024 * 1024) throw new Error('Choose a PNG under 3.5 MB.');
            const image = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error('Image could not be read.'));
              reader.readAsDataURL(file);
            });
            setState(
              await api<ComputerState>('/computer/screen', {
                name: file.name.slice(0, 200),
                image,
              }),
            );
            setTab('screen');
          } catch (e) {
            add('error', e instanceof Error ? e.message : 'Capture failed.');
          }
        }}
      />
      <dialog
        ref={dialog}
        className="computer-dialog"
        aria-labelledby="computer-dialog-title"
        onCancel={() => setModal(null)}
      >
        <div className="computer-dialog-heading">
          <h2 id="computer-dialog-title">
            {modal === 'screens' ? 'Choose what InsightOS can see' : 'Settings & connections'}
          </h2>
          <button aria-label="Close dialog" className="icon-button" onClick={() => setModal(null)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {modal === 'screens' ? (
          <>
            <p>
              Select one window or display. Capture stays local until you request an AI description.
            </p>
            <div className="screen-sources">
              {sources.map((source) => (
                <button key={source.id} disabled={busy} onClick={() => void capture(source)}>
                  <img src={source.thumbnail} alt="" />
                  <span>{source.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : modal === 'settings' ? (
          <>
            <label className="computer-setting">
              <span>Large text</span>
              <input
                type="checkbox"
                checked={largeText}
                onChange={(e) => setLargeText(e.target.checked)}
              />
            </label>
            <label className="computer-setting">
              <span>Spoken replies</span>
              <input
                type="checkbox"
                checked={speech}
                onChange={(e) => {
                  if (!e.target.checked && voice.phase === 'speaking') voice.skipSpeech();
                  setSpeech(e.target.checked);
                }}
                disabled={!status?.integrations.elevenLabs.ttsConfigured}
              />
            </label>
            <ConnectionsPanel
              disabled={busy || voice.phase !== 'idle'}
              onChanged={async () => setStatus(await backend.status())}
            />
            <div className="connection-grid">
              {[
                [
                  'Python',
                  status?.computer.pythonConfigured,
                  'PYTHON_BIN · actual installed interpreter',
                ],
                [
                  'VS Code',
                  status?.computer.editorConfigured,
                  'VSCODE_BIN · actual editor executable',
                ],
              ].map(([name, configured, detail]) => (
                <div key={String(name)}>
                  <strong>{String(name)}</strong>
                  <span>{configured ? 'Executable path configured' : 'Setup required'}</span>
                  <small>{String(detail)}</small>
                </div>
              ))}
            </div>
            <p>
              The browser uses a separate session. Personal contact fields require confirmation;
              checkout, login and submission remain blocked. The Python runner supports computation;
              it is not an OS sandbox for untrusted code.
            </p>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
