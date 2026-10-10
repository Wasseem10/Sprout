import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { parse } from 'dotenv';
import type { Config } from './config.js';
import {
  connectionSettingsSchema,
  type ConnectionSettings,
  type ConnectionState,
  type Provider,
  type ConnectionReport,
} from '../shared/connections.js';
import { computerPlan, generateCode, chat } from './computer/planner.js';
import { Databricks } from './providers/databricks.js';
import { Storage } from './providers/storage.js';
import { fetchJson, secureUrl } from './providers/http.js';
import { parseCsv, defaultComparison } from '../shared/analysis.js';
import { emptyWorkspace, resultSchema } from '../shared/schema.js';

const fields = {
  HF_TOKEN: 'hfToken',
  HF_MODEL_ID: 'hfModel',
  HF_VISION_MODEL_ID: 'hfVisionModel',
  ELEVENLABS_API_KEY: 'elevenKey',
  ELEVENLABS_VOICE_ID: 'elevenVoice',
  DATABRICKS_HOST: 'dbHost',
  DATABRICKS_WAREHOUSE_ID: 'dbWarehouse',
  DATABRICKS_TOKEN: 'dbToken',
  DATABRICKS_CATALOG: 'dbCatalog',
  DATABRICKS_SCHEMA: 'dbSchema',
  DATABASE_URL: 'neonUrl',
  APP_MODE: 'mode',
} as const;
const local = (cfg: Config) => ['127.0.0.1', 'localhost', '::1'].includes(cfg.host);
// A synthetic two-color PNG. Verification never captures or uploads a user's screen.
function testImage() {
  const chunk = (name: string, body: Buffer) => {
    const data = Buffer.concat([Buffer.from(name), body]);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4),
      tail = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(64 * (64 * 3 + 1));
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) pixels[y * 193 + 1 + x * 3 + (y < 32 ? 0 : 2)] = 255;
  return (
    'data:image/png;base64,' +
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]).toString('base64')
  );
}
export class Connections {
  busy = false;
  private reports: ConnectionState['reports'] = {};
  constructor(private cfg: Config) {}
  snapshot(): ConnectionState {
    return {
      editable: local(this.cfg),
      defaults: {
        HF_MODEL_ID: this.cfg.hfModel,
        HF_VISION_MODEL_ID: this.cfg.hfVisionModel,
        ELEVENLABS_VOICE_ID: this.cfg.elevenVoice,
        DATABRICKS_HOST: (() => {
          try {
            return new URL(this.cfg.dbHost).origin;
          } catch {
            return '';
          }
        })(),
        DATABRICKS_WAREHOUSE_ID: this.cfg.dbWarehouse,
        DATABRICKS_CATALOG: this.cfg.dbCatalog,
        DATABRICKS_SCHEMA: this.cfg.dbSchema,
        APP_MODE: this.cfg.mode,
      },
      configured: {
        huggingFace: !!this.cfg.hfToken,
        elevenLabs: !!this.cfg.elevenKey,
        databricks: !!(this.cfg.dbHost && this.cfg.dbWarehouse && this.cfg.dbToken),
        neon: !!this.cfg.neonUrl,
      },
      reports: structuredClone(this.reports),
    };
  }
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (!local(this.cfg))
      throw Object.assign(new Error('Connection settings require the local app.'), {
        statusCode: 403,
      });
    if (this.busy)
      throw Object.assign(new Error('Connection check is running. Wait or cancel first.'), {
        statusCode: 409,
      });
    this.busy = true;
    try {
      return await run();
    } finally {
      this.busy = false;
    }
  }
  private async persist(input: ConnectionSettings) {
    const values = connectionSettingsSchema.parse(input);
    if (values.DATABRICKS_HOST) {
      let url: URL;
      try {
        url = secureUrl(values.DATABRICKS_HOST);
      } catch {
        throw new Error('Connection workspace host must be an HTTPS origin.');
      }
      if (url.pathname !== '/')
        throw new Error('Connection workspace host must be an HTTPS origin.');
      values.DATABRICKS_HOST = url.origin;
    }
    if (values.ELEVENLABS_VOICE_ID && !/^[a-zA-Z0-9_-]+$/.test(values.ELEVENLABS_VOICE_ID))
      throw new Error('Connection voice ID is invalid.');
    if (values.DATABASE_URL) {
      let url: URL;
      try {
        url = new URL(values.DATABASE_URL);
      } catch {
        throw new Error('Connection database URL must be a Neon PostgreSQL connection string.');
      }
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname.endsWith('.neon.tech') ||
        !url.username ||
        !url.password
      )
        throw new Error('Connection database URL must be a Neon PostgreSQL connection string.');
    }
    const next = { ...this.cfg };
    for (const [key, val] of Object.entries(values))
      Object.assign(next, { [fields[key as keyof typeof fields]]: val });
    if (next.mode === 'live' && !(next.hfToken && next.dbHost && next.dbWarehouse && next.dbToken))
      throw new Error('Connection live data mode needs Hugging Face and Databricks first.');
    let existing = '';
    try {
      existing = await readFile(this.cfg.envFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    // Refuse ambiguous multiline files instead of accidentally replacing part of a quoted secret.
    const keys = Object.keys(values);
    const kept: string[] = [];
    let quote: string | null = null;
    for (const line of existing.split(/\r?\n/)) {
      if (quote) {
        kept.push(line);
        if (line.includes(quote)) quote = null;
        continue;
      }
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const first = match[2][0];
        if (["'", '"', '`'].includes(first) && !match[2].slice(1).includes(first)) {
          if (keys.includes(match[1]))
            throw new Error(
              'Connection setting uses a multiline value. Edit that setting in .env first.',
            );
          quote = first;
        }
      }
      if (!match || !keys.includes(match[1])) kept.push(line);
    }
    if (quote) throw new Error('Connection settings file has an unfinished quoted value.');
    for (const [key, val] of Object.entries(values)) {
      const delimiter = ["'", '"', '`'].find((candidate) => !val.includes(candidate));
      if (!delimiter) throw new Error('Connection value contains unsupported quotes.');
      const assignment = `${key}=${delimiter}${val}${delimiter}`;
      if (parse(assignment)[key] !== val)
        throw new Error('Connection value could not be saved safely.');
      kept.push(assignment);
    }
    if (!keys.length) return;
    await mkdir(path.dirname(this.cfg.envFile), { recursive: true });
    const temporary = this.cfg.envFile + '.' + crypto.randomUUID() + '.tmp';
    try {
      await writeFile(temporary, kept.join('\n') + '\n', { mode: 0o600 });
      await rename(temporary, this.cfg.envFile);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    Object.assign(this.cfg, next);
    const affected: Record<Provider, string[]> = {
      huggingFace: ['HF_'],
      elevenLabs: ['ELEVENLABS_'],
      databricks: ['DATABRICKS_'],
      neon: ['DATABASE_URL'],
    };
    for (const [provider, prefixes] of Object.entries(affected))
      if (keys.some((key) => prefixes.some((prefix) => key.startsWith(prefix))))
        delete this.reports[provider as Provider];
  }
  save(input: ConnectionSettings) {
    return this.exclusive(async () => {
      await this.persist(input);
      return this.snapshot();
    });
  }
  verify(provider: Provider, parent: AbortSignal) {
    return this.exclusive(async () => {
      const signal = AbortSignal.any([
        parent,
        AbortSignal.timeout(provider === 'databricks' ? 180000 : 150000),
      ]);
      const report: ConnectionReport = { checkedAt: new Date().toISOString(), checks: [] };
      const check = async (label: string, run: () => Promise<string>) => {
        signal.throwIfAborted();
        try {
          const detail = await run();
          signal.throwIfAborted();
          report.checks.push({ status: 'passed', detail: label + ': ' + detail });
        } catch (error) {
          signal.throwIfAborted();
          const http = (error as Error).message.match(
            /^Provider request failed \(HTTP (\d{3})\)/,
          )?.[1];
          report.checks.push({
            status: 'failed',
            detail:
              label +
              ': ' +
              (http
                ? `HTTP ${http}. Check key permissions, model access and credits.`
                : 'Check credentials, model availability and account limits. No fallback used.'),
          });
        }
      };
      if (!this.snapshot().configured[provider])
        throw new Error('Connection credentials need to be saved first.');
      if (provider === 'huggingFace') {
        await check('Commands and code', async () => {
          const plan = await computerPlan(
            'Write a Python program that prints the first ten Fibonacci numbers',
            {
              folder: { id: crypto.randomUUID(), name: 'Synthetic test' },
              code: null,
              browser: null,
              screen: null,
            },
            this.cfg,
            signal,
          );
          if (plan.action?.tool !== 'createCode') throw new Error('Unexpected action.');
          await generateCode('Print the first ten Fibonacci numbers', this.cfg, signal);
          return 'Validated real AI plan and generated Python. No code executed.';
        });
        await check('Screen vision', async () => {
          const description = await chat(
            this.cfg,
            'Describe the colors and their positions in this synthetic image.',
            [
              { type: 'text', text: 'What two colors are shown?' },
              { type: 'image_url', image_url: { url: testImage() } },
            ],
            signal,
            this.cfg.hfVisionModel,
            false,
          );
          if (!/red/i.test(description) || !/blue/i.test(description))
            throw new Error('Unexpected description.');
          return 'Model recognized red and blue in a synthetic image. Try your selected screen next.';
        });
      } else if (provider === 'elevenLabs') {
        await check('Speech and transcription', async () => {
          if (!this.cfg.elevenVoice) {
            const response = await fetchJson('https://api.elevenlabs.io/v2/voices?page_size=100', {
              headers: { 'xi-api-key': this.cfg.elevenKey },
              signal,
            });
            // Library voices may appear first but require a paid plan for API use.
            const id =
              response.voices?.find((voice: { category?: string }) => voice.category === 'premade')
                ?.voice_id ?? response.voices?.[0]?.voice_id;
            if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id))
              throw new Error('No usable voice.');
            signal.throwIfAborted();
            await this.persist({ ELEVENLABS_VOICE_ID: id });
          }
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${this.cfg.elevenVoice}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: { 'xi-api-key': this.cfg.elevenKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: 'Insight OS is ready to help you use your computer.',
                model_id: 'eleven_multilingual_v2',
              }),
              signal,
            },
          );
          if (!response.ok) throw new Error(`Provider request failed (HTTP ${response.status}).`);
          const audio = await response.arrayBuffer();
          if (audio.byteLength < 100 || audio.byteLength > 5 * 1024 * 1024)
            throw new Error('Invalid audio.');
          const form = new FormData();
          form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'connection-test.mp3');
          form.append('model_id', 'scribe_v1');
          const transcript = await fetchJson('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: { 'xi-api-key': this.cfg.elevenKey },
            body: form,
            signal,
          });
          if (typeof transcript.text !== 'string' || !/computer/i.test(transcript.text))
            throw new Error('Unexpected transcript.');
          return 'Generated audio and transcribed it through Scribe. Test your microphone and speakers next.';
        });
      } else {
        const dataset = parseCsv(
          await readFile(path.resolve('data/operations-synthetic.csv'), 'utf8'),
          'Connection test · synthetic',
          true,
        );
        if (provider === 'databricks')
          await check('Databricks SQL', async () => {
            const db = new Databricks(this.cfg),
              comparison = defaultComparison(dataset);
            const all = resultSchema.parse(await db.analyze(dataset, comparison, signal));
            const common = resultSchema.parse(
              await db.analyze(dataset, { ...comparison, commonLocations: true }, signal),
            );
            if (
              all.provider !== 'databricks' ||
              common.provider !== 'databricks' ||
              all.previousTotal !== 134000 ||
              all.currentTotal !== 204000 ||
              common.previousTotal !== 126000 ||
              common.currentTotal !== 141000 ||
              common.excludedLocations !== 2
            )
              throw new Error('Unexpected totals.');
            return 'Real SQL matches both known fixture totals. Synthetic tables are retained in your workspace.';
          });
        else
          await check('Neon persistence', async () => {
            const storage = new Storage(this.cfg);
            const saved = await storage.save(
              {
                state: { ...emptyWorkspace(), title: 'Connection test · synthetic', dataset },
                history: [],
              },
              signal,
            );
            const loaded = await storage.load(saved.id, signal);
            if (saved.provider !== 'neon' || loaded.state.dataset?.rows.length !== 39)
              throw new Error('Read-back mismatch.');
            return 'Real database write and read passed. Synthetic test project is retained.';
          });
      }
      signal.throwIfAborted();
      this.reports[provider] = report;
      return this.snapshot();
    });
  }
}
