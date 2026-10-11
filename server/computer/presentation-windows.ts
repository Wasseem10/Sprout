import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';

export const managedPresentationFileSchema = z.strictObject({
  path: z.string().min(1).max(2000).refine((value) => path.isAbsolute(value)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ManagedPresentationFile = z.infer<typeof managedPresentationFileSchema>;
const registrySchema = z.strictObject({
  projectId: z.string().uuid(),
  files: z.array(managedPresentationFileSchema).max(32),
});

/** Only files explicitly written/restored by this project can be retired from view. */
export class PresentationWindowRegistry {
  constructor(private cfg: Pick<Config, 'localDir' | 'owner'>) {}
  private filename(projectId: string) {
    z.string().uuid().parse(projectId);
    return path.join(this.cfg.localDir, 'presentation-windows', createHash('sha256').update(this.cfg.owner).digest('hex'), `${projectId}.json`);
  }
  async list(projectId: string): Promise<ManagedPresentationFile[]> {
    const file = this.filename(projectId);
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128_000) return [];
      const record = registrySchema.parse(JSON.parse(await readFile(file, 'utf8')));
      return record.projectId === projectId ? record.files : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      // A missing/corrupt ownership ledger must never turn into a broad filename search.
      return [];
    }
  }
  async register(projectId: string, current: ManagedPresentationFile, signal: AbortSignal) {
    signal.throwIfAborted();
    const entry = managedPresentationFileSchema.parse(current);
    const previous = await this.list(projectId);
    const key = (name: string) => process.platform === 'win32' ? name.toLowerCase() : name;
    const files = [...previous.filter((item) => key(item.path) !== key(entry.path)), entry].slice(-32);
    const file = this.filename(projectId);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ projectId, files }), { mode: 0o600 });
    signal.throwIfAborted();
    await rename(temporary, file);
    return files;
  }
}
