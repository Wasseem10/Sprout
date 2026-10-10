import { neon } from '@neondatabase/serverless';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { energyStateSchema, type EnergyState } from '../../shared/energy.js';
import type { Config } from '../config.js';

const migration =
  'CREATE TABLE IF NOT EXISTS insightos_energy_plans (owner_id TEXT PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())';
export class EnergyStore {
  constructor(private cfg: Config) {}
  get provider() {
    return this.cfg.neonUrl ? ('neon' as const) : ('local' as const);
  }
  private get file() {
    return path.join(this.cfg.localDir, 'energy-plan.json');
  }
  async save(state: EnergyState, signal: AbortSignal) {
    // This method is called only after the user explicitly asks to save.
    signal.throwIfAborted();
    const checked = energyStateSchema.parse({
      ...state,
      saved: this.provider,
      applicationVerified: false,
    });
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(migration, []);
      await sql.query(
        'INSERT INTO insightos_energy_plans(owner_id,state) VALUES ($1,$2::jsonb) ON CONFLICT(owner_id) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',
        [this.cfg.owner, JSON.stringify(checked)],
      );
    } else {
      await mkdir(this.cfg.localDir, { recursive: true });
      const temp = this.file + '.' + crypto.randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(checked), { mode: 0o600 });
      signal.throwIfAborted();
      await rename(temp, this.file);
    }
    return this.provider;
  }
  async load(signal: AbortSignal): Promise<EnergyState | null> {
    signal.throwIfAborted();
    let state: unknown;
    if (this.cfg.neonUrl) {
      const sql = neon(this.cfg.neonUrl, { fetchOptions: { signal } });
      await sql.query(migration, []);
      const rows = await sql.query('SELECT state FROM insightos_energy_plans WHERE owner_id=$1', [
        this.cfg.owner,
      ]);
      state = rows[0]?.state;
    } else {
      try {
        state = JSON.parse(await readFile(this.file, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }
    if (!state) return null;
    return energyStateSchema.parse({
      ...energyStateSchema.parse(state),
      applicationVerified: false,
      saved: this.provider,
    });
  }
}
