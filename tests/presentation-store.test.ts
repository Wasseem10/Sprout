import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config, type Config } from '../server/config';
import { PresentationStore } from '../server/providers/presentationStore';
import {
  presentationSessionSchema,
  type PresentationSession,
  type PresentationLocalManifest,
} from '../shared/presentation-session';

vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));
const directories: string[] = [];
const signal = () => new AbortController().signal;
type RemoteRow = {
  owner_id: string;
  id: string;
  schema_version: number;
  title: string;
  revision: number;
  body: PresentationSession;
  updated_at: string;
};
let remote: Map<string, RemoteRow>;
let query: ReturnType<typeof vi.fn>;
beforeEach(() => {
  remote = new Map();
  query = vi.fn(async (sql: string, args: unknown[]) => {
    const owner = String(args[0]);
    if (sql.startsWith('INSERT')) {
      const row: RemoteRow = {
        owner_id: owner,
        id: String(args[1]),
        schema_version: Number(args[2]),
        title: String(args[3]),
        revision: Number(args[4]),
        body: JSON.parse(String(args[5])),
        updated_at: String(args[6]),
      };
      remote.set(owner + ':' + row.id, row);
      return [{ id: row.id }];
    }
    if (sql.startsWith('SELECT') && sql.includes('body')) {
      const row = remote.get(owner + ':' + String(args[1]));
      return row ? [structuredClone(row)] : [];
    }
    if (sql.startsWith('SELECT'))
      return [...remote.values()]
        .filter((row) => row.owner_id === owner)
        .map((row) => structuredClone(row));
    return [];
  });
  vi.mocked(neon).mockReturnValue({ query } as any);
});
afterEach(async () => {
  vi.clearAllMocks();
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory);
    if (!target.startsWith(path.join(tmpdir(), 'insight-presentation-store-')))
      throw new Error('Unexpected test cleanup directory');
    await rm(target, { recursive: true, force: true });
  }
});
async function setup(cloud = false) {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-presentation-store-'));
  directories.push(localDir);
  const cfg: Config = {
    ...config(),
    localDir,
    owner: 'presentation-owner-A',
    neonUrl: cloud ? 'postgresql://test-user:test-password@example.neon.tech/presentations' : '',
    hfToken: 'TEST_HF_SECRET',
    dbToken: 'TEST_DB_SECRET',
    elevenKey: 'TEST_VOICE_SECRET',
    passphrase: 'TEST_SESSION_SECRET',
  };
  const session: PresentationSession = {
    schemaVersion: 1,
    id: randomUUID(),
    revision: 1,
    deck: {
      title: 'Quarterly marketing plan',
      subtitle: 'A source grounded presentation',
      theme: 'blue',
      slides: [
        {
          title: 'Campaign plan',
          imageId: 1,
          points: ['Review customer needs', 'Plan accessible campaigns'],
        },
      ],
      diagram: {
        title: 'Proposed campaign process',
        stages: [
          { label: 'Research', detail: 'Understand customer needs' },
          { label: 'Plan', detail: 'Choose accessible channels' },
          { label: 'Review', detail: 'Check results with the team' },
        ],
      },
    },
    sources: [
      {
        id: 1,
        filename: 'team.png',
        description: 'A team discussing a project.',
        sha256: 'a'.repeat(64),
        width: 800,
        height: 600,
      },
    ],
    briefRef: { filename: 'brief.md', sha256: 'b'.repeat(64) },
    history: [],
  };
  const manifest: PresentationLocalManifest = {
    schemaVersion: 1,
    projectId: session.id,
    root: path.join(localDir, 'Private Marketing'),
    sources: structuredClone(session.sources),
    briefRef: structuredClone(session.briefRef),
    output: { filename: 'insight-presentation-r1.pptx', sha256: 'c'.repeat(64) },
    originalRequest: 'PRIVATE_SPOKEN_REQUEST from ' + path.join(localDir, 'Private Marketing'),
    research: [
      {
        id: 1,
        title: 'Public source',
        url: 'https://example.test/article',
        text: 'PRIVATE_RESEARCH_EXCERPT',
        accessedAt: '2026-10-10T12:00:00.000Z',
      },
    ],
  };
  return { cfg, session, manifest, store: new PresentationStore(cfg) };
}
const localFile = (cfg: Config, id: string, manifest = false) =>
  path.join(
    cfg.localDir,
    'presentation-projects',
    createHash('sha256').update(cfg.owner).digest('hex'),
    id + (manifest ? '.manifest.json' : '.json'),
  );

