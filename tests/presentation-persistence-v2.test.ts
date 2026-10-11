import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config';
import { PresentationStore } from '../server/providers/presentationStore';
import { restoreDeckSources } from '../server/computer/presentation-project';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../shared/presentation-deck';
import {
  migratePresentationSession,
  migratePresentationSessionV3,
  presentationLocalManifestSchema,
  presentationSessionSchema,
  type PresentationLocalManifest,
  type PresentationSessionV2,
} from '../shared/presentation-session';

vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));
const signal = () => new AbortController().signal;
let query: ReturnType<typeof vi.fn>;
let remote: Map<string, any>;

beforeEach(() => {
  remote = new Map();
  query = vi.fn(async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const row = {
        owner_id: args[0],
        id: args[1],
        schema_version: args[2],
        title: args[3],
        revision: args[4],
        body: JSON.parse(String(args[5])),
        updated_at: args[6],
      };
      remote.set(`${args[0]}:${args[1]}`, row);
      return [{ id: args[1] }];
    }
    if (sql.startsWith('SELECT') && sql.includes('body')) {
      const row = remote.get(`${args[0]}:${args[1]}`);
      return row ? [structuredClone(row)] : [];
    }
    if (sql.startsWith('SELECT'))
      return [...remote.values()]
        .filter((row) => row.owner_id === args[0])
        .map((row) => structuredClone(row));
    return [];
  });
  vi.mocked(neon).mockReturnValue({ query } as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fixture(cloud = false) {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-presentation-v2-'));
  const root = path.join(localDir, 'Marketing');
  await mkdir(root);
  const canvas = createCanvas(120, 80);
  canvas.getContext('2d').fillRect(0, 0, 120, 80);
  const image = canvas.toBuffer('image/png');
  await writeFile(path.join(root, 'campaign.png'), image);
  const source = {
    id: 1,
    filename: 'campaign.png',
    description: 'Synthetic campaign QA picture.',
    sha256: createHash('sha256').update(image).digest('hex'),
    width: 120,
    height: 80,
  };
  const orderedDeck: OrderedPresentationDeck = {
    schemaVersion: 2,
    title: 'Cyber Monday campaign',
    theme: 'dark',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      {
        id: 'cover',
        type: 'cover',
        title: 'Cyber Monday campaign',
        subtitle: 'Proposed campaign using one supplied image',
        imageId: 1,
      },
      {
        id: 'audience',
        type: 'text',
        title: 'Proposed audience',
        points: ['Choose a relevant audience.', 'Use supplied campaign facts.'],
      },
      {
        id: 'plan',
        type: 'text',
        title: 'Campaign plan',
        points: ['Prepare an accessible announcement.', 'Review before publishing.'],
      },
      {
        id: 'metrics',
        type: 'chart',
        title: 'Synthetic QA revenue',
        chart: {
          labels: ['August', 'September'],
          series: [{ name: 'Revenue', values: [120, 160] }],
          unit: 'USD',
          provenance: {
            datasetId: 'synthetic-qa-data',
            revision: 1,
            verifiedAt: '2026-10-11T04:00:00.000Z',
            provider: 'databricks',
            queryRef: 'synthetic-qa-query',
            summary: 'Synthetic QA values: August 120 USD and September 160 USD.',
          },
        },
      },
      {
        id: 'process',
        type: 'process',
        title: 'Proposed process',
        stages: [
          { label: 'Plan', detail: 'Choose the campaign.' },
          { label: 'Review', detail: 'Review its content.' },
          { label: 'Publish', detail: 'Publish after approval.' },
        ],
      },
      {
        id: 'summary',
        type: 'text',
        title: 'Summary',
        points: ['Review the proposed campaign with the team.'],
      },
    ],
  };
  const previous = structuredClone(orderedDeck);
  previous.theme = 'blue';
  const session: PresentationSessionV2 = {
    schemaVersion: 2,
    id: randomUUID(),
    revision: 2,
    orderedDeck,
    deck: legacyDeckProjection(orderedDeck),
    sources: [source],
    history: [{ revision: 1, orderedDeck: previous, deck: legacyDeckProjection(previous) }],
  };
  const manifest: PresentationLocalManifest = {
    schemaVersion: 2,
    projectId: session.id,
    root,
    sources: [source],
    sourceBindings: [{ id: 1, path: path.join(root, source.filename) }],
    output: { filename: 'v2-campaign.pptx', sha256: 'b'.repeat(64) },
  };
  const cfg = {
    ...config(),
    localDir,
    owner: 'v2-test-owner',
    neonUrl: cloud ? 'postgresql://fake:fake@fixture.neon.tech/test' : '',
  };
  return { cfg, root, session, manifest, image, store: new PresentationStore(cfg) };
}

