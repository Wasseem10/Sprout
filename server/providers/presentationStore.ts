import { neon } from '@neondatabase/serverless';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';
import { renamePresentationManifest } from '../computer/atomic-json-rename.js';
import {
  presentationSessionSchema,
  presentationLocalManifestSchema,
  savedPresentationSummarySchema,
  type PresentationSession,
  type PresentationLocalManifest,
  type SavedPresentationSummary,
} from '../../shared/presentation-session.js';

export const presentationMigration =
  'CREATE TABLE IF NOT EXISTS insightos_presentation_projects (owner_id TEXT NOT NULL, id UUID NOT NULL, schema_version INTEGER NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, body JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (owner_id,id))';
const ownerSchema = z.string().min(1).max(200);
const idSchema = z.string().uuid();
const recordSchema = z
  .object({
    owner: ownerSchema,
    updatedAt: z.iso.datetime({ offset: true }),
    session: presentationSessionSchema,
  })
  .strict();
const manifestRecordSchema = z
  .object({
    owner: ownerSchema,
    updatedAt: z.iso.datetime({ offset: true }),
    manifest: presentationLocalManifestSchema,
  })
  .strict();
type Record = z.infer<typeof recordSchema>;
type Context = { owner: string; url: string; dir: string };
export type PresentationSaveResult = {
  id: string;
  provider: 'neon' | 'local';
  updatedAt: string;
  warning?: string;
};
export type PresentationLoadResult = PresentationSaveResult & {
  session: PresentationSession;
  local: PresentationLocalManifest | null;
};
export type PresentationListResult = {
  projects: SavedPresentationSummary[];
  provider: 'neon' | 'local';
  warning?: string;
};
const offlineWarning = 'Neon is unavailable. This presentation is saved only on this laptop.';
const newerWarning = 'This laptop has a newer saved presentation than Neon. Using the local copy.';
const sourceWarning =
  'The saved source references do not match this laptop. Choose the source folder again.';
const invalid = () => new Error('Saved presentation is invalid or uses an unsupported schema.');
const refsMatch = (session: PresentationSession, local: PresentationLocalManifest) =>
  session.id === local.projectId &&
  JSON.stringify([...session.sources].sort((a, b) => a.id - b.id)) ===
    JSON.stringify([...local.sources].sort((a, b) => a.id - b.id)) &&
  JSON.stringify(session.briefRef) === JSON.stringify(local.briefRef);
