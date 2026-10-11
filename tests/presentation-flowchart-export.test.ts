import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { config } from '../server/config';
import { PresentationStore } from '../server/providers/presentationStore';
import {
  assertOrderedDeckFits,
  reviseOrderedSlide,
  writeOrderedDeck,
} from '../server/computer/presentation-deck';
import { prepareOrderedFlowchart } from '../server/computer/presentation-flowchart-export';
import {
  legacyDeckProjection,
  orderedPresentationDeckSchema,
  orderedSlideText,
  type OrderedPresentationDeck,
} from '../shared/presentation-deck';
import {
  applyFlowchartPatch,
  narrateFlowchart,
  validateFlowchart,
  type Flowchart,
} from '../shared/presentation-flowchart';
import {
  migratePresentationSession,
  presentationSessionSchema,
  type PresentationSessionV2,
} from '../shared/presentation-session';
import type { DeckSources } from '../server/computer/presentation-project';

const signal = () => new AbortController().signal;
function graph(): Flowchart {
  return validateFlowchart({
    orientation: 'vertical',
    nodes: [
      { id: 'start', kind: 'start', label: 'Prepare campaign' },
      { id: 'decision', kind: 'decision', label: 'Campaign approved?' },
      { id: 'launch', kind: 'process', label: 'Launch' },
      { id: 'revise', kind: 'process', label: 'Revise campaign' },
      { id: 'record', kind: 'process', label: 'Record outcome' },
      { id: 'finish', kind: 'end', label: 'Finish' },
    ],
    edges: [
      { id: 'e0', from: 'start', to: 'decision' },
      { id: 'e1', from: 'decision', to: 'launch', branchLabel: 'Approved' },
      { id: 'e2', from: 'decision', to: 'revise', branchLabel: 'Rejected' },
      { id: 'e3', from: 'launch', to: 'record' },
      { id: 'e4', from: 'revise', to: 'record' },
      { id: 'e5', from: 'record', to: 'finish' },
    ],
  });
}
function deck(): OrderedPresentationDeck {
  return orderedPresentationDeckSchema.parse({
    schemaVersion: 2,
    title: 'Campaign review',
    theme: 'blue',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      {
        id: 'cover',
        type: 'cover',
        title: 'Campaign review',
        subtitle: 'A proposed campaign approval workflow',
      },
      {
        id: 'context',
        type: 'text',
        title: 'A clear decision',
        points: [
          'Review the campaign before launch so both approval and revision have an explicit next step.',
        ],
      },
      {
        id: 'review-diagram',
        type: 'flowchart',
        title: 'Campaign approval process',
        graph: graph(),
      },
    ],
  });
}
const sources: DeckSources = {
  root: '',
  assets: [],
  brief: '',
  briefName: null,
  originalRequest: 'Campaign review',
};
function revisedDeck() {
  const result = deck(),
    slide = result.slides[2];
  if (slide.type !== 'flowchart') throw new Error('Missing fixture graph.');
  slide.graph = applyFlowchartPatch(
    slide.graph,
    { type: 'insertProcessOnEdge', edgeId: 'e1', label: 'Manual review' },
    (kind) => `${kind}-manual-review`,
  );
  return result;
}

