import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import { buildApp } from '../server/app';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const cfg = () => ({ ...config(), hfToken: 'test-only', hfModel: 'configured-intent-model',
  hfWritingModel: '', hfWritingReasoningEffort: undefined, hfWritingReviewEnabled: false,
  hfEndpoint: 'https://router.huggingface.co/v1/chat/completions', cloudUrl: '', cloudPassphrase: '' });
const response = () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });

it('keeps the existing default and isolates writing model and reasoning settings from ordinary inference', async () => {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { bodies.push(JSON.parse(init.body)); return response(); }));
  const writing = { ...cfg(), hfWritingModel: 'configured-writing-model', hfWritingReasoningEffort: 'none' as const };
  await chat(writing, 'Interpret', 'Turn', new AbortController().signal);
  await chat(writing, 'Edit', 'Source', new AbortController().signal, undefined, true, 8192, undefined, { purpose: 'writing' });
  await chat(cfg(), 'Edit', 'Source', new AbortController().signal, undefined, true, 500, undefined, { purpose: 'writing' });
  expect(bodies[0].model).toBe('configured-intent-model');
  expect(bodies[0]).not.toHaveProperty('reasoning_effort');
  expect(bodies[1]).toMatchObject({ model: 'configured-writing-model', reasoning_effort: 'none', max_tokens: 8192 });
  expect(bodies[2].model).toBe('configured-intent-model');
  expect(bodies[2]).not.toHaveProperty('reasoning_effort');
});

it('uses the same configured writing settings on the authenticated hosted boundary and rejects arbitrary model/settings', async () => {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { bodies.push(JSON.parse(init.body)); return response(); }));
  const writing = { ...cfg(), hfWritingModel: 'configured-writing-model', hfWritingReasoningEffort: 'none' as const };
  await chat(writing, 'Edit', 'Source', new AbortController().signal, undefined, true, 8192, undefined, { purpose: 'writing' });
  const direct = bodies[0];
  const app = await buildApp({ ...writing, host: '0.0.0.0', passphrase: 'writing-route-test-passphrase', neonUrl: '', localDir: await mkdtemp(path.join(tmpdir(), 'insight-writing-')) });
  try {
    const payload = { system: 'Edit', content: 'Source', vision: false, json: true, maxTokens: 8192, purpose: 'writing' };
    expect((await app.inject({ method: 'POST', url: '/api/agent/infer', payload })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/session', payload: { passphrase: 'writing-route-test-passphrase' } });
    const headers = { cookie: String(login.headers['set-cookie']).split(';')[0] };
    const result = await app.inject({ method: 'POST', url: '/api/agent/infer', headers, payload });
    expect(result.statusCode).toBe(200);
    expect(bodies[1]).toEqual(direct);
    for (const change of [{ model: 'client-chosen-model' }, { reasoning_effort: 'high' }, { purpose: 'unbounded' }, { vision: true }, { maxTokens: 8193 }]) {
      expect((await app.inject({ method: 'POST', url: '/api/agent/infer', headers, payload: { ...payload, ...change } })).statusCode).not.toBe(200);
    }
    expect(bodies).toHaveLength(2);
  } finally { await app.close(); }
});

it('forwards writing purpose through the cloud without forwarding a laptop model, reasoning setting or credential', async () => {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return String(url).endsWith('/session')
      ? new Response('{}', { headers: { 'set-cookie': 'insightos_session=valid-writing-session; HttpOnly; Secure' } })
      : Response.json({ text: '{"ok":true}', provider: 'hugging-face', execution: 'cloud-service' });
  }));
  await chat({ ...cfg(), hfWritingModel: 'laptop-only-writing-model', hfWritingReasoningEffort: 'none', cloudUrl: 'https://owned.example.test', cloudPassphrase: 'writing-cloud-test-passphrase' },
    'Edit', 'Source', new AbortController().signal, undefined, true, 8192, undefined, { purpose: 'writing' });
  expect(bodies[1]).toMatchObject({ purpose: 'writing', vision: false, maxTokens: 8192 });
  expect(bodies[1]).not.toHaveProperty('model');
  expect(bodies[1]).not.toHaveProperty('reasoning_effort');
  expect(JSON.stringify(bodies)).not.toContain('laptop-only-writing-model');
  expect(JSON.stringify(bodies)).not.toContain('test-only');
});

it('checks cancellation before sending and after a late successful provider reply', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(async () => { controller.abort(); return response(); });
  vi.stubGlobal('fetch', fetcher);
  await expect(chat(cfg(), 'Edit', 'Source', controller.signal, undefined, true, 8192, undefined, { purpose: 'writing' })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(chat(cfg(), 'Edit', 'Source', controller.signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('validates optional environment values without changing the default model or enabling review implicitly', () => {
  vi.stubEnv('HF_WRITING_MODEL_ID', '');
  vi.stubEnv('HF_WRITING_REASONING_EFFORT', '');
  vi.stubEnv('HF_WRITING_REVIEW_ENABLED', '');
  expect(config()).toMatchObject({ hfWritingModel: '', hfWritingReasoningEffort: undefined, hfWritingReviewEnabled: false });
  vi.stubEnv('HF_WRITING_MODEL_ID', ' writer-model ');
  vi.stubEnv('HF_WRITING_REASONING_EFFORT', 'none');
  vi.stubEnv('HF_WRITING_REVIEW_ENABLED', 'true');
  expect(config()).toMatchObject({ hfWritingModel: 'writer-model', hfWritingReasoningEffort: 'none', hfWritingReviewEnabled: true });
  vi.stubEnv('HF_WRITING_REASONING_EFFORT', 'unknown');
  expect(() => config()).toThrow('HF_WRITING_REASONING_EFFORT');
  vi.stubEnv('HF_WRITING_REASONING_EFFORT', 'none');
  vi.stubEnv('HF_WRITING_REVIEW_ENABLED', 'perhaps');
  expect(() => config()).toThrow('HF_WRITING_REVIEW_ENABLED');
});

it('rejects an unbounded direct output request before fetching', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(chat(cfg(), 'Edit', 'Source', new AbortController().signal, undefined, true, 8193)).rejects.toThrow('8192');
  expect(fetcher).not.toHaveBeenCalled();
});
