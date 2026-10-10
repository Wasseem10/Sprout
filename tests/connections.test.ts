import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { parse } from 'dotenv';
import { config } from '../server/config';
import { Connections } from '../server/connections';
import { buildApp } from '../server/app';
const dirs: string[] = [];
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insightos-connections-'));
  dirs.push(localDir);
  const cfg = {
    ...config(),
    localDir,
    envFile: path.join(localDir, '.env'),
    host: '127.0.0.1',
    mode: 'sample' as const,
    passphrase: '',
    hfToken: '',
    elevenKey: '',
    elevenVoice: '',
    neonUrl: '',
    dbHost: '',
    dbWarehouse: '',
    dbToken: '',
    cloudUrl: '',
    cloudPassphrase: '',
  };
  return { cfg, connections: new Connections(cfg) };
}
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const inference = (content: unknown) =>
  json({
    choices: [
      { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } },
    ],
  });
it('releases the settings lock when a client cancels a pending API response', async () => {
  const { cfg } = await fixture();
  const app = await buildApp(cfg);
  apps.push(app);
  let started!: () => void, closed!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const disconnected = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  app.post('/api/test-stalled', async (_req, reply) => {
    reply.raw.once('close', closed);
    started();
    await pending;
    return { ok: true };
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const session = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
  const cookie = session.headers['set-cookie']!.toString().split(';')[0];
  const client = httpRequest(origin + '/api/test-stalled', {
    method: 'POST',
    headers: { cookie },
  });
  client.on('error', () => {});
  client.end();
  try {
    await ready;
    client.destroy();
    await disconnected;
    const saved = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers: { cookie },
      payload: { DATABRICKS_WAREHOUSE_ID: 'warehouse-fixture' },
    });
    expect(saved.statusCode).toBe(200);
    expect(cfg.dbWarehouse).toBe('warehouse-fixture');
  } finally {
    client.destroy();
    release();
  }
});
it('saves an HTTPS cloud connection privately and verifies authenticated inference', async () => {
  const { cfg, connections } = await fixture();
  await expect(connections.save({ INSIGHTOS_CLOUD_URL: 'http://example.com' })).rejects.toThrow();
  await expect(
    connections.save({ INSIGHTOS_CLOUD_URL: 'https://example.com/api' }),
  ).rejects.toThrow();
  await connections.save({
    INSIGHTOS_CLOUD_URL: 'https://insight.example.com',
    INSIGHTOS_CLOUD_PASSPHRASE: 'private-cloud-passphrase',
  });
  expect(connections.snapshot().configured.vultr).toBe(true);
  expect(JSON.stringify(connections.snapshot())).not.toContain('private-cloud-passphrase');
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{}', {
        headers: { 'set-cookie': 'insightos_session=fixture-session; HttpOnly' },
      }),
    )
    .mockResolvedValueOnce(json({ text: '{"ready":true}' }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await connections.verify('vultr', new AbortController().signal);
  expect(result.reports.vultr?.checks[0].status).toBe('passed');
  expect(fetchMock.mock.calls[1][1].headers.Cookie).toBe('insightos_session=fixture-session');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ vision: false, json: true });
  expect(JSON.stringify(result)).not.toContain('private-cloud-passphrase');
});
it('saves whitelisted settings atomically, preserving existing paths and secrets without returning keys', async () => {
  const { cfg, connections } = await fixture();
  await writeFile(
    cfg.envFile,
    '# keep comment\nPYTHON_BIN="C:/Some Path/python.exe"\nSESSION_PASSPHRASE=private\nHF_TOKEN=old\nHF_TOKEN=duplicate\n',
  );
  const result = await connections.save({
    HF_TOKEN: 'hf_private#token',
    ELEVENLABS_API_KEY: 'eleven_private',
    DATABASE_URL: 'postgresql://pilot:p%23ss@ep-demo.neon.tech/main?sslmode=require',
  });
  const text = await readFile(cfg.envFile, 'utf8'),
    parsed = parse(text);
  expect(text.match(/^HF_TOKEN=/gm)).toHaveLength(1);
  expect(parsed.PYTHON_BIN).toBe('C:/Some Path/python.exe');
  expect(parsed.SESSION_PASSPHRASE).toBe('private');
  expect(parsed.HF_TOKEN).toBe(cfg.hfToken);
  expect(parsed.DATABASE_URL).toBe(cfg.neonUrl);
  expect(text).toContain('# keep comment');
  expect(result.configured).toMatchObject({ huggingFace: true, elevenLabs: true, neon: true });
  expect(JSON.stringify(result)).not.toContain('hf_private');
  expect(JSON.stringify(result)).not.toContain('p%23ss');
  expect(
    new Connections({ ...cfg, hfToken: parsed.HF_TOKEN }).snapshot().configured.huggingFace,
  ).toBe(true);
});
it('rejects env injection and unsupported fields without changing configuration or the file', async () => {
  const { cfg, connections } = await fixture();
  await writeFile(cfg.envFile, 'PYTHON_BIN=keep\n');
  await expect(connections.save({ HF_TOKEN: 'token\nHOST=0.0.0.0' })).rejects.toThrow(
    'single-line',
  );
  await expect(connections.save({ HOST: '0.0.0.0' } as any)).rejects.toThrow();
  await expect(connections.save({ APP_MODE: 'live' })).rejects.toThrow('needs Hugging Face');
  expect(await readFile(cfg.envFile, 'utf8')).toBe('PYTHON_BIN=keep\n');
  expect(cfg.hfToken).toBe('');
  await writeFile(cfg.envFile, 'HF_TOKEN="old\nsecret"\nPYTHON_BIN=keep\n');
  await expect(connections.save({ HF_TOKEN: 'replacement' })).rejects.toThrow('multiline');
});
it('requires session, rejects cross-origin writes, and denies hosted editing', async () => {
  const { cfg } = await fixture();
  const app = await buildApp(cfg);
  apps.push(app);
  expect((await app.inject({ url: '/api/connections' })).statusCode).toBe(401);
  const session = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
  const cookie = session.headers['set-cookie']!.toString().split(';')[0];
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        headers: { cookie, origin: 'https://untrusted.example' },
        payload: { HF_TOKEN: 'private' },
      })
    ).statusCode,
  ).toBe(403);
  const saved = await app.inject({
    method: 'POST',
    url: '/api/connections',
    headers: { cookie },
    payload: { HF_TOKEN: 'private' },
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.body).not.toContain('private');
  expect(
    (await app.inject({ url: '/api/status' })).json().integrations.huggingFace.configured,
  ).toBe(true);
  const hosted = new Connections({ ...cfg, host: '0.0.0.0' });
  await expect(hosted.save({ HF_TOKEN: 'replacement' })).rejects.toMatchObject({ statusCode: 403 });
  expect(cfg.hfToken).toBe('private');
});
it('tests actual model requests independently, redacts provider errors and invalidates checks after replacement', async () => {
  const { cfg, connections } = await fixture();
  await connections.save({ HF_TOKEN: 'hf_private' });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      inference({ action: { tool: 'createCode', request: 'Fibonacci' }, clarification: null }),
    )
    .mockResolvedValueOnce(inference({ filename: 'fib.py', code: 'print(1)' }))
    .mockResolvedValueOnce(new Response('hf_private from provider', { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await connections.verify('huggingFace', new AbortController().signal);
  expect(result.reports.huggingFace?.checks.map((check) => check.status)).toEqual([
    'passed',
    'failed',
  ]);
  expect(JSON.stringify(result)).not.toContain('hf_private');
  expect(result.reports.huggingFace?.checks[1].detail).toContain('HTTP 401');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const vision = JSON.parse(fetchMock.mock.calls[2][1].body);
  expect(vision.model).toBe(cfg.hfVisionModel);
  expect(vision.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  await connections.save({ HF_MODEL_ID: 'another/model' });
  expect(connections.snapshot().reports.huggingFace).toBeUndefined();
});
it('selects a real account voice and verifies TTS-to-Scribe round trip without returning transcript or key', async () => {
  const { cfg, connections } = await fixture();
  await connections.save({ ELEVENLABS_API_KEY: 'eleven_private' });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        voices: [
          { voice_id: 'paidLibraryVoice', category: 'professional' },
          { voice_id: 'accountVoice42', category: 'premade' },
        ],
      }),
    )
    .mockResolvedValueOnce(
      new Response(new Uint8Array(512), { headers: { 'Content-Type': 'audio/mpeg' } }),
    )
    .mockResolvedValueOnce(json({ text: 'Insight OS is ready to help you use your computer.' }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await connections.verify('elevenLabs', new AbortController().signal);
  expect(result.reports.elevenLabs?.checks[0].status).toBe('passed');
  expect(cfg.elevenVoice).toBe('accountVoice42');
  expect(parse(await readFile(cfg.envFile, 'utf8')).ELEVENLABS_VOICE_ID).toBe('accountVoice42');
  expect(fetchMock.mock.calls[1][0]).toContain('/accountVoice42?');
  expect(fetchMock.mock.calls[2][1].body).toBeInstanceOf(FormData);
  expect(JSON.stringify(result)).not.toContain('eleven_private');
});
it('serializes saves against verification and stops checks when canceled', async () => {
  const { cfg, connections } = await fixture();
  await connections.save({ HF_TOKEN: 'existing' });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        ),
    ),
  );
  const controller = new AbortController(),
    pending = connections.verify('huggingFace', controller.signal);
  await expect(connections.save({ HF_TOKEN: 'replacement' })).rejects.toMatchObject({
    statusCode: 409,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(cfg.hfToken).toBe('existing');
  expect(connections.busy).toBe(false);
  expect(connections.snapshot().reports.huggingFace).toBeUndefined();
});
it('prevents configuration changes while a real API task is in progress', async () => {
  const { cfg } = await fixture();
  cfg.elevenKey = 'test-key';
  cfg.elevenVoice = 'testVoice';
  const app = await buildApp(cfg);
  apps.push(app);
  const session = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
  const cookie = session.headers['set-cookie']!.toString().split(';')[0];
  let release!: () => void, started!: () => void;
  const outboundStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      started();
      return new Promise<Response>((resolve) => {
        release = () => resolve(new Response('private error body', { status: 401 }));
      });
    }),
  );
  const task = app
    .inject({
      method: 'POST',
      url: '/api/voice/speak',
      headers: { cookie },
      payload: { text: 'Test connection concurrency.' },
    })
    .then((result) => result);
  await outboundStarted;
  const saved = await app.inject({
    method: 'POST',
    url: '/api/connections',
    headers: { cookie },
    payload: { HF_TOKEN: 'replacement' },
  });
  expect(saved.statusCode).toBe(409);
  expect(cfg.hfToken).toBe('');
  release();
  expect((await task).body).not.toContain('private error body');
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        headers: { cookie },
        payload: { HF_TOKEN: 'replacement' },
      })
    ).statusCode,
  ).toBe(200);
});
