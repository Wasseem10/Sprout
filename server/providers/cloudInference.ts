import type { Config } from '../config.js';
import { secureUrl } from './http.js';

// Keep desktop execution local while a deployed (e.g. Vultr) backend runs AI requests.
export async function cloudInference(
  cfg: Config,
  input: { system: string; content: unknown; vision: boolean; json: boolean },
  signal: AbortSignal,
): Promise<string> {
  const origin = secureUrl(cfg.cloudUrl);
  if (origin.pathname !== '/' || !cfg.cloudPassphrase)
    throw new Error('Cloud AI needs an HTTPS origin and its session passphrase.');
  const combined = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
  const login = await fetch(new URL('/api/session', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase: cfg.cloudPassphrase }),
    signal: combined,
    redirect: 'error',
  });
  if (!login.ok) throw new Error('Cloud AI could not authenticate. Check its session passphrase.');
  const cookie = login.headers.get('set-cookie')?.match(/(?:^|,\s*)insightos_session=([^;]+)/)?.[1];
  if (!cookie) throw new Error('Cloud AI did not return a session.');
  const response = await fetch(new URL('/api/agent/infer', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `insightos_session=${cookie}` },
    body: JSON.stringify(input),
    signal: combined,
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `Cloud AI request failed (HTTP ${response.status}). No local fallback was substituted.`,
    );
  const result = await response.json();
  if (typeof result.text !== 'string' || result.text.length > 30000)
    throw new Error('Cloud AI returned an invalid response.');
  return result.text;
}
