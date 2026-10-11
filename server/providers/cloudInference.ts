import type { Config } from '../config.js';
import { secureUrl } from './http.js';
import type { InferenceOutputSchema } from '../../shared/inference-schema.js';

export type CloudInferenceInput = {
  system: string;
  content: unknown;
  vision: boolean;
  json: boolean;
  maxTokens?: number;
  outputSchema?: InferenceOutputSchema;
  /** A bounded application purpose; model IDs and settings remain server-owned. */
  purpose?: 'writing';
};
export type CloudInferenceEvidence = {
  text: string;
  origin: string;
  provider: 'hugging-face';
  execution: 'cloud-service';
};

export function cloudOrigin(cfg: Pick<Config, 'cloudUrl' | 'cloudPassphrase'>): URL {
  let origin: URL;
  try {
    origin = secureUrl(cfg.cloudUrl);
  } catch {
    throw new Error('Cloud AI needs an HTTPS origin without credentials, a path or query.');
  }
  if (origin.pathname !== '/' || cfg.cloudPassphrase.length < 16)
    throw new Error('Cloud AI needs an HTTPS origin and a passphrase of at least 16 characters.');
  return origin;
}

function sessionCookie(response: Response): string {
  const headers = response.headers;
  const values =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie') ?? ''];
  const sessions = values.flatMap((value) =>
    Array.from(value.matchAll(/(?:^|,\s*)insightos_session=([^;\s,]*)/g), (match) => match[1]),
  );
  // Never forward arbitrary response cookies or characters that can alter a header.
  if (sessions.length !== 1 || !/^[a-zA-Z0-9._~%+-]{10,1000}$/.test(sessions[0]))
    throw new Error('Cloud AI did not return a valid session.');
  return `insightos_session=${sessions[0]}`;
}

// Keep desktop execution local while a deployed (e.g. Vultr) backend runs AI requests.
export async function cloudInferenceWithEvidence(
  cfg: Config,
  input: CloudInferenceInput,
  signal: AbortSignal,
): Promise<CloudInferenceEvidence> {
  signal.throwIfAborted();
  const origin = cloudOrigin(cfg);
  const combined = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
  const login = await fetch(new URL('/api/session', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase: cfg.cloudPassphrase }),
    signal: combined,
    redirect: 'error',
  });
  if (!login.ok) throw new Error('Cloud AI could not authenticate. Check its session passphrase.');
  combined.throwIfAborted();
  const cookie = sessionCookie(login);
  const response = await fetch(new URL('/api/agent/infer', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(input),
    signal: combined,
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `Cloud AI request failed (HTTP ${response.status}). No local fallback was substituted.`,
    );
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error('Cloud AI returned an invalid response.');
  }
  combined.throwIfAborted();
  if (
    !result ||
    typeof result.text !== 'string' ||
    !result.text.trim() ||
    result.text.length > 30000 ||
    result.provider !== 'hugging-face' ||
    result.execution !== 'cloud-service'
  )
    throw new Error('Cloud AI returned an invalid response or missing inference provenance.');
  return {
    text: result.text,
    origin: origin.origin,
    provider: 'hugging-face',
    execution: 'cloud-service',
  };
}

export async function cloudInference(
  cfg: Config,
  input: CloudInferenceInput,
  signal: AbortSignal,
): Promise<string> {
  return (await cloudInferenceWithEvidence(cfg, input, signal)).text;
}