it('restores style, source hashes and bounded undo after a local restart without saving source bytes', async () => {
  const { cfg, session, manifest, store } = await setup();
  const first = structuredClone(session.deck);
  session.revision = 3;
  session.deck.theme = 'dark';
  session.history = [
    { revision: 1, deck: first },
    { revision: 2, deck: { ...first, theme: 'light' } },
  ];
  const saved = await store.save(session, manifest, signal());
  expect(saved.provider).toBe('local');
  session.deck.title = 'Changed in memory after saving';
  const loaded = await new PresentationStore(cfg).load(session.id, signal());
  expect(loaded?.session).toMatchObject({
    revision: 3,
    deck: { title: 'Quarterly marketing plan', theme: 'dark' },
  });
  expect(loaded?.session.history.map((item) => item.deck.theme)).toEqual(['blue', 'light']);
  expect(loaded?.session.sources[0].sha256).toBe('a'.repeat(64));
  expect(loaded?.local?.root).toBe(manifest.root);
  const metadata = await readFile(localFile(cfg, session.id), 'utf8');
  expect(metadata).not.toContain(manifest.root);
  expect(metadata).not.toContain('PRIVATE_SPOKEN_REQUEST');
  expect(metadata).not.toContain('PRIVATE_RESEARCH_EXCERPT');
  expect(metadata).not.toContain('data:image');
  expect(await new PresentationStore(cfg).list(signal())).toMatchObject({
    provider: 'local',
    projects: [{ id: session.id, revision: 3 }],
  });
  expect(neon).not.toHaveBeenCalled();
});

it('isolates local projects by owner even when two owners use the same project ID', async () => {
  const { cfg, session, manifest, store } = await setup();
  await store.save(session, manifest, signal());
  const otherCfg = { ...cfg, owner: 'presentation-owner-B' };
  const other = new PresentationStore(otherCfg);
  expect(await other.load(session.id, signal())).toBeNull();
  expect((await other.list(signal())).projects).toEqual([]);
  await other.save(
    { ...session, deck: { ...session.deck, title: 'Another owner presentation' } },
    manifest,
    signal(),
  );
  expect((await store.load(session.id, signal()))?.session.deck.title).toBe(
    'Quarterly marketing plan',
  );
  expect((await other.load(session.id, signal()))?.session.deck.title).toBe(
    'Another owner presentation',
  );
});

