import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  workspaceSchema,
  datasetSchema,
  comparisonSchema,
  resultSchema,
  projectSchema,
} from '../shared/schema.js';
import {
  parseCsv,
  datasetVersion,
  defaultComparison,
  analyzeLocal,
  validateDataset,
} from '../shared/analysis.js';
import { config, type Config } from './config.js';
import { samplePlan, livePlan } from './providers/planner.js';
import { Databricks } from './providers/databricks.js';
import { Storage } from './providers/storage.js';
import { fetchJson } from './providers/http.js';
import { ComputerController } from './computer/controller.js';
import { computerActionSchema } from '../shared/computer.js';
import { Connections } from './connections.js';
import { connectionSettingsSchema, providerSchema } from '../shared/connections.js';
import { chat } from './computer/planner.js';

export async function buildApp(cfg: Config = config()) {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const db = new Databricks(cfg),
    storage = new Storage(cfg);
  await mkdir(cfg.localDir, { recursive: true });
  const computer = new ComputerController(cfg);
  await computer.init();
  const connections = new Connections(cfg);
  const activeRequests = new Set<object>();
  app.addHook('onClose', async () => computer.close());
  const keyPath = path.join(cfg.localDir, 'session-key');
  let secret: string;
  try {
    secret = await readFile(keyPath, 'utf8');
  } catch {
    secret = crypto.randomUUID() + crypto.randomUUID();
    await writeFile(keyPath, secret, { mode: 0o600 });
  }
  const sessionValue = secret;
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (
      req.url.startsWith('/api') &&
      ((origin && !cfg.origins.includes(origin)) || req.headers['sec-fetch-site'] === 'cross-site')
    )
      return reply.code(403).send({ error: 'Request origin is not allowed.' });
    if (
      req.url.startsWith('/api') &&
      !['/api/session', '/api/status'].includes(req.url) &&
      req.cookies.insightos_session !== sessionValue
    )
      return reply.code(401).send({ error: 'Open or unlock your InsightOS session first.' });
    if (
      req.url.startsWith('/api/') &&
      !['/api/session', '/api/status'].includes(req.url) &&
      !req.url.startsWith('/api/connections')
    ) {
      if (connections.busy && req.url !== '/api/computer/stop')
        return reply
          .code(409)
          .send({ error: 'Connection check is running. Wait or cancel first.' });
      activeRequests.add(req);
    }
  });
  app.addHook('onResponse', async (req) => {
    activeRequests.delete(req);
  });
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { code?: string; statusCode?: number };
    if (e.name === 'AbortError') return reply.code(409).send({ error: 'Task stopped.' });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ error: e.issues[0]?.message ?? 'Invalid request.' });
    // Never return provider response bodies, SQL credentials, stack traces or URLs containing tokens.
    const known =
      e.message.startsWith('Provider request failed') ||
      e.message.startsWith('Databricks') ||
      e.message.startsWith('Live ') ||
      e.message.startsWith('CSV ') ||
      e.message.startsWith('Row ') ||
      e.message.startsWith('Invalid ') ||
      e.message.startsWith('Duplicate ') ||
      e.message.startsWith('Conflicting ') ||
      e.message.startsWith('Inconsistent ') ||
      e.message.startsWith('Include data') ||
      e.message.startsWith('The open model') ||
      e.message.startsWith('Saved project') ||
      e.message.startsWith('Project ownership') ||
      e.message.startsWith('Voice ');
    const connectionError = e.message.startsWith('Connection ');
    const computerError = e.message.startsWith('Computer ');
    return reply
      .code(e.statusCode ?? (known || computerError || connectionError ? 400 : 500))
      .send({
        error:
          known || computerError || connectionError
            ? e.message
            : 'The task could not complete. Check provider access or try again.',
      });
  });
  const taskSignal = (req: any, reply: any) => {
    const controller = new AbortController();
    req.raw.once('aborted', () => controller.abort());
    reply.raw.once('close', () => {
      if (!reply.raw.writableEnded) controller.abort();
    });
    return controller.signal;
  };
  app.get('/health', async () => ({ ok: true, service: 'insightos' }));
  app.post('/api/agent/infer', async (req, reply) => {
    const body = z
      .object({
        system: z.string().min(1).max(16000),
        content: z.unknown(),
        vision: z.boolean(),
        json: z.boolean(),
      })
      .strict()
      .parse(req.body);
    if (JSON.stringify(body.content)?.length > 6 * 1024 * 1024)
      throw new Error('Cloud context is too large.');
    // This authenticated service performs inference only; never remote desktop actions.
    const text = await chat(
      { ...cfg, cloudUrl: '', cloudPassphrase: '' },
      body.system,
      body.content,
      taskSignal(req, reply),
      body.vision ? cfg.hfVisionModel : cfg.hfModel,
      body.json,
    );
    return { text, provider: 'hugging-face', execution: 'cloud-service' };
  });
  app.get('/api/connections', async () => connections.snapshot());
  const connectionIdle = () => {
    if (activeRequests.size)
      throw Object.assign(
        new Error('Connection settings cannot change during a task. Wait or stop the task first.'),
        { statusCode: 409 },
      );
  };
  app.post('/api/connections', async (req) => {
    connectionIdle();
    return connections.save(connectionSettingsSchema.parse(req.body));
  });
  app.post('/api/connections/verify', async (req, reply) => {
    connectionIdle();
    const { provider } = z.object({ provider: providerSchema }).strict().parse(req.body);
    return connections.verify(provider, taskSignal(req, reply));
  });
  app.get('/api/status', async (req) => ({
    mode: cfg.mode,
    hosted: !['127.0.0.1', 'localhost', '::1'].includes(cfg.host),
    sessionRequired: !!cfg.passphrase,
    authenticated: req.cookies.insightos_session === sessionValue,
    computer: {
      local: ['127.0.0.1', 'localhost', '::1'].includes(cfg.host),
      pythonConfigured: !!cfg.pythonBin,
      editorConfigured: !!cfg.codeBin,
      visionModel: cfg.hfVisionModel,
    },
    integrations: {
      huggingFace: {
        configured: !!cfg.hfToken || !!(cfg.cloudUrl && cfg.cloudPassphrase),
        model: cfg.hfModel,
      },
      databricks: { configured: !!(cfg.dbHost && cfg.dbWarehouse && cfg.dbToken) },
      elevenLabs: {
        configured: !!cfg.elevenKey,
        ttsConfigured: !!(cfg.elevenKey && cfg.elevenVoice),
      },
      neon: { configured: !!cfg.neonUrl },
      vultr: { configured: !!(cfg.cloudUrl && cfg.cloudPassphrase) },
    },
    storage: storage.provider,
  }));
  let failedLogins = 0,
    lastFailure = 0;
  app.post('/api/session', async (req, reply) => {
    const body = z.object({ passphrase: z.string().max(1000).optional() }).parse(req.body ?? {});
    if (failedLogins >= 10 && Date.now() - lastFailure < 60000)
      return reply.code(429).send({ error: 'Too many unlock attempts. Wait one minute.' });
    const supplied = Buffer.from(body.passphrase ?? ''),
      expected = Buffer.from(cfg.passphrase);
    if (
      cfg.passphrase &&
      (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    ) {
      failedLogins++;
      lastFailure = Date.now();
      return reply.code(401).send({ error: 'Incorrect session passphrase.' });
    }
    failedLogins = 0;
    reply.setCookie('insightos_session', sessionValue, {
      httpOnly: true,
      sameSite: 'strict',
      secure: !['127.0.0.1', 'localhost', '::1'].includes(cfg.host),
      path: '/',
      maxAge: 86400,
    });
    return { ok: true };
  });
  app.get('/api/sample', async () => {
    const text = await readFile(path.resolve('data/operations-synthetic.csv'), 'utf8');
    const dataset = parseCsv(text, 'Operations · synthetic sample', true);
    return { dataset, comparison: defaultComparison(dataset) };
  });
  app.get('/api/computer/state', async () => computer.snapshot());
  app.post('/api/computer/demo-folder', async () => computer.demoFolder());
  app.post('/api/computer/authorize-folder', async (req) => {
    const body = z
      .object({ folder: z.string().max(2000) })
      .strict()
      .parse(req.body);
    return computer.authorizeFolder(
      body.folder,
      String(req.headers['x-insightos-desktop-key'] ?? ''),
    );
  });
  app.post('/api/computer/screen', async (req) => {
    const body = z
      .object({ name: z.string().min(1).max(200), image: z.string().max(5 * 1024 * 1024) })
      .strict()
      .parse(req.body);
    return computer.selectScreen(body.name, body.image);
  });
  app.post('/api/computer/clear-screen', async () => computer.clearScreen());
  app.post('/api/computer/action', async (req, reply) =>
    computer.action(computerActionSchema.parse(req.body), taskSignal(req, reply)),
  );
  app.post('/api/computer/request', async (req, reply) => {
    const body = z
      .object({ request: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(req.body);
    return computer.request(body.request, taskSignal(req, reply));
  });
  app.post('/api/computer/stop', async () => computer.stop());
  app.post('/api/computer/interrupt', async () => computer.interrupt());
  app.post('/api/import', async (req) => {
    const body = z
      .object({ name: z.string().min(1).max(160), text: z.string().max(1024 * 1024) })
      .strict()
      .parse(req.body);
    const dataset = parseCsv(body.text, body.name);
    // Recognize the supplied fixture by its actual contents, not the selected filename.
    const fixture = parseCsv(
      await readFile(path.resolve('data/operations-synthetic.csv'), 'utf8'),
      'Synthetic fixture',
      true,
    );
    dataset.synthetic = datasetVersion(dataset) === datasetVersion(fixture);
    return { dataset, comparison: defaultComparison(dataset) };
  });
  app.post('/api/plan', async (req, reply) => {
    const body = z
      .object({ request: z.string().trim().min(1).max(2000), state: workspaceSchema })
      .strict()
      .parse(req.body);
    if (body.state.dataset) validateDataset(body.state.dataset);
    const signal = taskSignal(req, reply);
    return {
      plan:
        cfg.mode === 'live'
          ? await livePlan(body.request, body.state, cfg, signal)
          : samplePlan(body.request, body.state),
      provider: cfg.mode === 'live' ? 'hugging-face' : 'local-development-planner',
    };
  });
  app.post('/api/analyze', async (req, reply) => {
    const body = z
      .object({ dataset: datasetSchema, comparison: comparisonSchema })
      .strict()
      .parse(req.body);
    const signal = taskSignal(req, reply);
    validateDataset(body.dataset);
    const result =
      cfg.mode === 'live'
        ? await db.analyze(body.dataset, body.comparison, signal)
        : analyzeLocal(body.dataset, body.comparison);
    return { result: resultSchema.parse(result) };
  });
  app.get('/api/projects', async () => ({
    projects: await storage.list(),
    provider: storage.provider,
  }));
  app.post('/api/projects', async (req, reply) => {
    const body = projectSchema.parse(req.body);
    if (body.state.dataset) validateDataset(body.state.dataset);
    return storage.save(body, taskSignal(req, reply));
  });
  app.get('/api/projects/:id', async (req, reply) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const project = await storage.load(id, taskSignal(req, reply));
    if (project.state.dataset) validateDataset(project.state.dataset);
    return { project, provider: storage.provider };
  });
  app.post('/api/voice/transcribe', async (req, reply) => {
    if (!cfg.elevenKey)
      throw new Error('Voice input needs ELEVENLABS_API_KEY in the backend .env.');
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Attach one microphone recording.' });
    if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'].includes(file.mimetype))
      return reply.code(400).send({ error: 'Unsupported recording format.' });
    const buffer = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: 'Recording exceeds 5 MB.' });
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: file.mimetype }), file.filename);
    form.append('model_id', 'scribe_v1');
    form.append('tag_audio_events', 'false');
    form.append('diarize', 'false');
    const result = await fetchJson('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': cfg.elevenKey },
      body: form,
      signal: taskSignal(req, reply),
    });
    return { text: z.string().max(2000).parse(result.text), provider: 'elevenlabs' };
  });
  app.post('/api/voice/realtime-token', async () => {
    if (!cfg.elevenKey)
      throw new Error('Voice input needs ELEVENLABS_API_KEY in the backend .env.');
    const result = await fetchJson(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: { 'xi-api-key': cfg.elevenKey },
        signal: AbortSignal.timeout(15000),
      },
    );
    return { token: z.string().min(10).max(1000).parse(result.token) };
  });
  app.post('/api/voice/speak', async (req, reply) => {
    if (!cfg.elevenKey || !cfg.elevenVoice)
      throw new Error('Voice output needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.');
    const body = z
      .object({ text: z.string().min(1).max(3000) })
      .strict()
      .parse(req.body);
    if (!/^[a-zA-Z0-9_-]+$/.test(cfg.elevenVoice)) throw new Error('Voice ID is invalid.');
    const signal = AbortSignal.any([taskSignal(req, reply), AbortSignal.timeout(45000)]);
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${cfg.elevenVoice}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': cfg.elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body.text, model_id: cfg.elevenTtsModel }),
        signal,
      },
    );
    if (!response.ok) throw new Error(`Provider request failed (HTTP ${response.status}).`);
    return reply.type('audio/mpeg').send(Buffer.from(await response.arrayBuffer()));
  });
  try {
    await access(path.resolve('dist/index.html'));
    await app.register(staticPlugin, { root: path.resolve('dist') });
    app.addHook('onSend', async (req, reply, payload) => {
      if (!req.url.startsWith('/api'))
        reply.header(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' wss://api.elevenlabs.io; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
        );
      return payload;
    });
  } catch {
    /* Development UI is served by Vite. */
  }
  return app;
}
