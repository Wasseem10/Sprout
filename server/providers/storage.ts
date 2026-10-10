import { neon } from '@neondatabase/serverless';
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { projectSchema, type Project } from '../../shared/schema.js';
import type { Config } from '../config.js';
export const migration =
  'CREATE TABLE IF NOT EXISTS insightos_projects (id UUID PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, module_id TEXT NOT NULL, schema_version INTEGER NOT NULL, body JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())';
export class Storage {
  constructor(private cfg: Config) {}
  get provider() {
    return this.cfg.neonUrl ? 'neon' : 'local-development';
  }
  async save(project: Project, signal: AbortSignal) {
    const valid = projectSchema.parse(project);
    signal.throwIfAborted();
    const id = valid.state.projectId ?? crypto.randomUUID();
    valid.state.projectId = id;
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(migration, []);
      signal.throwIfAborted();
      await sql
        .query(
          'INSERT INTO insightos_projects (id,owner_id,title,module_id,schema_version,body) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body, updated_at=NOW() WHERE insightos_projects.owner_id=EXCLUDED.owner_id RETURNING id',
          [
            id,
            this.cfg.owner,
            valid.state.title,
            valid.state.moduleId,
            valid.state.schemaVersion,
            JSON.stringify(valid),
          ],
        )
        .then((rows) => {
          if (rows.length !== 1) throw new Error('Project ownership mismatch.');
        });
    } else {
      const dir = path.join(this.cfg.localDir, 'projects');
      await mkdir(dir, { recursive: true });
      const target = path.join(dir, id + '.json'),
        temp = target + '.' + crypto.randomUUID() + '.tmp';
      await writeFile(
        temp,
        JSON.stringify({
          owner: this.cfg.owner,
          updatedAt: new Date().toISOString(),
          project: valid,
        }),
        { mode: 0o600 },
      );
      signal.throwIfAborted();
      await rename(temp, target);
    }
    signal.throwIfAborted();
    return { id, provider: this.provider };
  }
  async load(id: string, signal: AbortSignal): Promise<Project> {
    signal.throwIfAborted();
    let value: unknown;
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(migration, []);
      const rows = await sql.query(
        'SELECT body FROM insightos_projects WHERE id=$1 AND owner_id=$2',
        [id, this.cfg.owner],
      );
      if (!rows.length) throw new Error('Saved project not found.');
      value = rows[0].body;
    } else {
      const record = JSON.parse(
        await readFile(path.join(this.cfg.localDir, 'projects', id + '.json'), 'utf8'),
      );
      if (record.owner !== this.cfg.owner) throw new Error('Project ownership mismatch.');
      value = record.project;
    }
    signal.throwIfAborted();
    return projectSchema.parse(value);
  }
  async list() {
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl);
      await sql.query(migration, []);
      const rows = await sql.query(
        'SELECT id,title,updated_at FROM insightos_projects WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 20',
        [this.cfg.owner],
      );
      return rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        updatedAt: String(r.updated_at),
      }));
    }
    const dir = path.join(this.cfg.localDir, 'projects');
    await mkdir(dir, { recursive: true });
    const files = (await readdir(dir)).filter((f) => /^[a-f0-9-]{36}\.json$/.test(f));
    const records = await Promise.all(
      files.map(async (f) => {
        try {
          const r = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
          if (r.owner !== this.cfg.owner) return null;
          const project = projectSchema.parse(r.project);
          return {
            id: project.state.projectId!,
            title: project.state.title,
            updatedAt: r.updatedAt as string,
          };
        } catch {
          return null;
        }
      }),
    );
    return records
      .filter((r) => r !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20);
  }
}