const summary = (record: Record): SavedPresentationSummary => ({
  id: record.session.id,
  title:
    record.session.schemaVersion !== 1
      ? record.session.orderedDeck.title
      : record.session.deck.title,
  revision: record.session.revision,
  updatedAt: record.updatedAt,
});
const hasLocalPath = (session: PresentationSession, root: string) => {
  // Inspect every validated string, including v2 captions, chart provenance,
  // slide IDs and history. New slide types must not bypass the local-path guard.
  const text: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') text.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(session);
  return text.some(
    (value) =>
      (root.length > 1 && value.toLowerCase().includes(root.toLowerCase())) ||
      /\b[a-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+|file:\/\/\/|\/(?:Users|home|tmp|var|mnt|media|Volumes)\/|data:(?:image|application)\/[^;,\s]+;base64,/i.test(
        value,
      ),
  );
};
const timestamp = (value: unknown) => {
  if (!(typeof value === 'string' || value instanceof Date)) throw invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw invalid();
  return date.toISOString();
};

export class PresentationStore {
  // Keep the same config object so Settings changes affect the next operation.
  constructor(private cfg: Config) {}
  get provider() {
    return this.cfg.neonUrl ? ('neon' as const) : ('local' as const);
  }
  private context(): Context {
    const owner = ownerSchema.parse(this.cfg.owner);
    return {
      owner,
      url: this.cfg.neonUrl,
      dir: path.join(
        this.cfg.localDir,
        'presentation-projects',
        createHash('sha256').update(owner).digest('hex'),
      ),
    };
  }
  private file(context: Context, id: string, manifest = false) {
    return path.join(context.dir, idSchema.parse(id) + (manifest ? '.manifest.json' : '.json'));
  }
  private async atomic(file: string, value: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      signal.throwIfAborted();
      await renamePresentationManifest(temporary, file);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
  private async read(file: string, signal: AbortSignal): Promise<unknown | null> {
    signal.throwIfAborted();
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512_000) throw invalid();
      const bytes = await readFile(file);
      signal.throwIfAborted();
      if (bytes.length > 512_000) throw invalid();
      try {
        return JSON.parse(bytes.toString('utf8'));
      } catch {
        throw invalid();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private async localRecord(
    context: Context,
    id: string,
    signal: AbortSignal,
  ): Promise<Record | null> {
    const value = await this.read(this.file(context, id), signal);
    if (value === null) return null;
    const parsed = recordSchema.safeParse(value);
    if (!parsed.success || parsed.data.session.id !== id) throw invalid();
    if (parsed.data.owner !== context.owner)
      throw new Error('Saved presentation ownership mismatch.');
    return parsed.data;
  }
  private async localManifest(context: Context, session: PresentationSession, signal: AbortSignal) {
    const value = await this.read(this.file(context, session.id, true), signal);
    if (value === null) return null;
    const parsed = manifestRecordSchema.safeParse(value);
    if (!parsed.success || parsed.data.manifest.projectId !== session.id) throw invalid();
    if (parsed.data.owner !== context.owner)
      throw new Error('Saved presentation ownership mismatch.');
    return refsMatch(session, parsed.data.manifest) ? parsed.data : null;
  }
  private async attach(
    context: Context,
    record: Record,
    provider: 'neon' | 'local',
    signal: AbortSignal,
    warning?: string,
    omitOutput = false,
  ): Promise<PresentationLoadResult> {
    const binding = await this.localManifest(context, record.session, signal);
    let local = binding?.manifest ?? null;
    if ((omitOutput || binding?.updatedAt !== record.updatedAt) && local) {
      const { output: _output, ...bindings } = local;
      local = bindings;
    }
    return {
      id: record.session.id,
      session: record.session,
      local,
      provider,
      updatedAt: record.updatedAt,
      ...(warning ? { warning } : !local ? { warning: sourceWarning } : {}),
    };
  }
  async save(
    session: PresentationSession,
    local: PresentationLocalManifest,
    signal: AbortSignal,
  ): Promise<PresentationSaveResult> {
    signal.throwIfAborted();
    const checked = presentationSessionSchema.parse(session);
    const manifest = presentationLocalManifestSchema.parse(local);
    if (!refsMatch(checked, manifest))
      throw new Error('Presentation source references do not match the local manifest.');
    const context = this.context();
    const previous = await this.localRecord(context, checked.id, signal);
    const updatedAt = new Date(
      Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0),
    ).toISOString();
    const record: Record = { owner: context.owner, updatedAt, session: checked };
    // The private folder binding is never included in a Neon query.
    await this.atomic(
      this.file(context, checked.id, true),
      { owner: context.owner, updatedAt, manifest },
      signal,
    );
    await this.atomic(this.file(context, checked.id), record, signal);
    if (!context.url) return { id: checked.id, provider: 'local', updatedAt };
    // A spoken topic or image caption can itself contain a private path. Keep
    // that snapshot local rather than accidentally copying it into Neon prose.
    if (hasLocalPath(checked, manifest.root))
      return {
        id: checked.id,
        provider: 'local',
        updatedAt,
        warning: 'This presentation includes a local file path. It was saved only on this laptop.',
      };
    try {
      const sql = neon(context.url, { fetchOptions: { signal } });
      await sql.query(presentationMigration, []);
      signal.throwIfAborted();
      const rows = await sql.query(
        'INSERT INTO insightos_presentation_projects (owner_id,id,schema_version,title,revision,body,updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) ON CONFLICT (owner_id,id) DO UPDATE SET schema_version=EXCLUDED.schema_version,title=EXCLUDED.title,revision=EXCLUDED.revision,body=EXCLUDED.body,updated_at=EXCLUDED.updated_at RETURNING id',
        [
          context.owner,
          checked.id,
          checked.schemaVersion,
          checked.schemaVersion !== 1 ? checked.orderedDeck.title : checked.deck.title,
          checked.revision,
          JSON.stringify(checked),
          updatedAt,
        ],
      );
      signal.throwIfAborted();
      if (rows.length !== 1 || String(rows[0].id) !== checked.id)
        throw new Error('Presentation save was not confirmed.');
      return { id: checked.id, provider: 'neon', updatedAt };
    } catch {
      signal.throwIfAborted();
      return { id: checked.id, provider: 'local', updatedAt, warning: offlineWarning };
    }
  }
  async load(id: string, signal: AbortSignal): Promise<PresentationLoadResult | null> {
    idSchema.parse(id);
    signal.throwIfAborted();
    const context = this.context();
    const local = await this.localRecord(context, id, signal);
    if (!context.url) return local ? this.attach(context, local, 'local', signal) : null;
    let rows: { [key: string]: any }[];
    try {
      const sql = neon(context.url, { fetchOptions: { signal } });
      await sql.query(presentationMigration, []);
      signal.throwIfAborted();
      rows = await sql.query(
        'SELECT owner_id,id,body,updated_at FROM insightos_presentation_projects WHERE owner_id=$1 AND id=$2',
        [context.owner, id],
      );
    } catch {
      signal.throwIfAborted();
      if (local) return this.attach(context, local, 'local', signal, offlineWarning);
      throw new Error(
        'Neon is unavailable and this laptop has no saved copy of that presentation.',
      );
    }
    signal.throwIfAborted();
    if (!rows.length)
      return local
        ? this.attach(
            context,
            local,
            'local',
            signal,
            'This presentation is saved on this laptop but was not found in Neon.',
          )
        : null;
    if (rows.length !== 1 || rows[0].owner_id !== context.owner || String(rows[0].id) !== id)
      throw new Error('Saved presentation ownership mismatch.');
    const parsed = presentationSessionSchema.safeParse(rows[0].body);
    if (!parsed.success || parsed.data.id !== id) throw invalid();
    const remote: Record = {
      owner: context.owner,
      updatedAt: timestamp(rows[0].updated_at),
      session: parsed.data,
    };
    if (local && Date.parse(local.updatedAt) > Date.parse(remote.updatedAt))
      return this.attach(context, local, 'local', signal, newerWarning);
    return this.attach(
      context,
      remote,
      'neon',
      signal,
      undefined,
      !local ||
        remote.updatedAt !== local.updatedAt ||
        JSON.stringify(remote.session) !== JSON.stringify(local.session),
    );
  }
  private async localList(
    context: Context,
    signal: AbortSignal,
  ): Promise<SavedPresentationSummary[]> {
    let files: string[];
    try {
      files = await readdir(context.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records = await Promise.all(
      files
        .filter((file) => /^[a-f0-9-]{36}\.json$/i.test(file))
        .map(async (file) => {
          signal.throwIfAborted();
          try {
            const record = await this.localRecord(context, file.slice(0, -5), signal);
            return record ? summary(record) : null;
          } catch {
            signal.throwIfAborted();
            return null;
          }
        }),
    );
    return records.filter((item): item is SavedPresentationSummary => item !== null);
  }
  async list(signal: AbortSignal): Promise<PresentationListResult> {
    signal.throwIfAborted();
    const context = this.context();
    const local = await this.localList(context, signal);
    const order = (items: SavedPresentationSummary[]) =>
      items
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
        .slice(0, 20);
    if (!context.url) return { projects: order(local), provider: 'local' };
    let rows: { [key: string]: any }[];
    try {
      const sql = neon(context.url, { fetchOptions: { signal } });
      await sql.query(presentationMigration, []);
      signal.throwIfAborted();
      rows = await sql.query(
        'SELECT owner_id,id,schema_version,title,revision,updated_at FROM insightos_presentation_projects WHERE owner_id=$1 ORDER BY updated_at DESC,id ASC LIMIT 20',
        [context.owner],
      );
    } catch {
      signal.throwIfAborted();
      return {
        projects: order(local),
        provider: 'local',
        warning: 'Neon is unavailable. Showing presentations saved on this laptop.',
      };
    }
    signal.throwIfAborted();
    const remote = rows.map((row) => {
      if (row.owner_id !== context.owner) throw new Error('Saved presentation ownership mismatch.');
      if (row.schema_version !== 1 && row.schema_version !== 2 && row.schema_version !== 3) throw invalid();
      const checked = savedPresentationSummarySchema.safeParse({
        id: row.id,
        title: row.title,
        revision: row.revision,
        updatedAt: timestamp(row.updated_at),
      });
      if (!checked.success) throw invalid();
      return checked.data;
    });
    const merged = new Map(remote.map((item) => [item.id, item]));
    let newerLocal = false;
    for (const item of local) {
      const existing = merged.get(item.id);
      if (!existing || Date.parse(item.updatedAt) > Date.parse(existing.updatedAt)) {
        merged.set(item.id, item);
        newerLocal = true;
      }
    }
    return {
      projects: order([...merged.values()]),
      provider: newerLocal ? 'local' : 'neon',
      ...(newerLocal ? { warning: newerWarning } : {}),
    };
  }
}
