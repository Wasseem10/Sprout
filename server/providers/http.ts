export type ProviderIdentity =
  'Hugging Face' | 'ElevenLabs' | 'ElevenLabs speech' | 'Databricks' | 'Provider';
export type ProviderFailureReason = 'quota' | 'key' | 'permission' | 'access';
export class ProviderRequestError extends Error {
  constructor(
    readonly provider: ProviderIdentity,
    readonly httpStatus: number,
    readonly reason: ProviderFailureReason,
  ) {
    const detail =
      reason === 'quota'
        ? `${provider} credits are exhausted. Restore this provider's credits or use another speech provider.`
        : reason === 'key'
          ? `${provider} rejected its saved API key. Check the key in Connections.`
          : reason === 'permission'
            ? `${provider} denied this operation. Check the saved key's permissions and model access.`
            : `${provider} could not complete this request. Check provider access and account limits.`;
    super(`Provider request failed (HTTP ${httpStatus}). ${detail}`);
    this.name = 'ProviderRequestError';
  }
}
function providerForUrl(value: string): ProviderIdentity {
  const hostname = new URL(value).hostname;
  if (hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co')) return 'Hugging Face';
  if (hostname === 'api.elevenlabs.io') return 'ElevenLabs';
  if (hostname.endsWith('.databricks.com')) return 'Databricks';
  return 'Provider';
}
// Read only a whitelisted machine status. Provider messages may contain private data.
export async function providerFailure(
  response: Response,
  provider: ProviderIdentity,
): Promise<ProviderRequestError> {
  const body = await response.json().catch(() => null);
  const code = body?.detail?.status ?? body?.error?.code ?? body?.error?.type ?? body?.code;
  const reason: ProviderFailureReason = [
    'quota_exceeded',
    'insufficient_quota',
    'credits_exhausted',
  ].includes(code)
    ? 'quota'
    : ['invalid_api_key', 'invalid_key', 'authentication_error'].includes(code)
      ? 'key'
      : ['missing_permissions', 'insufficient_permissions', 'permission_denied'].includes(code)
        ? 'permission'
        : 'access';
  return new ProviderRequestError(provider, response.status, reason);
}
export async function fetchJson(
  url: string,
  options: RequestInit = {},
  timeout = 45000,
): Promise<any> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  const response = await fetch(url, { ...options, signal });
  if (!response.ok) throw await providerFailure(response, providerForUrl(url));
  return response.json();
}
export function secureUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Provider endpoints must be HTTPS URLs without credentials or query strings.');
  return url;
}
export const checkpoint = (signal: AbortSignal) => signal.throwIfAborted();
