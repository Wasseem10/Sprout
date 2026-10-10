import { neon } from '@neondatabase/serverless';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';

const noteSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(500),
  createdAt: z.string(),
});
export type MemoryNote = z.infer<typeof noteSchema>;
export const memoryMigration =
  'CREATE TABLE IF NOT EXISTS insightos_assistant_memory (id UUID PRIMARY KEY, owner_id TEXT NOT NULL, note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())';

export class AssistantMemory {
  constructor(private cfg: Config) {}
  get provider() {
    return this.cfg.neonUrl ? ('neon' as const) : ('local' as const);
  }
  private get file() {
    return path.join(this.cfg.localDir, 'assistant-memory.json');
  }
  async list(signal: AbortSignal): Promise<MemoryNote[]> {
    signal.throwIfAborted();
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(memoryMigration, []);
      const rows = await sql.query(
        'SELECT id,note,created_at FROM insightos_assistant_memory WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30',
        [this.cfg.owner],
      );
      return rows.map((r) =>
        noteSchema.parse({ id: r.id, text: r.note, createdAt: String(r.created_at) }),
      );
    }
    try {
      return z
        .array(noteSchema)
        .max(30)
        .parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  private async write(notes: MemoryNote[], signal: AbortSignal) {
    await mkdir(this.cfg.localDir, { recursive: true });
    const temporary = this.file + '.' + crypto.randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(notes), { mode: 0o600 });
    signal.throwIfAborted();
    await rename(temporary, this.file);
  }
  async remember(text: string, signal: AbortSignal) {
    const note = noteSchema.parse({
      id: crypto.randomUUID(),
      text: text.trim(),
      createdAt: new Date().toISOString(),
    });
    // Never convert a quoted secret into durable conversational context.
    if (/password|api[ _-]?key|secret token|credit card|social security|\bssn\b/i.test(note.text))
      throw new Error('Keep passwords and secret keys in Settings, not assistant memory.');
    const previous = await this.list(signal);
    if (previous.some((n) => n.text.toLowerCase() === note.text.toLowerCase())) return;
    if (previous.length >= 30)
      throw new Error('Memory is full. Ask me to forget saved preferences before adding more.');
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(
        'INSERT INTO insightos_assistant_memory (id,owner_id,note) VALUES ($1,$2,$3)',
        [note.id, this.cfg.owner, note.text],
      );
    } else await this.write([note, ...previous], signal);
  }
  async forgetAll(signal: AbortSignal) {
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(memoryMigration, []);
      await sql.query('DELETE FROM insightos_assistant_memory WHERE owner_id=$1', [this.cfg.owner]);
    } else await this.write([], signal);
  }
}
