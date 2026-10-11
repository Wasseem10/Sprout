import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import {
  accountUrls,
  type ConnectionSettings,
  type ConnectionState,
  type Provider,
} from '../shared/connections';
import './connections.css';

const cards: {
  provider: Provider;
  name: string;
  description: string;
  fields: { key: keyof ConnectionSettings; label: string; secret?: boolean; optional?: boolean }[];
}[] = [
  {
    provider: 'huggingFace',
    name: 'Hugging Face',
    description: 'Flexible voice commands, Python generation and screen understanding.',
    fields: [
      { key: 'HF_TOKEN', label: 'Access token', secret: true },
      { key: 'HF_MODEL_ID', label: 'Text model', optional: true },
      { key: 'HF_VISION_MODEL_ID', label: 'Vision model', optional: true },
    ],
  },
  {
    provider: 'elevenLabs',
    name: 'ElevenLabs',
    description: 'Microphone transcription and spoken replies.',
    fields: [
      { key: 'ELEVENLABS_API_KEY', label: 'API key', secret: true },
      { key: 'ELEVENLABS_VOICE_ID', label: 'Voice ID', optional: true },
    ],
  },
  {
    provider: 'databricks',
    name: 'Databricks',
    description: 'Real SQL analysis in the data workspace. Testing creates synthetic tables.',
    fields: [
      { key: 'DATABRICKS_HOST', label: 'Workspace URL' },
      { key: 'DATABRICKS_WAREHOUSE_ID', label: 'SQL warehouse ID' },
      { key: 'DATABRICKS_TOKEN', label: 'Access token', secret: true },
      { key: 'DATABRICKS_CATALOG', label: 'Catalog', optional: true },
      { key: 'DATABRICKS_SCHEMA', label: 'Schema', optional: true },
    ],
  },
  {
    provider: 'vultr',
    name: 'Vultr',
    description:
      'Run AI requests on your deployed Sprout server; files and desktop actions stay on this computer. Requires an existing deployment.',
    fields: [
      { key: 'INSIGHTOS_CLOUD_URL', label: 'Deployed HTTPS origin' },
      { key: 'INSIGHTOS_CLOUD_PASSPHRASE', label: 'Server session passphrase', secret: true },
    ],
  },
  {
    provider: 'neon',
    name: 'Neon',
    description: 'Cloud saves for data projects. Testing writes a synthetic project.',
    fields: [{ key: 'DATABASE_URL', label: 'PostgreSQL connection string', secret: true }],
  },
];