describe('ordered presentation persistence', () => {
  it('roundtrips six ordered slides, one image, chart provenance, stable IDs and full undo through a fresh local store', async () => {
    const qa = await fixture();
    const before = structuredClone(qa.session);
    await qa.store.save(qa.session, qa.manifest, signal());
    qa.session.orderedDeck.slides.reverse();
    qa.session.history.length = 0;
    const loaded = await new PresentationStore(qa.cfg).load(before.id, signal());
    expect(loaded?.session).toEqual(before);
    expect(loaded?.local?.sourceBindings).toEqual(qa.manifest.sourceBindings);
    expect(loaded?.session.sources).toHaveLength(1);
    if (loaded?.session.schemaVersion !== 2) throw new Error('Expected ordered v2 session');
    expect(loaded.session.orderedDeck.slides).toHaveLength(6);
    expect(loaded.session.orderedDeck.slides.map((slide) => slide.id)).toEqual([
      'cover',
      'audience',
      'plan',
      'metrics',
      'process',
      'summary',
    ]);
    expect(loaded.session.history[0].orderedDeck.theme).toBe('blue');
    const sources = await restoreDeckSources(
      loaded.local!.root,
      loaded.session.sources,
      undefined,
      signal(),
    );
    expect(sources.assets[0].sha256).toBe(before.sources[0].sha256);
    expect(neon).not.toHaveBeenCalled();
  });

  it('supports an ordered text-only project with no invented image references while v1 still requires images', async () => {
    const qa = await fixture();
    const cover = qa.session.orderedDeck.slides[0];
    if (cover.type !== 'cover') throw new Error('Expected cover');
    delete cover.imageId;
    qa.session.sources = [];
    qa.session.history = [];
    qa.session.deck = legacyDeckProjection(qa.session.orderedDeck);
    qa.manifest.sources = [];
    delete qa.manifest.sourceBindings;
    await qa.store.save(qa.session, qa.manifest, signal());
    const loaded = await new PresentationStore(qa.cfg).load(qa.session.id, signal());
    expect(loaded?.session.sources).toEqual([]);
    expect(loaded?.session.deck.slides).toEqual([]);
    expect(presentationSessionSchema.safeParse({ ...qa.session, schemaVersion: 1 }).success).toBe(
      false,
    );
    expect(
      presentationLocalManifestSchema.safeParse({ ...qa.manifest, schemaVersion: 1 }).success,
    ).toBe(false);
  });

  it('migrates legacy sessions and undo to ordered v2 without losing source references or modifying original data', async () => {
    const qa = await fixture();
    const old = {
      schemaVersion: 1 as const,
      id: qa.session.id,
      revision: 2,
      deck: qa.session.deck,
      sources: qa.session.sources,
      history: [{ revision: 1, deck: { ...qa.session.deck, theme: 'light' as const } }],
    };
    const before = structuredClone(old);
    const upgraded = migratePresentationSession(old);
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.sources).toEqual(old.sources);
    expect(upgraded.history[0].orderedDeck.theme).toBe('light');
    expect(upgraded.orderedDeck.slides.map((slide) => slide.id)).toEqual([
      'legacy-cover',
      'legacy-image-1',
      'legacy-process',
    ]);
    expect(old).toEqual(before);
    expect(migratePresentationSession(upgraded)).toEqual(upgraded);
    await qa.store.save(upgraded, qa.manifest, signal());
    expect((await new PresentationStore(qa.cfg).load(upgraded.id, signal()))?.session).toEqual(
      upgraded,
    );
  });

  it('validates every ordered revision against source IDs and rejects bad history, duplicate IDs and more than ten slides', async () => {
    const qa = await fixture();
    const missing = structuredClone(qa.session);
    (missing.history[0].orderedDeck.slides[0] as { imageId?: number }).imageId = 2;
    expect(presentationSessionSchema.safeParse(missing).success).toBe(false);
    const duplicate = structuredClone(qa.session);
    duplicate.orderedDeck.slides[1].id = duplicate.orderedDeck.slides[0].id;
    expect(presentationSessionSchema.safeParse(duplicate).success).toBe(false);
    const tooMany = structuredClone(qa.session);
    tooMany.orderedDeck.slides = Array.from({ length: 11 }, (_, index) => ({
      id: `slide-${index}`,
      type: 'text',
      title: 'A valid title',
      points: ['A valid point'],
    }));
    expect(presentationSessionSchema.safeParse(tooMany).success).toBe(false);
    const staleHistory = structuredClone(qa.session);
    staleHistory.history[0].revision = staleHistory.revision;
    expect(presentationSessionSchema.safeParse(staleHistory).success).toBe(false);
    const incompleteHistory = { ...qa.session, history: [{ revision: 1, deck: qa.session.deck }] };
    expect(presentationSessionSchema.safeParse(incompleteHistory).success).toBe(false);
  });

  it('uses parameterized owner-scoped v2 records and keeps absolute source bindings and image bytes out of cloud queries', async () => {
    const qa = await fixture(true);
    const privateBrief = 'A private raw brief used only to verify the local storage boundary.';
    const briefHash = createHash('sha256').update(privateBrief).digest('hex');
    qa.session.briefRef = { filename: 'brief.txt', sha256: briefHash };
    qa.manifest.briefRef = qa.session.briefRef;
    qa.manifest.originalBriefBinding = { path: path.join(qa.root, 'brief.txt'), sha256: briefHash };
    qa.session.orderedDeck.title =
      'Cyber Monday campaign for an accessible community presentation and a detailed review';
    qa.session.deck = legacyDeckProjection(qa.session.orderedDeck);
    expect(qa.session.deck.title).not.toBe(qa.session.orderedDeck.title);
    const saved = await qa.store.save(qa.session, qa.manifest, signal());
    expect(saved.provider).toBe('neon');
    const insert = query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT'))!;
    expect(insert[0]).toContain('owner_id');
    expect(insert[0]).toContain('$6::jsonb');
    expect(insert[1][0]).toBe(qa.cfg.owner);
    expect(insert[1][2]).toBe(2);
    expect(insert[1][3]).toBe(qa.session.orderedDeck.title);
    const cloud = JSON.parse(insert[1][5]);
    expect(cloud.orderedDeck).toEqual(qa.session.orderedDeck);
    expect(JSON.stringify(insert)).not.toContain(qa.root);
    expect(JSON.stringify(insert)).not.toContain('sourceBindings');
    expect(JSON.stringify(insert)).not.toContain('originalBriefBinding');
    expect(JSON.stringify(insert)).not.toContain(privateBrief);
    expect(JSON.stringify(insert)).not.toContain(qa.image.toString('base64'));
    expect((await qa.store.list(signal())).projects).toEqual([
      expect.objectContaining({ title: qa.session.orderedDeck.title, id: qa.session.id }),
    ]);
    expect((await qa.store.load(qa.session.id, signal()))?.session).toEqual(qa.session);
    expect((await qa.store.load(qa.session.id, signal()))?.local?.originalBriefBinding).toEqual(
      qa.manifest.originalBriefBinding,
    );
  });

  it('lists and reloads migrated V3 sessions after a verified cloud save', async () => {
    const qa = await fixture(true);
    const session = migratePresentationSessionV3(qa.session);
    const saved = await qa.store.save(session, { ...qa.manifest, schemaVersion: 3 }, signal());
    expect(saved.provider).toBe('neon');
    const reopened = new PresentationStore(qa.cfg);
    expect((await reopened.list(signal())).projects).toEqual([
      expect.objectContaining({ id: session.id, title: session.orderedDeck.title }),
    ]);
    expect((await reopened.load(session.id, signal()))?.session).toEqual(session);
    expect(query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT'))?.[1][2]).toBe(3);
  });

  it('accepts manifests without original brief bindings and rejects mismatched or nonabsolute private bindings', async () => {
    const qa = await fixture();
    expect(presentationLocalManifestSchema.safeParse(qa.manifest).success).toBe(true);
    const hash = 'a'.repeat(64);
    const manifest = {
      ...qa.manifest,
      briefRef: { filename: 'brief.txt', sha256: hash },
      originalBriefBinding: { path: path.join(qa.root, 'brief.txt'), sha256: hash },
    };
    expect(presentationLocalManifestSchema.safeParse(manifest).success).toBe(true);
    for (const binding of [
      { path: 'brief.txt', sha256: hash },
      { path: path.join(qa.root, 'brief.txt'), sha256: 'b'.repeat(64) },
    ])
      expect(
        presentationLocalManifestSchema.safeParse({ ...manifest, originalBriefBinding: binding })
          .success,
      ).toBe(false);
    expect(
      presentationSessionSchema.safeParse({
        ...qa.session,
        originalBriefBinding: manifest.originalBriefBinding,
      }).success,
    ).toBe(false);
  });

  it.each(['cover', 'chart', 'history', 'caption'])(
    'keeps a private path in a v2 %s field local',
    async (field) => {
      const qa = await fixture(true);
      const privatePath = path.join(qa.root, 'campaign.png');
      if (field === 'cover') (qa.session.orderedDeck.slides[0] as any).subtitle = privatePath;
      if (field === 'chart')
        (qa.session.orderedDeck.slides[3] as any).chart.provenance.queryRef = privatePath;
      if (field === 'history')
        (qa.session.history[0].orderedDeck.slides[1] as any).points = [privatePath];
      if (field === 'caption') {
        delete (qa.session.orderedDeck.slides[0] as any).imageId;
        qa.session.orderedDeck.slides[1] = {
          id: 'image',
          type: 'image',
          title: 'Campaign image',
          imageId: 1,
          caption: privatePath,
          layout: 'large',
        };
      }
      const saved = await qa.store.save(qa.session, qa.manifest, signal());
      expect(saved.provider).toBe('local');
      expect(saved.warning).toContain('local file path');
      expect(neon).not.toHaveBeenCalled();
    },
  );

  it('requires a source rebind when cloud source hashes change and rejects changed same-laptop bytes', async () => {
    const qa = await fixture(true);
    const saved = await qa.store.save(qa.session, qa.manifest, signal());
    const row = remote.get(`${qa.cfg.owner}:${qa.session.id}`)!;
    row.body.sources[0].sha256 = 'a'.repeat(64);
    row.updated_at = new Date(Date.parse(saved.updatedAt) + 1000).toISOString();
    const loaded = await qa.store.load(qa.session.id, signal());
    expect(loaded?.local).toBeNull();
    expect(loaded?.warning).toContain('source folder');
    await writeFile(
      path.join(qa.root, 'campaign.png'),
      Buffer.concat([qa.image, Buffer.from('changed')]),
    );
    await expect(
      restoreDeckSources(qa.root, qa.session.sources, undefined, signal()),
    ).rejects.toThrow(/changed since/i);
    expect(query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT'))).toHaveLength(1);
  });

  it('rejects bytes and paths in cloud source metadata and invalid private source bindings', async () => {
    const qa = await fixture();
    expect(
      presentationSessionSchema.safeParse({
        ...qa.session,
        sources: [{ ...qa.session.sources[0], data: qa.image.toString('base64') }],
      }).success,
    ).toBe(false);
    expect(
      presentationSessionSchema.safeParse({
        ...qa.session,
        sourceBindings: qa.manifest.sourceBindings,
      }).success,
    ).toBe(false);
    for (const bindings of [
      [{ id: 1, path: 'relative/campaign.png' }],
      [{ id: 2, path: path.join(qa.root, 'campaign.png') }],
      [qa.manifest.sourceBindings![0], qa.manifest.sourceBindings![0]],
    ])
      expect(
        presentationLocalManifestSchema.safeParse({ ...qa.manifest, sourceBindings: bindings })
          .success,
      ).toBe(false);
  });
});
