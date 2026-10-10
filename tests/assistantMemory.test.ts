import { it, expect, vi, afterEach } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { AssistantMemory } from '../server/providers/assistantMemory';
import { config } from '../server/config';
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));
afterEach(() => vi.clearAllMocks());
it('parameterizes Neon memory and scopes reads and deletion to the configured owner', async () => {
  const query = vi.fn(async (_sql: string, _args: unknown[]) => []);
  vi.mocked(neon).mockReturnValue({ query } as any);
  const store = new AssistantMemory({
    ...config(),
    neonUrl: 'postgresql://test:test@example.neon.tech/db',
    owner: 'owner-A',
  });
  const note = "I prefer blue'); DROP TABLE users; --";
  await store.remember(note, new AbortController().signal);
  const insert = query.mock.calls.find((c) => c[0].startsWith('INSERT'))!;
  expect(insert[0]).not.toContain(note);
  expect(insert[1]).toEqual([expect.any(String), 'owner-A', note]);
  const read = query.mock.calls.find((c) => c[0].startsWith('SELECT'))!;
  expect(read[0]).toContain('WHERE owner_id=$1');
  expect(read[1]).toEqual(['owner-A']);
  await store.forgetAll(new AbortController().signal);
  expect(query.mock.calls.at(-1)).toEqual([
    'DELETE FROM insightos_assistant_memory WHERE owner_id=$1',
    ['owner-A'],
  ]);
});
it('does not save secret keys as conversational preferences', async () => {
  const query = vi.fn();
  vi.mocked(neon).mockReturnValue({ query } as any);
  const store = new AssistantMemory({
    ...config(),
    neonUrl: 'postgresql://test:test@example.neon.tech/db',
  });
  await expect(
    store.remember('My API key is a-secret', new AbortController().signal),
  ).rejects.toThrow('Settings');
  expect(query).not.toHaveBeenCalled();
});