export default function ConnectionsPanel({
  disabled = false,
  onChanged,
}: {
  disabled?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [values, setValues] = useState<ConnectionSettings>({});
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [feedbackProvider, setFeedbackProvider] = useState<Provider | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    api<ConnectionState>('/connections', undefined, controller.signal)
      .then((next) => {
        if (mounted.current) {
          setState(next);
          setValues(next.defaults);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && mounted.current) setMessage(error.message);
      });
    return () => {
      mounted.current = false;
      controller.abort();
      abort.current?.abort();
    };
  }, []);
  const locked = disabled || !!pending || !state?.editable;
  const run = async (name: string, body: unknown, verify = false) => {
    if (locked || abort.current) return;
    setFeedbackProvider(
      cards.find((card) => name.startsWith(card.provider + '-'))?.provider ?? null,
    );
    const controller = new AbortController();
    abort.current = controller;
    setPending(name);
    setMessage(verify ? 'Making real provider requests…' : 'Saving locally…');
    try {
      const next = await api<ConnectionState>(
        verify ? '/connections/verify' : '/connections',
        body,
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      setState(next);
      if (!verify)
        setValues((old) => {
          const next = { ...old };
          for (const key of [
            'HF_TOKEN',
            'ELEVENLABS_API_KEY',
            'DATABRICKS_TOKEN',
            'DATABASE_URL',
            'INSIGHTOS_CLOUD_PASSPHRASE',
          ] as const)
            if (Object.hasOwn(body as object, key)) delete next[key];
          return next;
        });
      else setValues((old) => ({ ...old, ELEVENLABS_VOICE_ID: next.defaults.ELEVENLABS_VOICE_ID }));
      const failed =
        verify &&
        next.reports[(body as { provider: Provider }).provider]?.checks.some(
          (check) => check.status === 'failed',
        );
      setMessage(
        verify
          ? failed
            ? 'Some checks failed. See the results below.'
            : 'Provider checks passed. Try a task in the app next.'
          : 'Saved. Settings are active now; no restart needed.',
      );
      await onChanged();
    } catch (error) {
      if (mounted.current)
        setMessage(
          controller.signal.aborted
            ? 'Connection test canceled. A completed provider request or save may remain.'
            : (error as Error).message,
        );
    } finally {
      abort.current = null;
      if (mounted.current) setPending(null);
    }
  };
  const openAccount = async (provider: keyof typeof accountUrls) => {
    try {
      if (window.insightos?.openAccount) await window.insightos.openAccount(provider);
      else window.open(accountUrls[provider], '_blank', 'noopener,noreferrer');
    } catch {
      setMessage('Could not open the account page. Use the sponsor setup guide.');
    }
  };
  const save = (provider: Provider) => {
    setFeedbackProvider(provider);
    const body = Object.fromEntries(
      cards
        .find((card) => card.provider === provider)!
        .fields.map(({ key }) => [key, values[key]?.trim()])
        .filter(([, value]) => !!value),
    );
    if (!Object.keys(body).length) {
      setMessage('Enter a key first, or test the existing connection.');
      return;
    }
    void run(provider + '-save', body);
  };
  return (
    <section className="sponsor-connections" aria-label="Sponsor connections">
      <h3>Connect your accounts</h3>
      <p>
        Start with Hugging Face and ElevenLabs for AI and voice. Keys save to your local,
        Git-ignored .env file and are never displayed again. Leave a key blank to keep it.
      </p>
      {state && !state.editable && (
        <p>
          Use the local desktop app to edit credentials. Hosted credentials are managed on the
          server.
        </p>
      )}
      {!feedbackProvider && (
        <div className="sponsor-status" role="status" aria-live="polite">
          {message || (state ? 'Ready to connect.' : 'Loading connections…')}
        </div>
      )}
      {pending && (
        <button type="button" className="sponsor-cancel" onClick={() => abort.current?.abort()}>
          Cancel connection request
        </button>
      )}
      {cards.map((card) => {
        const report = state?.reports[card.provider];
        return (
          <article className="sponsor-card" key={card.provider}>
            <div className="sponsor-heading">
              <h4>{card.name}</h4>
              <span>
                {report
                  ? report.checks.every((check) => check.status === 'passed')
                    ? 'Test passed'
                    : 'Needs attention'
                  : state?.configured[card.provider]
                    ? 'Saved · not tested'
                    : 'Not connected'}
              </span>
            </div>
            <p>{card.description}</p>
            <button
              type="button"
              className="sponsor-account"
              onClick={() => void openAccount(card.provider)}
            >
              Open {card.name} account ↗
            </button>
            {card.fields.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label}
                  {field.optional ? ' (optional)' : ''}
                </span>
                <input
                  type={field.secret ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={locked}
                  placeholder={
                    field.secret && state?.configured[card.provider]
                      ? 'Saved on backend · enter to replace'
                      : field.key === 'ELEVENLABS_VOICE_ID'
                        ? 'Blank: select your first available voice during test'
                        : ''
                  }
                  onChange={(event) =>
                    setValues((old) => ({ ...old, [field.key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <div className="sponsor-actions">
              <button type="button" disabled={locked} onClick={() => save(card.provider)}>
                Save {card.name}
              </button>
              <button
                type="button"
                disabled={locked || !state?.configured[card.provider]}
                onClick={() =>
                  void run(card.provider + '-verify', { provider: card.provider }, true)
                }
              >
                Test {card.name}
              </button>
            </div>
            {feedbackProvider === card.provider && (
              <div className="sponsor-status" role="status" aria-live="polite">
                {message}
              </div>
            )}
            {report && (
              <ul className="sponsor-checks">
                {report.checks.map((check, index) => (
                  <li className={check.status} key={index}>
                    {check.status === 'passed' ? '✓' : '!'} {check.detail}
                  </li>
                ))}
                <li>
                  Checked {new Date(report.checkedAt).toLocaleString()}. Checks reset when settings
                  change or the server restarts.
                </li>
              </ul>
            )}
          </article>
        );
      })}
      <label className="sponsor-live">
        <input
          type="checkbox"
          checked={state?.defaults.APP_MODE === 'live'}
          disabled={locked || !state?.configured.huggingFace || !state?.configured.databricks}
          onChange={(event) =>
            void run('data-mode', { APP_MODE: event.target.checked ? 'live' : 'sample' })
          }
        />
        <span>Use Hugging Face + Databricks in the data workspace</span>
      </label>
      <p>
        The computer companion uses Hugging Face as soon as its key is saved. Data mode controls CSV
        analysis separately. Tests consume provider credits; microphone and speaker checks still
        need a quick try on this laptop.
      </p>
      <article className="sponsor-card">
        <h4>Vultr hosting</h4>
        <p>
          Requires deploying the backend on a Vultr instance. A Vultr API key alone does not add
          hosting. Desktop control runs on this laptop.
        </p>
        <button type="button" className="sponsor-account" onClick={() => void openAccount('vultr')}>
          Open Vultr account ↗
        </button>
      </article>
    </section>
  );
}