it('rejects unsafe references, unbounded history and mismatched manifests before persistence', async () => {
  const { session, manifest, store } = await setup(true);
  await expect(
    store.save(
      { ...session, sources: [{ ...session.sources[0], filename: '../secret.png' }] },
      manifest,
      signal(),
    ),
  ).rejects.toThrow();
  await expect(store.load('../secret.json', signal())).rejects.toThrow();
  await expect(
    store.save({ ...session, schemaVersion: 2 } as any, manifest, signal()),
  ).rejects.toThrow();
  await expect(
    store.save({ ...session, root: manifest.root } as any, manifest, signal()),
  ).rejects.toThrow();
  await expect(
    store.save(
      {
        ...session,
        sources: [{ ...session.sources[0], data: 'data:image/png;base64,PRIVATE_BYTES' }],
      } as any,
      manifest,
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    store.save(
      {
        ...session,
        revision: 10,
        history: Array.from({ length: 9 }, (_, index) => ({
          revision: index + 1,
          deck: session.deck,
        })),
      },
      manifest,
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    store.save(
      {
        ...session,
        revision: 3,
        history: [
          { revision: 2, deck: session.deck },
          { revision: 1, deck: session.deck },
        ],
      },
      manifest,
      signal(),
    ),
  ).rejects.toThrow();
  const twoImages = {
    ...session,
    revision: 2,
    sources: [...session.sources, { ...session.sources[0], id: 2, filename: 'second.png' }],
    deck: {
      ...session.deck,
      slides: [...session.deck.slides, { ...session.deck.slides[0], imageId: 2 }],
    },
    history: [{ revision: 1, deck: session.deck }],
  };
  await expect(
    store.save(twoImages, { ...manifest, sources: twoImages.sources }, signal()),
  ).rejects.toThrow();
  await expect(
    store.save(
      {
        ...session,
        deck: { ...session.deck, slides: [{ ...session.deck.slides[0], imageId: 2 }] },
      },
      manifest,
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    store.save(
      session,
      { ...manifest, sources: [{ ...manifest.sources[0], sha256: 'd'.repeat(64) }] },
      signal(),
    ),
  ).rejects.toThrow('references');
  await expect(
    store.save(session, { ...manifest, projectId: randomUUID() }, signal()),
  ).rejects.toThrow('references');
  expect(query).not.toHaveBeenCalled();
});

it('binds owner and content in SQL and sends only validated cloud metadata', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  cfg.owner = "owner'); DROP TABLE users; --";
  session.deck.title = "Plan'); DROP TABLE projects; --";
  const saved = await store.save(session, manifest, signal());
  expect(saved.provider).toBe('neon');
  const insert = query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT'))!;
  expect(insert[0]).not.toContain(cfg.owner);
  expect(insert[0]).not.toContain(session.deck.title);
  expect(insert[1][0]).toBe(cfg.owner);
  const body = JSON.parse(insert[1][5]);
  expect(body).toEqual(session);
  const sent = JSON.stringify(query.mock.calls);
  for (const privateValue of [
    manifest.root,
    'PRIVATE_SPOKEN_REQUEST',
    'PRIVATE_RESEARCH_EXCERPT',
    cfg.hfToken,
    cfg.dbToken,
    cfg.elevenKey,
    cfg.passphrase,
    cfg.neonUrl,
  ])
    expect(sent).not.toContain(privateValue);
  const loaded = await store.load(session.id, signal());
  expect(loaded?.provider).toBe('neon');
  expect(loaded?.local?.output).toEqual(manifest.output);
  const select = query.mock.calls.find(([sql]) => String(sql).startsWith('SELECT'))!;
  expect(select[0]).toContain('owner_id=$1 AND id=$2');
  expect(select[1]).toEqual([cfg.owner, session.id]);
  expect((await store.list(signal())).provider).toBe('neon');
});

it('uses updated configuration by reference without moving projects between owners', async () => {
  const { cfg, session, manifest, store } = await setup();
  await store.save(session, manifest, signal());
  cfg.neonUrl = 'postgresql://test:new-test@example.neon.tech/other';
  await store.save(session, manifest, signal());
  expect(vi.mocked(neon).mock.calls.at(-1)?.[0]).toBe(cfg.neonUrl);
  cfg.owner = 'other-owner-after-settings';
  expect(await store.load(session.id, signal())).toBeNull();
  expect(query.mock.calls.at(-1)?.[1]).toEqual([cfg.owner, session.id]);
});

it('keeps private paths local even when they occur in slide text or a picture caption', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  session.deck.subtitle = 'Pictures from ' + manifest.root;
  const saved = await store.save(session, manifest, signal());
  expect(saved).toMatchObject({
    provider: 'local',
    warning: expect.stringContaining('local file path'),
  });
  expect(query).not.toHaveBeenCalled();
  cfg.neonUrl = '';
  expect((await store.load(session.id, signal()))?.session.deck.subtitle).toContain(manifest.root);
});

it('keeps an offline copy after a remote failure without reporting Neon success or leaking provider errors', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  query.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR with TEST_DB_SECRET'));
  const saved = await store.save(session, manifest, signal());
  expect(saved).toMatchObject({
    provider: 'local',
    warning: expect.stringContaining('Neon is unavailable'),
  });
  expect(saved.warning).not.toContain('PRIVATE_PROVIDER_ERROR');
  expect(saved.warning).not.toContain('TEST_DB_SECRET');
  const restarted = new PresentationStore(cfg);
  expect(await restarted.load(session.id, signal())).toMatchObject({
    provider: 'local',
    session: { id: session.id },
    warning: expect.any(String),
  });
  expect(await restarted.list(signal())).toMatchObject({
    provider: 'local',
    projects: [{ id: session.id }],
    warning: expect.any(String),
  });
  await expect(restarted.load(randomUUID(), signal())).rejects.toThrow('no saved copy');
});

it('chooses a newer local revision when a failed cloud save leaves an older Neon snapshot', async () => {
  const { session, manifest, store } = await setup(true);
  await store.save(session, manifest, signal());
  const old = structuredClone(remote.values().next().value!);
  query.mockRejectedValueOnce(new Error('Network is down'));
  session.history = [{ revision: 1, deck: structuredClone(session.deck) }];
  session.revision = 2;
  session.deck.theme = 'dark';
  expect((await store.save(session, manifest, signal())).provider).toBe('local');
  expect(remote.values().next().value).toEqual(old);
  const loaded = await store.load(session.id, signal());
  expect(loaded).toMatchObject({
    provider: 'local',
    session: { revision: 2, deck: { theme: 'dark' } },
    warning: expect.stringContaining('newer'),
  });
  expect(await store.list(signal())).toMatchObject({
    provider: 'local',
    projects: [{ revision: 2 }],
    warning: expect.stringContaining('newer'),
  });
});

it('loads a newer remote deck while omitting a stale local output file', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  const saved = await store.save(session, manifest, signal());
  const row = remote.get(cfg.owner + ':' + session.id)!;
  row.body.revision = 2;
  row.body.history = [{ revision: 1, deck: structuredClone(row.body.deck) }];
  row.body.deck.theme = 'dark';
  row.revision = 2;
  row.updated_at = new Date(Date.parse(saved.updatedAt) + 1000).toISOString();
  const loaded = await store.load(session.id, signal());
  expect(loaded).toMatchObject({
    provider: 'neon',
    session: { revision: 2 },
    local: { root: manifest.root },
  });
  expect(loaded?.local?.output).toBeUndefined();
});

