export async function fetchJson(
  url: string,
  options: RequestInit = {},
  timeout = 45000,
): Promise<any> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  const response = await fetch(url, { ...options, signal });
  if (!response.ok)
    throw new Error(
      `Provider request failed (HTTP ${response.status}). Check configuration, access, and account limits.`,
    );
  return response.json();
}
export function secureUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Provider endpoints must be HTTPS URLs without credentials or query strings.');
  return url;
}
export const checkpoint = (signal: AbortSignal) => signal.throwIfAborted();