describe('ordered graph persistence and native export foundation (no voice/controller routing)', () => {
  it('accepts additive V2 graph slides with stable identities and derives complete path readback', () => {
    const original = deck(),
      slide = original.slides[2];
    expect(
      presentationSessionSchema.safeParse({
        schemaVersion: 2,
        id: randomUUID(),
        revision: 1,
        deck: legacyDeckProjection(original),
        orderedDeck: original,
        sources: [],
        history: [],
      }).success,
    ).toBe(true);
    expect(slide.type).toBe('flowchart');
    expect(orderedSlideText(slide)).toEqual([slide.title, narrateFlowchart(graph())]);
    expect(orderedSlideText(slide).join(' ')).toContain(
      'If Rejected, follow Revise campaign, then Record outcome, then Finish.',
    );
    expect(orderedSlideText(slide).join(' ')).toContain('Both branches join at Record outcome.');
    expect(orderedPresentationDeckSchema.parse(JSON.parse(JSON.stringify(original)))).toEqual(
      original,
    );
  });

  it('validates graph topology in both the current ordered deck and undo history', () => {
    const original = deck(),
      current = revisedDeck();
    const session: PresentationSessionV2 = {
      schemaVersion: 2,
      id: randomUUID(),
      revision: 2,
      deck: legacyDeckProjection(current),
      orderedDeck: current,
      sources: [],
      history: [{ revision: 1, deck: legacyDeckProjection(original), orderedDeck: original }],
    };
    const parsed = presentationSessionSchema.parse(session);
    if (parsed.schemaVersion !== 2) throw new Error('Missing ordered session.');
    expect(parsed.orderedDeck).toEqual(session.orderedDeck);
    expect(parsed.history[0].orderedDeck).toEqual(session.history[0].orderedDeck);
    for (const target of ['current', 'history'] as const) {
      const broken = structuredClone(session);
      const slide =
        target === 'current'
          ? broken.orderedDeck.slides[2]
          : broken.history[0].orderedDeck.slides[2];
      if (slide.type !== 'flowchart') throw new Error('Missing fixture graph.');
      slide.graph.edges[0].to = 'missing-node';
      expect(presentationSessionSchema.safeParse(broken).success).toBe(false);
    }
  });

  it('rejects persisted scene caches and graph data under the legacy process type', () => {
    const original = deck(),
      asJson = JSON.parse(JSON.stringify(original));
    asJson.slides[2].scene = { elements: [], cached: true };
    expect(orderedPresentationDeckSchema.safeParse(asJson).success).toBe(false);
    delete asJson.slides[2].scene;
    asJson.slides[2].type = 'process';
    expect(orderedPresentationDeckSchema.safeParse(asJson).success).toBe(false);
  });

  it('retains ordinary version-two sessions without a graph or migration rewrite', () => {
    const original = deck();
    original.slides[2] = {
      id: 'legacy-process',
      type: 'process',
      title: 'Existing process',
      stages: [
        { label: 'Prepare', detail: 'Prepare the campaign for review.' },
        { label: 'Review', detail: 'Review it before publication.' },
        { label: 'Publish', detail: 'Publish the approved campaign.' },
      ],
    };
    const session: PresentationSessionV2 = {
      schemaVersion: 2,
      id: randomUUID(),
      revision: 1,
      deck: legacyDeckProjection(original),
      orderedDeck: original,
      sources: [],
      history: [],
    };
    expect(migratePresentationSession(session)).toEqual(session);
  });

  it('saves and restores exact graph identities and undo state through a fresh local store without inference', async () => {
    const localDir = await mkdtemp(path.join(tmpdir(), 'insight-graph-store-'));
    const cfg = {
      ...config(),
      localDir,
      neonUrl: '',
      hfToken: '',
      cloudUrl: '',
      owner: 'isolated-graph-test',
    };
    const original = deck(),
      current = revisedDeck();
    const session: PresentationSessionV2 = {
      schemaVersion: 2,
      id: randomUUID(),
      revision: 2,
      deck: legacyDeckProjection(current),
      orderedDeck: current,
      sources: [],
      history: [{ revision: 1, deck: legacyDeckProjection(original), orderedDeck: original }],
    };
    const saved = await new PresentationStore(cfg).save(
      session,
      { schemaVersion: 2, projectId: session.id, root: localDir, sources: [] },
      signal(),
    );
    expect(saved.provider).toBe('local');
    const loaded = await new PresentationStore(cfg).load(session.id, signal());
    expect(loaded?.session).toEqual(presentationSessionSchema.parse(session));
    if (loaded?.session.schemaVersion === 2) expect(loaded.session.orderedDeck).toEqual(current);
    expect(loaded?.local?.root).toBe(localDir);
    if (loaded?.session.schemaVersion !== 2) throw new Error('Missing ordered session.');
    expect(loaded.session.orderedDeck.slides[2].id).toBe(original.slides[2].id);
    expect(loaded.session.history[0].orderedDeck.slides[2]).toEqual(original.slides[2]);
  });

  it.each(['blue', 'light', 'dark'] as const)(
    'writes a mixed %s deck with editable graph shapes and finalized descriptions',
    async (theme) => {
      const localDir = await mkdtemp(path.join(tmpdir(), 'insight-graph-export-'));
      const input = deck();
      input.theme = theme;
      const before = structuredClone(input),
        file = path.join(localDir, 'mixed.pptx');
      await writeOrderedDeck(input, sources, file);
      expect(input).toEqual(before);
      const zip = await JSZip.loadAsync(await readFile(file));
      expect(
        Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)),
      ).toHaveLength(3);
      const xml = await zip.file('ppt/slides/slide3.xml')!.async('string');
      expect(xml).toContain('<a:prstGeom prst="diamond">');
      expect(xml.match(/<a:custGeom>/g)).toHaveLength(graph().edges.length);
      expect(xml).not.toContain('<p:pic>');
      expect(xml).not.toContain('<c:chart');
      expect(xml.match(/<a:t>Campaign approval process<\/a:t>/g)).toHaveLength(1);
      expect(xml).toContain('descr="Campaign approved?"');
      expect(xml).toContain('descr="Approved branch."');
      expect(xml).toContain('descr="Rejected branch."');
      expect(xml).toContain('review-diagram');
      const slide = input.slides[2];
      if (slide.type !== 'flowchart') throw new Error('Missing graph.');
      const scene = prepareOrderedFlowchart(slide, input);
      const presentation = await zip.file('ppt/presentation.xml')!.async('string');
      expect(presentation).toContain(
        `cx="${Math.round(scene.width * 914400)}" cy="${Math.round(scene.height * 914400)}"`,
      );
      const notes = await zip.file('ppt/notesSlides/notesSlide3.xml')!.async('string');
      expect(notes).toContain(
        'If Rejected, follow Revise campaign, then Record outcome, then Finish.',
      );
    },
  );

  it('regenerates graph geometry from updated topology while retaining other slide XML and stable graph identities', async () => {
    const localDir = await mkdtemp(path.join(tmpdir(), 'insight-graph-revision-'));
    const original = deck(),
      revised = revisedDeck();
    await writeOrderedDeck(original, sources, path.join(localDir, 'before.pptx'));
    await writeOrderedDeck(revised, sources, path.join(localDir, 'after.pptx'));
    const before = await JSZip.loadAsync(await readFile(path.join(localDir, 'before.pptx')));
    const after = await JSZip.loadAsync(await readFile(path.join(localDir, 'after.pptx')));
    for (const index of [1, 2])
      expect(await after.file(`ppt/slides/slide${index}.xml`)!.async('string')).toBe(
        await before.file(`ppt/slides/slide${index}.xml`)!.async('string'),
      );
    const xml = await after.file('ppt/slides/slide3.xml')!.async('string');
    expect(xml).toContain('descr="Manual review"');
    expect(xml.match(/<a:custGeom>/g)).toHaveLength(7);
    const originalFlow = original.slides[2],
      revisedFlow = revised.slides[2];
    if (originalFlow.type !== 'flowchart' || revisedFlow.type !== 'flowchart')
      throw new Error('Missing graph.');
    for (const node of originalFlow.graph.nodes)
      expect(revisedFlow.graph.nodes).toContainEqual(node);
    const notes = await after.file('ppt/notesSlides/notesSlide3.xml')!.async('string');
    expect(notes).toContain(
      'If Approved, follow Manual review, then Launch, then Record outcome, then Finish.',
    );
  });

  it('scopes native shape names to slide identity when two diagrams reuse local node IDs', async () => {
    const localDir = await mkdtemp(path.join(tmpdir(), 'insight-two-graphs-')),
      input = deck();
    input.slides.push({
      ...structuredClone(input.slides[2]),
      id: 'second-diagram',
      title: 'Second approval process',
    });
    await writeOrderedDeck(input, sources, path.join(localDir, 'two.pptx'));
    const zip = await JSZip.loadAsync(await readFile(path.join(localDir, 'two.pptx')));
    const one = await zip.file('ppt/slides/slide3.xml')!.async('string'),
      two = await zip.file('ppt/slides/slide4.xml')!.async('string');
    const names = (xml: string) =>
      [...xml.matchAll(/<p:cNvPr\b[^>]*name="([^"]+)"[^>]*descr=/g)].map((match) => match[1]);
    expect(names(one).length).toBeGreaterThan(10);
    expect(names(two).filter((name) => names(one).includes(name))).toEqual([]);
  });

  it('refuses overflowing graph labels before touching an existing output file and never shrinks font', async () => {
    const input = deck(),
      slide = input.slides[2];
    if (slide.type !== 'flowchart') throw new Error('Missing graph.');
    slide.graph.nodes[2].label = 'W'.repeat(60);
    expect(() => assertOrderedDeckFits(input)).toThrow();
    const localDir = await mkdtemp(path.join(tmpdir(), 'insight-graph-invalid-')),
      file = path.join(localDir, 'existing.pptx');
    await writeFile(file, 'existing output sentinel');
    await expect(writeOrderedDeck(input, sources, file)).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('existing output sentinel');
    expect(slide.textScale).toBeUndefined();
  });

  it('rejects general copy revision of graph slides before invoking a model', async () => {
    const input = deck(),
      before = structuredClone(input);
    await expect(
      reviseOrderedSlide(
        input,
        'review-diagram',
        'Change this flowchart',
        sources,
        { ...config(), hfToken: '', cloudUrl: '' },
        signal(),
      ),
    ).rejects.toThrow('validated graph operations');
    expect(input).toEqual(before);
  });
});
