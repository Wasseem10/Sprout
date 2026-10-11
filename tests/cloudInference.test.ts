import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { cloudInference, cloudInferenceWithEvidence } from '../server/providers/cloudInference';
import { verifyCloudInference } from '../scripts/check-cloud';
import { buildApp } from '../server/app';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('authenticates cloud inference without sending the local Hugging Face credential', async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      calls.push({ url: String(url), options });
      return String(url).endsWith('/session')
        ? new Response('{}', {
            headers: { 'set-cookie': 'insightos_session=session-id; HttpOnly; Secure' },
          })
        : new Response(
            JSON.stringify({
              text: '{"decision":"ask"}',
              provider: 'hugging-face',
              execution: 'cloud-service',
            }),
          );
    }),
  );
  const result = await cloudInference(
    {
      ...config(),
      cloudUrl: 'https://cloud.example.test',
      cloudPassphrase: 'test-cloud-passphrase',
      hfToken: 'local-secret',
    },
    { system: 'Plan the task', content: 'Open a page', vision: false, json: true },
    new AbortController().signal,
  );
  expect(result).toContain('ask');
  expect(calls[1].url).toBe('https://cloud.example.test/api/agent/infer');
  expect(calls[1].options.headers).toMatchObject({ Cookie: 'insightos_session=session-id' });
  expect(JSON.stringify(calls)).not.toContain('local-secret');
  expect(calls.every((call) => call.options.redirect === 'error')).toBe(true);
});

const cloudConfig = () => ({
  ...config(),
  cloudUrl: 'https://cloud.example.test',
  cloudPassphrase: 'test-cloud-passphrase',
  hfToken: 'local-hf-credential',
});
const inferenceInput = { system: 'Return JSON', content: 'Hello', vision: false, json: true };
const sessionResponse = () =>
  new Response('{}', {
    headers: {
      'set-cookie':
        'unrelated=not-forwarded; Path=/, insightos_session=valid-session-id; HttpOnly; Secure',
    },
  });

