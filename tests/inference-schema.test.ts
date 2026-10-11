import { afterEach, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import { buildApp } from '../server/app';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PRESENTATION_INTENT_SYSTEM } from '../server/computer/presentation-intent';

afterEach(() => vi.unstubAllGlobals());
const outputSchema = {
  name: 'BoundedCopy',
  schema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 240 } }, required: ['text'], additionalProperties: false },
};
const cfg = () => ({ ...config(), hfToken: 'test-only', hfEndpoint: 'https://router.huggingface.co/v1/chat/completions', cloudUrl: '', cloudPassphrase: '' });

it('enforces the same response contract through direct HF and the authenticated cloud service', async () => {
  const requests: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"text":"A preserved idea."}' } }] }));
  }));
  await chat(cfg(), 'Edit the text', 'Original text', new AbortController().signal, undefined, true, 500, outputSchema);
  const local = requests[0];
  expect(local.response_format).toEqual({ type: 'json_schema', json_schema: { ...outputSchema, strict: true } });
  const app = await buildApp({ ...cfg(), host: '0.0.0.0', passphrase: 'structured-output-test', neonUrl: '', localDir: await mkdtemp(path.join(tmpdir(), 'insight-schema-')) });
  try {
    // The real interpreter prompt must fit the deployed service's request boundary too.
    const payload = { system: PRESENTATION_INTENT_SYSTEM, content: 'Original text', vision: false, json: true, maxTokens: 4500, outputSchema };
    expect((await app.inject({ method: 'POST', url: '/api/agent/infer', payload })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/session', payload: { passphrase: 'structured-output-test' } });
    const response = await app.inject({ method: 'POST', url: '/api/agent/infer', headers: { cookie: String(login.headers['set-cookie']).split(';')[0] }, payload });
    expect(response.statusCode).toBe(200);
    expect(requests[1].response_format).toEqual(local.response_format);
    expect(requests[1].messages[0].content).toBe(PRESENTATION_INTENT_SYSTEM);
    expect(requests[1].max_tokens).toBe(4500);
    expect(response.json().text).toBe('{"text":"A preserved idea."}');
    const grounding = await app.inject({ method: 'POST', url: '/api/agent/infer', headers: { cookie: String(login.headers['set-cookie']).split(';')[0] }, payload: { ...payload, maxTokens: 350 } });
    expect(grounding.statusCode).toBe(200);
    expect(requests.at(-1).max_tokens).toBe(350);
  } finally { await app.close(); }
});

it('forwards the contract through a configured cloud origin without forwarding a local credential', async () => {
  const requests: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    requests.push(JSON.parse(init.body));
    return String(url).endsWith('/api/session')
      ? new Response('{}', { headers: { 'set-cookie': 'insightos_session=valid-test-session; HttpOnly; Secure' } })
      : new Response(JSON.stringify({ text: '{"text":"A preserved idea."}', provider: 'hugging-face', execution: 'cloud-service' }));
  }));
  await chat({ ...cfg(), cloudUrl: 'https://owned.example.test', cloudPassphrase: 'structured-output-test' }, 'Edit', 'Original', new AbortController().signal, undefined, true, 500, outputSchema);
  expect(requests[1].outputSchema).toEqual(outputSchema);
  expect(JSON.stringify(requests)).not.toContain('test-only');
});

it('rejects invalid output contracts before sending and never silently downgrades a provider rejection', async () => {
  const fetcher = vi.fn(async () => new Response('{"error":"unsupported"}', { status: 400 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(chat(cfg(), 'Edit', 'Source', new AbortController().signal, undefined, false, 500, outputSchema)).rejects.toThrow('JSON mode');
  await expect(chat(cfg(), 'Edit', 'Source', new AbortController().signal, undefined, true, 500, { name: 'Copy', schema: { type: 'array' } })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(chat(cfg(), 'Edit', 'Source', new AbortController().signal, undefined, true, 500, outputSchema)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