it('requires rebinding when remote source hashes differ and never invents a folder on another laptop', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  const saved = await store.save(session, manifest, signal());
  const row = remote.get(cfg.owner + ':' + session.id)!;
  row.body.sources[0].sha256 = 'd'.repeat(64);
  row.updated_at = new Date(Date.parse(saved.updatedAt) + 1000).toISOString();
  expect(await store.load(session.id, signal())).toMatchObject({
    provider: 'neon',
    local: null,
    warning: expect.stringContaining('source folder'),
  });
  const second = await setup(true);
  const elsewhere = new PresentationStore({ ...cfg, localDir: second.cfg.localDir });
  const loaded = await elsewhere.load(session.id, signal());
  expect(loaded?.local).toBeNull();
  expect(loaded?.warning).toContain('source folder');
  expect(loaded?.session.sources[0].sha256).toBe('d'.repeat(64));
});

it('omits a local output if cloud content changes even with an unchanged timestamp', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  await store.save(session, manifest, signal());
  const row = remote.get(cfg.owner + ':' + session.id)!;
  row.body.deck.title = 'Changed remotely without a timestamp update';
  const loaded = await store.load(session.id, signal());
  expect(loaded?.session.deck.title).toBe(row.body.deck.title);
  expect(loaded?.local?.root).toBe(manifest.root);
  expect(loaded?.local?.output).toBeUndefined();
});

it('rejects corrupted metadata and owner mismatches rather than silently trusting the cache', async () => {
  const { cfg, session, manifest, store } = await setup(true);
  await store.save(session, manifest, signal());
  const row = remote.get(cfg.owner + ':' + session.id)!;
  row.owner_id = 'another-owner';
  await expect(store.load(session.id, signal())).rejects.toThrow('ownership');
  // A provider returning another owner's list must not disclose it.
  query.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
  await expect(store.list(signal())).rejects.toThrow('ownership');
  row.owner_id = cfg.owner;
  (row.body as any).schemaVersion = 999;
  await expect(store.load(session.id, signal())).rejects.toThrow('unsupported schema');
  const file = localFile(cfg, session.id);
  const record = JSON.parse(await readFile(file, 'utf8'));
  record.owner = 'another-owner';
  await writeFile(file, JSON.stringify(record));
  cfg.neonUrl = '';
  await expect(store.load(session.id, signal())).rejects.toThrow('ownership');
  expect((await store.list(signal())).projects).toEqual([]);
});

it('preserves validation and excludes unknown nested deck fields from persisted JSON', async () => {
  const { cfg, session, manifest, store } = await setup();
  const input = {
    ...session,
    deck: {
      ...session.deck,
      slides: [{ ...session.deck.slides[0], token: 'PRIVATE_NESTED_TOKEN' }],
    },
  };
  expect(presentationSessionSchema.parse(input).deck.slides[0]).not.toHaveProperty('token');
  await store.save(input, manifest, signal());
  expect(await readFile(localFile(cfg, session.id), 'utf8')).not.toContain('PRIVATE_NESTED_TOKEN');
  const metadata = JSON.parse(await readFile(localFile(cfg, session.id), 'utf8'));
  metadata.session.sources[0].filename = 'C:\\private\\team.png';
  await writeFile(localFile(cfg, session.id), JSON.stringify(metadata));
  await expect(store.load(session.id, signal())).rejects.toThrow('invalid');
});

it('does not open an output from a partially replaced manifest as the older saved deck', async () => {
  const { cfg, session, manifest, store } = await setup();
  await store.save(session, manifest, signal());
  const file = localFile(cfg, session.id, true);
  const binding = JSON.parse(await readFile(file, 'utf8'));
  binding.updatedAt = new Date(Date.parse(binding.updatedAt) + 1000).toISOString();
  binding.manifest.output.filename = 'newer-uncommitted-deck.pptx';
  await writeFile(file, JSON.stringify(binding));
  const loaded = await store.load(session.id, signal());
  expect(loaded?.local?.root).toBe(manifest.root);
  expect(loaded?.local?.output).toBeUndefined();
});

it('does not turn cancellation into a successful local fallback', async () => {
  const { session, manifest, store } = await setup(true);
  const abort = new AbortController();
  query.mockImplementation(async () => {
    abort.abort();
    throw new Error('PRIVATE_PROVIDER_ERROR');
  });
  await expect(store.save(session, manifest, abort.signal)).rejects.toThrow();
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await expect(store.load(session.id, alreadyAborted.signal)).rejects.toThrow();
  await expect(store.list(alreadyAborted.signal)).rejects.toThrow();
});