it.each([
  { cloudUrl: 'http://cloud.example.test' },
  { cloudUrl: 'https://user:private-secret@cloud.example.test' },
  { cloudUrl: 'https://cloud.example.test/inference' },
  { cloudUrl: 'https://cloud.example.test?key=private-secret' },
  { cloudUrl: 'https://cloud.example.test#fragment' },
  { cloudPassphrase: 'too-short' },
])('rejects unsafe cloud configuration before credentials leave the laptop: %j', async (change) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    cloudInference({ ...cloudConfig(), ...change }, inferenceInput, new AbortController().signal),
  ).rejects.toThrow(/^Cloud AI/);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not start or continue authentication after cancellation', async () => {
  const controller = new AbortController();
  const fetch = vi.fn(async () => {
    controller.abort();
    return sessionResponse();
  });
  vi.stubGlobal('fetch', fetch);
  await expect(cloudInference(cloudConfig(), inferenceInput, controller.signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(cloudInference(cloudConfig(), inferenceInput, controller.signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('forwards only the cloud session cookie and returns explicit inference provenance', async () => {
  const fetch = vi.fn(async (url, options) => {
    if (String(url).endsWith('/session')) return sessionResponse();
    expect(options.headers.Cookie).toBe('insightos_session=valid-session-id');
    return new Response(
      JSON.stringify({ text: '{"ok":true}', provider: 'hugging-face', execution: 'cloud-service' }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    await cloudInferenceWithEvidence(cloudConfig(), inferenceInput, new AbortController().signal),
  ).toEqual({
    text: '{"ok":true}',
    origin: 'https://cloud.example.test',
    provider: 'hugging-face',
    execution: 'cloud-service',
  });
});

it.each([
  'unrelated=not-a-session; HttpOnly',
  'insightos_session=short; HttpOnly',
  'insightos_session=first-session-id; HttpOnly, insightos_session=second-session-id; HttpOnly',
])(
  'does not send inference through a missing, unsafe or ambiguous cloud session: %s',
  async (cookie) => {
    const fetch = vi.fn(async () => new Response('{}', { headers: { 'set-cookie': cookie } }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      cloudInference(cloudConfig(), inferenceInput, new AbortController().signal),
    ).rejects.toThrow('Cloud AI did not return a valid session.');
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it.each([
  { text: '{"ok":true}' },
  { text: 'local starter', provider: 'local', execution: 'cloud-service' },
  { text: '{"ok":true}', provider: 'hugging-face', execution: 'local' },
  { text: ' ', provider: 'hugging-face', execution: 'cloud-service' },
])('rejects missing or false cloud provenance: %j', async (body) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      String(url).endsWith('/session') ? sessionResponse() : new Response(JSON.stringify(body)),
    ),
  );
  await expect(
    cloudInference(cloudConfig(), inferenceInput, new AbortController().signal),
  ).rejects.toThrow('missing inference provenance');
});

it('does not leak a failed provider response or substitute local inference', async () => {
  const fetch = vi.fn(async (url) =>
    String(url).endsWith('/session')
      ? sessionResponse()
      : new Response('provider-private-key-or-message', { status: 502 }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(
    cloudInference(cloudConfig(), inferenceInput, new AbortController().signal),
  ).rejects.toThrow('Cloud AI request failed (HTTP 502). No local fallback was substituted.');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('reports a malformed cloud response without returning its body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      String(url).endsWith('/session') ? sessionResponse() : new Response('private malformed text'),
    ),
  );
  await expect(
    cloudInference(cloudConfig(), inferenceInput, new AbortController().signal),
  ).rejects.toThrow('Cloud AI returned an invalid response.');
});

function verificationTransport(
  options: {
    local?: boolean;
    unauthorizedStatus?: number;
    mismatch?: boolean;
  } = {},
) {
  const fetch = vi.fn(async (url, request: RequestInit = {}) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/health') return Response.json({ ok: true, service: 'insightos' });
    if (pathname === '/api/status')
      return Response.json({
        hosted: true,
        sessionRequired: true,
        computer: { local: options.local ?? false, visionModel: 'public-vision-model' },
        integrations: { huggingFace: { configured: true, model: 'public-text-model' } },
      });
    if (pathname === '/api/session') return sessionResponse();
    if (pathname === '/api/agent/infer') {
      const headers = request.headers as Record<string, string>;
      if (!headers.Cookie) return new Response('{}', { status: options.unauthorizedStatus ?? 401 });
      const input = JSON.parse(String(request.body));
      return Response.json({
        provider: 'hugging-face',
        execution: 'cloud-service',
        text: JSON.stringify(
          input.vision
            ? { digit: 7 }
            : {
                challenge: options.mismatch ? 'an-old-response' : input.content.challenge,
                answer: input.content.left + input.content.right,
              },
        ),
      });
    }
    throw new Error('Unexpected cloud test request');
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

it('verifies a real request chain without treating an unknown host as Vultr', async () => {
  const fetch = verificationTransport();
  const receipt = await verifyCloudInference(cloudConfig());
  expect(receipt).toMatchObject({
    health: true,
    unauthenticatedInferenceHttp: 401,
    authenticatedInference: true,
    freshChallengeMatched: true,
    provider: 'hugging-face',
    execution: 'cloud-service',
    desktopExecution: 'local-only',
    visionInference: null,
    hostingProvider: 'unverified',
  });
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(JSON.stringify(receipt)).not.toContain('test-cloud-passphrase');
  expect(JSON.stringify(receipt)).not.toContain('valid-session-id');
  expect(JSON.stringify(receipt)).not.toContain('local-hf-credential');
});

it('can verify synthetic vision without uploading a user screenshot', async () => {
  const fetch = verificationTransport();
  const receipt = await verifyCloudInference(cloudConfig(), { vision: true });
  expect(receipt.visionInference).toBe(true);
  const visionRequest = fetch.mock.calls
    .map(([, request]) => request)
    .find((request) => {
      if (!request?.body) return false;
      return JSON.parse(String(request.body)).vision === true;
    });
  expect(JSON.parse(String(visionRequest?.body)).content[1].image_url.url).toMatch(
    /^data:image\/png;base64,/,
  );
});

it('fails verification before authentication if the server permits desktop execution', async () => {
  const fetch = verificationTransport({ local: true });
  await expect(verifyCloudInference(cloudConfig())).rejects.toThrow('desktop execution disabled');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('fails verification before authentication if anonymous inference is not rejected', async () => {
  const fetch = verificationTransport({ unauthorizedStatus: 200 });
  await expect(verifyCloudInference(cloudConfig())).rejects.toThrow('HTTP 401');
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('rejects a cached or unrelated model answer that does not match the fresh challenge', async () => {
  verificationTransport({ mismatch: true });
  await expect(verifyCloudInference(cloudConfig())).rejects.toThrow(
    'fresh, synthetic inference challenge',
  );
});
it('requires authentication for the deployed inference endpoint and cannot expose desktop execution', async () => {
  const cfg = {
    ...config(),
    host: '0.0.0.0',
    passphrase: 'test-cloud-passphrase',
    hfToken: 'test-hf-key',
    cloudUrl: '',
    neonUrl: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-cloud-')),
  };
  const app = await buildApp(cfg);
  try {
    const payload = { system: 'Return JSON', content: 'Hello', vision: false, json: true };
    expect(
      (await app.inject({ method: 'POST', url: '/api/agent/infer', payload })).statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { passphrase: cfg.passphrase },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })),
      ),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/infer',
      headers: { cookie },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().provider).toBe('hugging-face');
    const desktop = await app.inject({
      method: 'POST',
      url: '/api/computer/request',
      headers: { cookie },
      payload: { request: 'Open Calculator' },
    });
    expect(desktop.statusCode).not.toBe(200);
  } finally {
    await app.close();
  }
});
