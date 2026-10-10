import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  FileSpreadsheet,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Mic,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Table2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  emptyWorkspace,
  workspaceSchema,
  type Comparison,
  type Progress,
  type TaskMetadata,
  type Workspace,
} from '../shared/schema';
import { TaskEngine, WorkflowRegistry } from '../shared/engine';
import { describeResult, money, percent, visibleRegions } from '../shared/presentation';
import { backend, type SavedProject, type Status } from './api';
import { DataWorkflow } from './workflows/data';
import { useVoice } from './voice';
import Chart from './Chart';
import ConnectionsPanel from './ConnectionsPanel';
import { inferComparison } from '../shared/periods';

declare global {
  interface Window {
    insightos?: {
      openCsv: () => Promise<{ name: string; text: string } | null>;
      chooseFolder: () => Promise<import('../shared/computer').ComputerState | null>;
      screenSources: () => Promise<{ id: string; name: string; thumbnail: string }[]>;
      captureScreen: (id: string) => Promise<{ name: string; image: string }>;
      openAccount: (
        provider: keyof typeof import('../shared/connections').accountUrls,
      ) => Promise<void>;
      platform: string;
      setBuddyMode?: (mode: 'pill' | 'panel' | 'workspace') => Promise<void>;
      hideBuddy?: () => Promise<void>;
      desktopShortcuts?: () => Promise<{ voice: boolean; stop: boolean }>;
      onDesktopCommand?: (callback: (command: string) => void) => () => void;
    };
  }
}
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  timestamp: string;
  duration?: number;
};
const initialMessage: Message = {
  id: 'welcome',
  role: 'assistant',
  text: 'Your work, within reach. Open a CSV and tell me what you want to understand. You can refine the result, ask how it was calculated, or undo a change.',
  timestamp: new Date().toISOString(),
};
function rememberHistory(history: Workspace[]) {
  const next = history.slice(-20);
  while (next.length && JSON.stringify(next).length > 3 * 1024 * 1024) next.shift();
  return next;
}
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace),
    [history, setHistory] = useState<Workspace[]>([]),
    [comparison, setComparison] = useState<Comparison | null>(null);
  const stateRef = useRef(workspace),
    historyRef = useRef(history);
  stateRef.current = workspace;
  historyRef.current = history;
  const [status, setStatus] = useState<Status | null>(null),
    [messages, setMessages] = useState<Message[]>([initialMessage]),
    [request, setRequest] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState<Progress>({ phase: 'ready', detail: 'Ready when you are' });
  const [modal, setModal] = useState<'settings' | 'projects' | null>(null),
    [projects, setProjects] = useState<SavedProject[]>([]),
    [passphrase, setPassphrase] = useState(''),
    [locked, setLocked] = useState(false),
    [startupError, setStartupError] = useState('');
  const [speechEnabled, setSpeechEnabled] = useState(
      () => localStorage.getItem('insightos.speech') === 'true',
    ),
    [largeText, setLargeText] = useState(
      () => localStorage.getItem('insightos.largeText') === 'true',
    ),
    [reducedMotion, setReducedMotion] = useState(
      () => localStorage.getItem('insightos.reducedMotion') === 'true',
    );
  const [announcement, setAnnouncement] = useState(''),
    [lastDuration, setLastDuration] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    transcriptRef = useRef<HTMLDivElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    startupGeneration = useRef(0);
  const preferencesRef = useRef({ speechEnabled, largeText, reducedMotion });
  preferencesRef.current = { speechEnabled, largeText, reducedMotion };
  const lastTaskRef = useRef<TaskMetadata>({
    phase: 'ready',
    detail: 'Ready when you are',
    updatedAt: new Date().toISOString(),
  });
  const engineRef = useRef<TaskEngine | null>(null);
  if (!engineRef.current) {
    const module = new DataWorkflow(
      () => historyRef.current,
      () => ({ preferences: preferencesRef.current, lastTask: lastTaskRef.current }),
    );
    const registry = new WorkflowRegistry();
    registry.register(module);
    engineRef.current = new TaskEngine(registry);
  }
  const addMessage = useCallback((role: Message['role'], text: string, duration?: number) => {
    setMessages((old) => [
      ...old,
      { id: crypto.randomUUID(), role, text, timestamp: new Date().toISOString(), duration },
    ]);
    setAnnouncement(text);
  }, []);
  const runRef = useRef<(text: string) => Promise<void>>(async () => {});
  const loadingController = useRef<AbortController | null>(null);
  const voice = useVoice(
    (text) => void runRef.current(text),
    (text) => addMessage('error', text),
  );
  const stop = useCallback(() => {
    engineRef.current!.stop();
    loadingController.current?.abort();
    loadingController.current = null;
    setLoading(false);
    voice.stop();
    setBusy(false);
    setProgress({ phase: 'cancelled', detail: 'Stopped. Your workspace is unchanged.' });
    lastTaskRef.current = {
      phase: 'cancelled',
      detail: 'Stopped by user',
      updatedAt: new Date().toISOString(),
    };
    setAnnouncement('Stopped.');
  }, [voice.stop]);
  const execute = async (text: string) => {
    if (!text.trim() || engineRef.current!.busy || loading || locked) return;
    voice.stop();
    setBusy(true);
    setRequest('');
    addMessage('user', text);
    const started = performance.now();
    const before = structuredClone(stateRef.current);
    try {
      const response = await engineRef.current!.run(
        text,
        before,
        async (req, state, signal) => (await backend.plan(req, state, signal)).plan,
        setProgress,
        (next, results) => {
          const restored = results.find((r) => r.historyOperation === 'restore'),
            undone = results.find((r) => r.historyOperation === 'undo');
          if (restored) {
            setHistory(rememberHistory(restored.history ?? []));
            if (restored.preferences) {
              setSpeechEnabled(restored.preferences.speechEnabled);
              setLargeText(restored.preferences.largeText);
              setReducedMotion(restored.preferences.reducedMotion);
            }
          } else if (undone) setHistory((old) => old.slice(0, -1));
          else if (results.some((r) => r.changed))
            setHistory((old) => rememberHistory([...old, before]));
          setWorkspace(workspaceSchema.parse(next));
          setComparison(
            next.result?.comparison ?? (next.dataset ? inferComparison(next.dataset) : null),
          );
          if (next.projectId) localStorage.setItem('insightos.lastProject', next.projectId);
        },
      );
      const seconds = (performance.now() - started) / 1000;
      setLastDuration(seconds);
      const answer = response.clarification ?? response.results.map((r) => r.summary).join('\n\n');
      lastTaskRef.current = {
        phase: 'ready',
        detail: answer.slice(0, 2000),
        updatedAt: new Date().toISOString(),
      };
      if (answer) {
        addMessage('assistant', answer, seconds);
        if (speechEnabled && status?.integrations.elevenLabs.ttsConfigured)
          void voice.speak(answer);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setAnnouncement('Task stopped. No stale result was applied.');
      } else {
        const detail = error instanceof Error ? error.message : 'The task could not complete.';
        lastTaskRef.current = {
          phase: 'error',
          detail: detail.slice(0, 2000),
          updatedAt: new Date().toISOString(),
        };
        addMessage('error', detail);
      }
    } finally {
      setBusy(engineRef.current!.busy);
      inputRef.current?.focus();
    }
  };
  runRef.current = execute;
  useEffect(() => {
    const generation = ++startupGeneration.current;
    (async () => {
      try {
        const cfg = await backend.status();
        if (generation !== startupGeneration.current) return;
        setStatus(cfg);
        if (cfg.sessionRequired && !cfg.authenticated) {
          setLocked(true);
          return;
        }
        await backend.session();
        if (generation !== startupGeneration.current) return;
        setStartupError('');
      } catch (error) {
        if (generation === startupGeneration.current)
          setStartupError(
            error instanceof Error ? error.message : 'Start the backend to use InsightOS.',
          );
      }
    })();
    return () => {
      startupGeneration.current++;
    };
  }, []);
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'instant',
    });
  }, [messages, progress, reducedMotion]);
  useEffect(() => {
    localStorage.setItem('insightos.speech', String(speechEnabled));
  }, [speechEnabled]);
  useEffect(() => {
    localStorage.setItem('insightos.largeText', String(largeText));
  }, [largeText]);
  useEffect(() => {
    localStorage.setItem('insightos.reducedMotion', String(reducedMotion));
  }, [reducedMotion]);
  useEffect(() => {
    if (modal) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialogRef.current?.showModal();
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
      previousFocus.current?.focus();
    }
  }, [modal]);
  const load = async (sample: boolean, file?: { name: string; text: string }) => {
    if (busy || loading || locked) return;
    voice.stop();
    setLoading(true);
    const controller = new AbortController();
    loadingController.current = controller;
    try {
      const imported = sample
        ? await backend.sample(controller.signal)
        : await backend.import(file!.name, file!.text, controller.signal);
      controller.signal.throwIfAborted();
      const before = stateRef.current;
      if (before.dataset) setHistory((old) => rememberHistory([...old, structuredClone(before)]));
      setWorkspace({
        ...emptyWorkspace(),
        title: imported.dataset.synthetic
          ? 'Operations review'
          : imported.dataset.name.replace(/\.csv$/i, ''),
        dataset: imported.dataset,
      });
      setComparison(imported.comparison);
      addMessage(
        'assistant',
        `Opened ${imported.dataset.name}: ${imported.dataset.rows.length} rows. The latest available quarter is ${imported.comparison.current.label}; the comparison quarter is ${imported.comparison.previous.label}. ${status?.mode === 'live' ? 'Analysis will upload this file to your configured Databricks workspace.' : 'Sample mode uses local calculations and a deterministic development planner.'}`,
      );
      inputRef.current?.focus();
    } catch (e) {
      if (!controller.signal.aborted)
        addMessage('error', e instanceof Error ? e.message : 'Unable to open file.');
    } finally {
      if (loadingController.current === controller) {
        loadingController.current = null;
        setLoading(false);
      }
    }
  };
  const openFile = async () => {
    if (window.insightos) {
      try {
        const file = await window.insightos.openCsv();
        if (file) await load(false, file);
      } catch (e) {
        addMessage('error', e instanceof Error ? e.message : 'File picker failed.');
      }
    } else fileRef.current?.click();
  };
  const setView = (kind: Workspace['view']['kind']) => {
    if (busy || loading || kind === workspace.view.kind) return;
    setHistory((old) => rememberHistory([...old, structuredClone(workspace)]));
    setWorkspace((old) => ({ ...old, view: { ...old.view, kind } }));
  };
  const showProjects = async () => {
    setModal('projects');
    try {
      setProjects((await backend.list()).projects);
    } catch (e) {
      addMessage('error', e instanceof Error ? e.message : 'Cannot load workspaces.');
    }
  };
  // Explicit saved-workspace selection uses a validated tool, independent of natural-language planning.
  const selectProject = async (id: string) => {
    setModal(null);
    if (busy || loading) return;
    setLoading(true);
    voice.stop();
    const controller = new AbortController();
    loadingController.current = controller;
    try {
      const { project, provider } = await backend.load(id, controller.signal);
      controller.signal.throwIfAborted();
      setWorkspace(workspaceSchema.parse(project.state));
      setHistory(rememberHistory(project.history));
      if (project.preferences) {
        setSpeechEnabled(project.preferences.speechEnabled);
        setLargeText(project.preferences.largeText);
        setReducedMotion(project.preferences.reducedMotion);
      }
      setComparison(
        project.state.result?.comparison ??
          (project.state.dataset ? inferComparison(project.state.dataset) : null),
      );
      localStorage.setItem('insightos.lastProject', id);
      addMessage(
        'assistant',
        `Restored ${project.state.title} from ${provider === 'neon' ? 'cloud' : 'local development'} storage.`,
      );
    } catch (e) {
      if (!controller.signal.aborted)
        addMessage('error', e instanceof Error ? e.message : 'Cannot restore workspace.');
    } finally {
      if (loadingController.current === controller) {
        loadingController.current = null;
        setLoading(false);
      }
    }
  };
  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await backend.session(passphrase);
      setLocked(false);
      setPassphrase('');
      setStatus(await backend.status());
      setStartupError('');
    } catch (e) {
      setStartupError(e instanceof Error ? e.message : 'Unlock failed.');
    }
  };
  const working = busy || loading || voice.phase === 'starting' || voice.phase === 'transcribing',
    result = workspace.result,
    regions = visibleRegions(workspace),
    live = status?.mode === 'live';
  const stateLabel =
    voice.phase === 'starting'
      ? 'Opening microphone'
      : voice.phase === 'listening'
        ? 'Listening'
        : voice.phase === 'transcribing'
          ? 'Transcribing'
          : voice.phase === 'speaking'
            ? 'Speaking'
            : loading
              ? 'Opening file'
              : busy
                ? progress.phase === 'thinking'
                  ? 'Thinking'
                  : 'Working'
                : progress.phase === 'error'
                  ? 'Needs attention'
                  : 'Ready';
  const viewItems = [
    { id: 'overview', label: 'Overview', icon: Layers3 },
    { id: 'chart', label: 'Chart', icon: BarChart3 },
    { id: 'table', label: 'Data', icon: Table2 },
    { id: 'calculation', label: 'Calculation', icon: ShieldCheck },
  ] as const;
  return (
    <div className={`app ${largeText ? 'large-text' : ''} ${reducedMotion ? 'reduce-motion' : ''}`}>
      <a className="skip-link" href="#request">
        Skip to request input
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="#main">
          <span className="brand-symbol">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <span>
            insight<span className="brand-os">OS</span>
          </span>
        </a>
        <div className="side-section-label">YOUR SPACE</div>
        <a className="nav-item" href="/">
          Computer companion
        </a>
        <button
          className="nav-item selected"
          onClick={() => document.getElementById('main')?.focus()}
        >
          <Layers3 size={17} aria-hidden="true" /> Workspace <span className="nav-dot" />
        </button>
        <button
          className="nav-item"
          onClick={() => void showProjects()}
          disabled={!status || locked || working}
        >
          <FolderOpen size={17} aria-hidden="true" /> Saved workspaces
        </button>
        <div className="side-section-label recent-label">CURRENT FILE</div>
        <div className="file-tile">
          <FileSpreadsheet size={20} aria-hidden="true" />
          <div>
            <strong>{workspace.dataset?.name ?? 'No file open'}</strong>
            <span>
              {workspace.dataset
                ? `${workspace.dataset.rows.length} rows · ${workspace.dataset.synthetic ? 'Synthetic' : 'Imported'}`
                : 'CSV workspace'}
            </span>
          </div>
        </div>
        <button
          className="side-open"
          onClick={() => void openFile()}
          disabled={!status || locked || working}
        >
          <Plus size={15} aria-hidden="true" /> Open a CSV
        </button>
        <div className="sidebar-bottom">
          <div className="mode-note">
            <span className="status-dot" />
            {live ? 'Live mode' : status?.hosted ? 'Hosted sample mode' : 'Local sample mode'}
            <small>
              {live ? 'Connected providers required' : 'Real calculations · development planner'}
            </small>
          </div>
          <button className="nav-item" onClick={() => setModal('settings')}>
            <Settings2 size={17} aria-hidden="true" /> Settings & connections
          </button>
          <div className="profile">
            <div className="profile-avatar">YO</div>
            <div>
              <strong>Your workspace</strong>
              <span>Independent work starts here</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="application-body">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} aria-hidden="true" />
            <strong>{workspace.title}</strong>
          </div>
          <div className="top-actions">
            <div className="mobile-actions">
              <button
                className="icon-button"
                aria-label="Saved workspaces"
                title="Saved workspaces"
                disabled={!status || locked || working}
                onClick={() => void showProjects()}
              >
                <FolderOpen size={17} aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                aria-label="Settings & connections"
                title="Settings & connections"
                onClick={() => setModal('settings')}
              >
                <Settings2 size={17} aria-hidden="true" />
              </button>
            </div>
            <span className="status-pill">
              <span className={`status-dot ${working ? 'pulse' : ''}`} />
              {stateLabel}
            </span>
            <button
              className="icon-button"
              aria-label="Undo last workspace change"
              title="Undo last change"
              disabled={!history.length || working || locked}
              onClick={() => void execute('Undo that change')}
            >
              <RotateCcw size={17} aria-hidden="true" />
            </button>
            <button
              className="save-button"
              disabled={!workspace.dataset || working || locked}
              onClick={() => void execute('Save my workspace')}
            >
              <Save size={15} aria-hidden="true" />
              Save workspace
            </button>
          </div>
        </header>
        {startupError && (
          <div className="error-banner" role="alert">
            {startupError}{' '}
            <button onClick={() => window.location.reload()}>Retry connection</button>
          </div>
        )}
        {locked && (
          <form className="unlock-banner" onSubmit={unlock}>
            <label htmlFor="passphrase">Unlock your private workspace</label>
            <input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="submit">Unlock</button>
          </form>
        )}
        <div className="workspace-layout">
          <main id="main" tabIndex={-1} className="work-panel">
            <div className="workspace-heading">
              <div>
                <div className="eyebrow">
                  <span /> A LITTLE CLARITY GOES A LONG WAY
                </div>
                <h1>
                  {workspace.dataset ? 'Let’s make sense of it.' : 'Your work. Within reach.'}
                </h1>
                <p>
                  {workspace.dataset
                    ? 'Ask a question. Follow the evidence. Make it yours.'
                    : 'A companion that helps you understand, refine, and review your work.'}
                </p>
              </div>
              <div className="workspace-mark" aria-hidden="true">
                <Sparkles size={30} />
              </div>
            </div>
            {!workspace.dataset ? (
              <section className="welcome-card">
                <div className="orb" aria-hidden="true">
                  <div className="orb-ring" />
                  <AudioLines size={48} />
                </div>
                <span className="small-label">START WITH SOMETHING REAL</span>
                <h2>
                  Bring a file.
                  <br />
                  We’ll find the insight.
                </h2>
                <p>
                  Open an operations CSV, or explore a synthetic sample.
                  <br />
                  Every answer comes from the data you select.
                </p>
                <div className="welcome-actions">
                  <button
                    className="primary-button"
                    onClick={() => void openFile()}
                    disabled={!status || locked || working}
                  >
                    <FolderOpen size={17} aria-hidden="true" /> Open CSV{' '}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void load(true)}
                    disabled={!status || locked || working}
                  >
                    Try sample data <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="welcome-foot">
                  <ShieldCheck size={15} aria-hidden="true" />
                  {live
                    ? 'Your selected file will be uploaded to configured analytics providers.'
                    : status?.hosted
                      ? 'Your selected file is uploaded to this private backend for calculation.'
                      : 'Sample data stays on this computer. No cloud account needed.'}
                </div>
              </section>
            ) : (
              <>
                <section className="dataset-banner" aria-label="Selected dataset">
                  <div className="dataset-icon">
                    <FileSpreadsheet size={22} aria-hidden="true" />
                  </div>
                  <div className="dataset-description">
                    <strong>{workspace.dataset.name}</strong>
                    <span>
                      {workspace.dataset.rows.length} rows ·{' '}
                      {new Set(workspace.dataset.rows.map((r) => r.region)).size} regions · USD
                    </span>
                  </div>
                  <span className="data-badge">
                    {workspace.dataset.synthetic ? 'SYNTHETIC DATA' : 'IMPORTED CSV'}
                  </span>
                </section>
                <nav className="view-nav" aria-label="Workspace views">
                  {viewItems.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      aria-pressed={workspace.view.kind === id}
                      disabled={working || (!result && (id === 'chart' || id === 'calculation'))}
                      onClick={() => setView(id)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </nav>
                {result ? (
                  <>
                    <section className="stats-grid" aria-label="Analysis totals">
                      <div className="stat">
                        <span>{result.comparison.current.label} REVENUE</span>
                        <strong>{money(result.currentTotal)}</strong>
                        <small>{result.includedLocations} included locations</small>
                      </div>
                      <div className="stat">
                        <span>QUARTER-OVER-QUARTER</span>
                        <strong
                          className={
                            result.percent !== null && result.percent < 0 ? 'negative' : 'positive'
                          }
                        >
                          {percent(result.percent)}
                        </strong>
                        <small>vs. {money(result.previousTotal)} previously</small>
                      </div>
                      <div className="stat">
                        <span>LARGEST REVENUE CHANGE</span>
                        <strong>{result.regions[0]?.region ?? 'No matches'}</strong>
                        <small>
                          {result.regions[0]
                            ? `${money(result.regions[0].delta)} · ${percent(result.regions[0].percent)}`
                            : 'Try changing the filter'}
                        </small>
                      </div>
                    </section>
                    {workspace.view.kind === 'calculation' ? (
                      <section className="artifact-card calculation">
                        <div className="artifact-heading">
                          <div>
                            <span className="small-label">FOLLOW THE EVIDENCE</span>
                            <h2>How we got here</h2>
                          </div>
                          <ShieldCheck size={23} aria-hidden="true" />
                        </div>
                        <div className="formula">
                          ({money(result.currentTotal)} − {money(result.previousTotal)})<br />
                          <span>
                            ÷ {money(Math.abs(result.previousTotal))} × 100 ={' '}
                            <strong>{percent(result.percent)}</strong>
                          </span>
                        </div>
                        <p>{result.calculation}</p>
                        <dl className="provenance">
                          <dt>Previous period</dt>
                          <dd>
                            {result.comparison.previous.start} → {result.comparison.previous.end}
                          </dd>
                          <dt>Current period</dt>
                          <dd>
                            {result.comparison.current.start} → {result.comparison.current.end}
                          </dd>
                          <dt>Active filter</dt>
                          <dd>
                            {result.comparison.commonLocations
                              ? 'Continuous operation throughout both full quarters'
                              : 'All reported locations'}
                          </dd>
                          <dt>Included / excluded</dt>
                          <dd>
                            {result.includedRows} rows · {result.includedLocations} locations ·{' '}
                            {result.excludedLocations} locations excluded
                          </dd>
                          <dt>Dataset version</dt>
                          <dd className="mono">{result.datasetVersion.slice(0, 20)}</dd>
                          <dt>Result source</dt>
                          <dd>{result.queryReference}</dd>
                          <dt>Calculated at</dt>
                          <dd>{new Date(result.createdAt).toLocaleString()}</dd>
                        </dl>
                      </section>
                    ) : (
                      <section className="artifact-card">
                        <div className="artifact-heading">
                          <div>
                            <span className="small-label">
                              {workspace.view.topN
                                ? `TOP ${Math.min(workspace.view.topN, regions.length)} REGIONS`
                                : 'REGIONAL COMPARISON'}
                            </span>
                            <h2>Revenue, in perspective</h2>
                          </div>
                          <div className="chart-legend">
                            <span>
                              <i className="legend-previous" />
                              {result.comparison.previous.label}
                            </span>
                            <span>
                              <i className="legend-current" />
                              {result.comparison.current.label}
                            </span>
                          </div>
                        </div>
                        {workspace.view.kind !== 'table' && <Chart state={workspace} />}
                        <div
                          className="table-scroll"
                          tabIndex={0}
                          role="region"
                          aria-label="Data table"
                        >
                          <table className="result-table">
                            <caption className="sr-only">
                              Regions ranked by absolute revenue change.{' '}
                              {workspace.view.topN
                                ? 'View is limited; totals cover all included regions.'
                                : ''}
                            </caption>
                            <thead>
                              <tr>
                                <th scope="col">Region</th>
                                <th scope="col">{result.comparison.previous.label}</th>
                                <th scope="col">{result.comparison.current.label}</th>
                                <th scope="col">Change</th>
                                <th scope="col">Change %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {regions.map((r) => (
                                <tr key={r.region}>
                                  <th scope="row">{r.region}</th>
                                  <td>{money(r.previous)}</td>
                                  <td>{money(r.current)}</td>
                                  <td>{money(r.delta)}</td>
                                  <td className={r.delta >= 0 ? 'positive' : 'negative'}>
                                    {percent(r.percent)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="chart-caption">
                          <ShieldCheck size={14} aria-hidden="true" />
                          {result.comparison.commonLocations
                            ? 'Same locations · operating throughout both quarters'
                            : 'All reported locations'}{' '}
                          · Ranked by absolute revenue change
                        </div>
                      </section>
                    )}
                    <section className="insight-card" aria-label="Accessible analysis summary">
                      <div className="insight-icon">
                        <Sparkles size={19} aria-hidden="true" />
                      </div>
                      <div>
                        <h3>The takeaway</h3>
                        <p>{describeResult(result, workspace.view.topN)}</p>
                      </div>
                    </section>
                    <div className="artifact-footer">
                      <span>
                        <Check size={13} aria-hidden="true" />
                        {result.provider === 'databricks'
                          ? 'Calculated in Databricks'
                          : status?.hosted
                            ? 'Calculated on backend · sample mode'
                            : 'Calculated locally · sample mode'}
                      </span>
                      <button
                        onClick={() => void execute('How did you calculate that percentage?')}
                        disabled={working}
                      >
                        Review calculation <ArrowUpRight size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : workspace.view.kind === 'table' ? (
                  <section className="artifact-card">
                    <h2>Source rows</h2>
                    <div
                      className="table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Data table"
                    >
                      <table className="result-table">
                        <caption>
                          First {Math.min(30, workspace.dataset.rows.length)} of{' '}
                          {workspace.dataset.rows.length} source rows
                        </caption>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Location</th>
                            <th>Region</th>
                            <th>Revenue</th>
                            <th>Operating start</th>
                            <th>Operating end</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workspace.dataset.rows.slice(0, 30).map((r) => (
                            <tr key={r.location_id + r.date}>
                              <td>{r.date}</td>
                              <td>{r.location_id}</td>
                              <td>{r.region}</td>
                              <td>{money(r.revenue)}</td>
                              <td>{r.operating_start}</td>
                              <td>{r.operating_end ?? 'Still operating'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : (
                  <section className="ready-card">
                    <div className="ready-icon">
                      <BarChart3 size={36} aria-hidden="true" />
                    </div>
                    <span className="small-label">YOUR DATA IS READY</span>
                    <h2>What would you like to know?</h2>
                    <p>
                      Compare {comparison?.current.label ?? 'the latest quarter'} with{' '}
                      {comparison?.previous.label ?? 'the previous quarter'},<br />
                      then explore which regions changed the most.
                    </p>
                    <button
                      className="primary-button"
                      onClick={() =>
                        void execute(
                          'Compare revenue this quarter with last quarter and tell me which region changed the most',
                        )
                      }
                      disabled={working}
                    >
                      Compare quarters <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void execute('What is in this file?')}
                      disabled={working}
                    >
                      Describe the file first
                    </button>
                  </section>
                )}
              </>
            )}
            <div className="capability-row">
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                Traceable answers
              </span>
              <span>
                <RotateCcw size={15} aria-hidden="true" />
                Changes you can undo
              </span>
              <span>
                <Volume2 size={15} aria-hidden="true" />
                Accessible review
              </span>
            </div>
          </main>
          <aside className="companion-panel" aria-label="Companion conversation">
            <div className="companion-heading">
              <div className="companion-avatar">
                <Sparkles size={18} aria-hidden="true" />
              </div>
              <div>
                <h2>Your companion</h2>
                <span>Ask. Refine. Understand.</span>
              </div>
              <button
                className="icon-button"
                aria-label={speechEnabled ? 'Mute spoken feedback' : 'Enable spoken feedback'}
                aria-pressed={speechEnabled}
                onClick={() => {
                  setSpeechEnabled(!speechEnabled);
                  if (speechEnabled) voice.stop();
                }}
              >
                {speechEnabled ? (
                  <Volume2 size={17} aria-hidden="true" />
                ) : (
                  <VolumeX size={17} aria-hidden="true" />
                )}
              </button>
            </div>
            <div
              className="conversation"
              ref={transcriptRef}
              tabIndex={0}
              role="log"
              aria-label="Conversation transcript"
              aria-live="off"
            >
              {messages.map((m) => (
                <div key={m.id} className={`message ${m.role}`}>
                  <div className="message-label">
                    {m.role === 'user'
                      ? 'YOU'
                      : m.role === 'error'
                        ? 'NEEDS ATTENTION'
                        : 'INSIGHTOS'}
                    {m.duration !== undefined && <span>{m.duration.toFixed(1)}s</span>}
                  </div>
                  <p>{m.text}</p>
                </div>
              ))}
              {working && (
                <div className="task-progress">
                  <LoaderCircle size={15} aria-hidden="true" />
                  <span>{loading ? 'Opening and validating your file' : progress.detail}</span>
                </div>
              )}
            </div>
            <div className="composer-area">
              <div className="suggestions" role="group" aria-label="Suggested requests">
                {(result
                  ? [
                      ['Show as chart', 'Show that as a chart'],
                      [
                        'Same locations',
                        'Only include locations that were operating in both quarters',
                      ],
                      ['Top 3 regions', 'Only show the top three regions'],
                    ]
                  : workspace.dataset
                    ? [
                        ['Describe file', 'What is in this file?'],
                        ['Compare quarters', 'Compare revenue this quarter with last quarter'],
                      ]
                    : []
                ).map(([label, text]) => (
                  <button key={label} disabled={working} onClick={() => void execute(text)}>
                    {label}
                    <Plus size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <form
                className={`composer ${voice.phase === 'listening' ? 'listening' : ''}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void execute(request);
                }}
              >
                <label className="sr-only" htmlFor="request">
                  Ask InsightOS about your workspace
                </label>
                <textarea
                  ref={inputRef}
                  id="request"
                  rows={3}
                  maxLength={2000}
                  placeholder={
                    voice.phase === 'listening'
                      ? 'Listening… finish when you’re ready.'
                      : 'What would you like to do?'
                  }
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  disabled={locked}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!working && voice.phase !== 'listening') void execute(request);
                    }
                  }}
                />
                <div className="composer-controls">
                  <button
                    type="button"
                    className={`mic-button ${voice.phase === 'listening' ? 'active' : ''}`}
                    aria-label={
                      voice.phase === 'listening'
                        ? 'Finish recording and send voice request'
                        : 'Record a voice request'
                    }
                    disabled={working || locked || !status?.integrations.elevenLabs.configured}
                    title={
                      status?.integrations.elevenLabs.configured
                        ? 'Push to talk; click again to send'
                        : 'Configure ElevenLabs in Settings to enable microphone input'
                    }
                    onClick={() =>
                      voice.phase === 'listening' ? voice.finish() : void voice.start()
                    }
                  >
                    <Mic size={18} aria-hidden="true" />
                    <span>
                      {voice.phase === 'listening' ? 'Finish recording' : 'Voice request'}
                    </span>
                  </button>
                  <span className="enter-hint">↵ to send</span>
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="Send request"
                    disabled={
                      !request.trim() || working || locked || !status || voice.phase === 'listening'
                    }
                  >
                    <ArrowUp size={19} aria-hidden="true" />
                  </button>
                </div>
              </form>
              {(working || voice.phase !== 'idle') && (
                <button className="stop-button" onClick={stop}>
                  <Square size={12} aria-hidden="true" />
                  Stop task & audio
                </button>
              )}
              <div className="composer-note">
                <CircleHelp size={12} aria-hidden="true" />
                {live
                  ? 'Supported workspace tasks · review every result'
                  : 'Sample mode · typed requests · local calculations'}
              </div>
            </div>
          </aside>
        </div>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {stateLabel}
            <span className="statusbar-divider" />{' '}
            {voice.phase === 'idle'
              ? progress.detail
              : voice.phase === 'starting'
                ? 'Allow microphone access to begin recording'
                : voice.phase === 'listening'
                  ? 'Microphone active · maximum 30 seconds'
                  : voice.phase === 'speaking'
                    ? 'Spoken answer · Stop interrupts playback'
                    : 'Converting your recording to text'}
          </span>
          <span>
            {lastDuration !== null ? `Last request ${lastDuration.toFixed(2)}s` : 'No request yet'}
            <span className="statusbar-divider" />
            InsightOS · v0.1
          </span>
        </footer>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            if (file.size > 1024 * 1024) {
              addMessage('error', 'CSV must be 1 MB or smaller.');
              return;
            }
            await load(false, { name: file.name, text: await file.text() });
          }
        }}
      />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <dialog
        ref={dialogRef}
        className="settings-dialog"
        onCancel={() => setModal(null)}
        onClose={() => {
          if (modal) setModal(null);
        }}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-heading">
          <h2 id="dialog-title">
            {modal === 'projects' ? 'Saved workspaces' : 'Make yourself at home'}
          </h2>
          <button className="icon-button" aria-label="Close dialog" onClick={() => setModal(null)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {modal === 'settings' ? (
          <>
            <p className="dialog-subtitle">Choose how your companion looks and speaks.</p>
            <div className="preference">
              <label htmlFor="speech">
                Spoken feedback
                <small>Mute when using a screen reader to avoid competing voices.</small>
              </label>
              <input
                id="speech"
                type="checkbox"
                checked={speechEnabled}
                onChange={(e) => {
                  setSpeechEnabled(e.target.checked);
                  if (!e.target.checked) voice.stop();
                }}
              />
            </div>
            <div className="preference">
              <label htmlFor="large">Larger text</label>
              <input
                id="large"
                type="checkbox"
                checked={largeText}
                onChange={(e) => setLargeText(e.target.checked)}
              />
            </div>
            <div className="preference">
              <label htmlFor="motion">Reduce motion</label>
              <input
                id="motion"
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
              />
            </div>
            <ConnectionsPanel
              disabled={working || voice.phase !== 'idle'}
              onChanged={async () => setStatus(await backend.status())}
            />
            <details className="connections">
              <summary>Developer connections & sample-mode details</summary>
              <p>
                Configured means credentials are present, not that a live request has passed.
                Connection-screen saves apply immediately. Restart after manually editing .env.
              </p>
              <dl>
                {[
                  ['Open-model planner', status?.integrations.huggingFace.configured],
                  ['Databricks analytics', status?.integrations.databricks.configured],
                  ['ElevenLabs transcription', status?.integrations.elevenLabs.configured],
                  ['ElevenLabs speech', status?.integrations.elevenLabs.ttsConfigured],
                  ['Neon persistence', status?.integrations.neon.configured],
                  ['Vultr deployment', false],
                ].map(([label, configured]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd className={configured ? 'positive' : ''}>
                      {configured ? 'Configured · unverified' : 'Needs configuration'}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Mode: {status?.mode ?? 'connecting'}. Planner model:{' '}
                {status?.integrations.huggingFace.model ?? 'not configured'}. Storage:{' '}
                {status?.storage ?? 'connecting'}. Sample mode never claims Hugging Face or
                Databricks execution. Microphone input uses push-to-talk recordings; continuous
                transcription is not implemented.
              </p>
            </details>
          </>
        ) : (
          <>
            <p className="dialog-subtitle">
              Saved project state includes your file, results, filters, and undo history.
            </p>
            {projects.length ? (
              projects.map((p) => (
                <button
                  key={p.id}
                  className="project-button"
                  onClick={() => void selectProject(p.id)}
                >
                  <FileSpreadsheet size={21} aria-hidden="true" />
                  <span>
                    <strong>{p.title}</strong>
                    <small>{new Date(p.updatedAt).toLocaleString()}</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              ))
            ) : (
              <p className="no-projects">
                No saved workspaces yet. Open a CSV and choose Save workspace.
              </p>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
