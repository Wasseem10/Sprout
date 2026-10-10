import { it, expect, vi, afterEach } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { config } from '../server/config';
import { newEnergyState, recalculate } from '../server/computer/energy';
import { EnergyStore } from '../server/providers/energyStore';
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));
afterEach(() => vi.clearAllMocks());
it('binds energy plan values in Neon and restores only the current owner with no stale verification', async () => {
  const state = newEnergyState();
  state.budget = 30;
  state.selected = 'sealing';
  state.applicant.name = "Alex'); DROP TABLE users; --";
  recalculate(state);
  state.applicationVerified = true;
  let stored: any;
  const query = vi.fn(async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) stored = JSON.parse(args[1] as string);
    return sql.startsWith('SELECT') ? [{ state: stored }] : [];
  });
  vi.mocked(neon).mockReturnValue({ query } as any);
  const store = new EnergyStore({
    ...config(),
    neonUrl: 'postgresql://test:test@example.neon.tech/db',
    owner: 'owner-A',
  });
  await store.save(state, new AbortController().signal);
  const write = query.mock.calls.find((c) => c[0].startsWith('INSERT'))!;
  expect(write[0]).not.toContain(state.applicant.name);
  expect(write[1][0]).toBe('owner-A');
  const loaded = await store.load(new AbortController().signal);
  expect(loaded).toMatchObject({
    budget: 30,
    selected: 'sealing',
    saved: 'neon',
    applicationVerified: false,
  });
  expect(query.mock.calls.at(-1)).toEqual([
    'SELECT state FROM insightos_energy_plans WHERE owner_id=$1',
    ['owner-A'],
  ]);
});
