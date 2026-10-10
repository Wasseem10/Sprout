import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { cloudInference } from '../server/providers/cloudInference';
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
        : new Response(JSON.stringify({ text: '{"decision":"ask"}' }));
    }),
  );
  const result = await cloudInference(
    {
      ...config(),
      cloudUrl: 'https://cloud.example.test',
      cloudPassphrase: 'test-passphrase',
      hfToken: 'local-secret',
    },
    { system: 'Plan the task', content: 'Open a page', vision: false, json: true },
    new AbortController().signal,
  );
  expect(result).toContain('ask');
  expect(calls[1].url).toBe('https://cloud.example.test/api/agent/infer');
  expect(calls[1].options.headers).toMatchObject({ Cookie: 'insightos_session=session-id' });
  expect(JSON.stringify(calls)).not.toContain('local-secret');
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
