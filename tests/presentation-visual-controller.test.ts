import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import * as interpreter from '../server/computer/presentation-intent';
import * as planning from '../server/computer/presentation-deck';
import * as sourceLoader from '../server/computer/presentation-project';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationOperation } from '../shared/presentation-intent';
import { materializeFlowchart } from '../shared/presentation-flowchart';
import JSZip from 'jszip';

const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => { for (const c of controllers.splice(0)) await c.close(); vi.restoreAllMocks(); });
const seed: OrderedPresentationDeck = { schemaVersion: 2, title: 'Community campaign', theme: 'blue', textScale: 1, allowImageReuse: false, slides: [
  { id: 'cover', type: 'cover', title: 'Community campaign', subtitle: 'A proposed plan with community review.' },
  { id: 'picture', type: 'image', title: 'Review materials', imageId: 1, layout: 'split', caption: 'Illustration supplied for this test.', points: ['Ask community members to review the proposed materials before publication.', 'Record feedback so the team can address the concerns.'] },
  { id: 'details', type: 'text', title: 'Next steps', points: ['Decide which changes will address the recorded concerns before approval.', 'Share the revised draft with the community before publication.', 'Keep a record of the decisions for future reviews.'] },
] };
async function fixture(initial = seed) {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-visual-controller-'));
  const cfg = { ...config(), localDir, owner: 'isolated-visual-test', hfToken: 'mock-only', cloudUrl: '', neonUrl: '', dbToken: '' };
  const canvas = createCanvas(100, 60), context = canvas.getContext('2d'); context.fillStyle = '#2288aa'; context.fillRect(0, 0, 100, 60);
  const bytes = canvas.toBuffer('image/png'), data = `data:image/png;base64,${bytes.toString('base64')}`;
  await writeFile(path.join(localDir, 'sample.png'), bytes);
  const controller = new ComputerController(cfg); controllers.push(controller); await controller.init();
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => { await promote(); return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] }; });
  await (controller as any).savePictureDeck(legacyDeckProjection(initial), { root: localDir, assets: [{ id: 1, filename: 'sample.png', width: 100, height: 60, description: 'A synthetic blue rectangle for testing.', data, preview: data, sha256: createHash('sha256').update(bytes).digest('hex') }], brief: '', briefName: null }, signal(), 1, false, [], 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', undefined, structuredClone(initial));
  const interpret = vi.spyOn(interpreter, 'interpretPresentationTurn');
  async function request(operations: PresentationOperation[]) {
    interpret.mockResolvedValueOnce({ kind: 'request', domain: 'presentation', startsNewTask: false, awaitingContinuation: false, fields: { open: false }, operations });
    return controller.request(`Isolated typed visual action ${crypto.randomUUID()}`, signal());
  }
  return { controller, request, localDir, deck: () => structuredClone(controller.snapshot().presentation!.project!.orderedDeck!) };
}

it('moves a picture, resizes only the title, reads saved evidence and undoes in one working file', async () => {
  const qa = await fixture(), before = qa.controller.snapshot().presentation!;
  const result = await qa.request([{ type: 'set_layout', target: 2, layout: 'image-left' }, { type: 'resize_title', target: 2, direction: 'larger' }]);
  expect(result.taskStatus).not.toBe('failed');
  expect(result.state.presentation?.filename).toBe(before.filename);
  expect(result.state.presentation?.project?.revision).toBe(before.project!.revision + 1);
  expect(result.changes).toHaveLength(1);
  expect(qa.deck().slides[1]).toMatchObject({ imageSide: 'left', titleScale: 1.1, points: seed.slides[1].type === 'image' ? seed.slides[1].points : [] });
  expect(qa.deck().slides.filter(s => s.id !== 'picture')).toEqual(seed.slides.filter(s => s.id !== 'picture'));
  const read = await qa.request([{ type: 'describe_layout', target: 2 }]);
  expect(read.summary).toContain('saved slide'); expect(read.summary).toContain('33-point title'); expect(read.summary).toContain('picture is on the left');
  expect(read.summary).not.toContain('verified slide');
  expect(read.state.presentation?.project?.revision).toBe(before.project!.revision + 1);
  await qa.request([{ type: 'undo' }]);
  expect(qa.deck().slides).toEqual(seed.slides);
  expect(qa.controller.snapshot().presentation?.filename).toBe(before.filename);
});

it('shortens content and changes columns as one transaction with one undo', async () => {
  const qa = await fixture();
  vi.spyOn(planning, 'reviseOrderedSlide').mockImplementation(async (deck, id) => ({ ...deck, slides: deck.slides.map(slide => slide.id === id && slide.type === 'text' ? { ...slide, points: ['Review the proposed changes with community members before publication.', 'Record each decision so future reviewers can understand its purpose.'] } : slide) }));
  const before = qa.controller.snapshot().presentation!;
  const result = await qa.request([{ type: 'revise_slide', target: 3, instruction: 'Shorten the text.', detailChange: 'shorten' }, { type: 'set_layout', target: 3, layout: 'two-column' }]);
  expect(result.state.presentation?.project?.revision).toBe(before.project!.revision + 1);
  expect(result.changes).toHaveLength(1);
  expect(qa.deck().slides[2]).toMatchObject({ layout: 'two-column' });
  expect((await qa.request([{ type: 'describe_layout', target: 3 }])).summary).toContain('left column from top to bottom, then the right');
  await qa.request([{ type: 'undo' }]);
  expect(qa.deck().slides).toEqual(seed.slides);
});

it('keeps the deck and exact file unchanged when a large picture would hide words', async () => {
  const qa = await fixture(), before = qa.controller.snapshot().presentation!;
  const bytes = (await qa.controller.presentationExport()).bytes;
  await expect(qa.request([{ type: 'set_layout', target: 2, layout: 'large-image' }])).rejects.toThrow('hide the existing paragraphs');
  expect(qa.controller.snapshot().presentation?.sha256).toBe(before.sha256);
  expect(qa.controller.snapshot().presentation?.project?.revision).toBe(before.project!.revision);
  expect((await qa.controller.presentationExport()).bytes).toEqual(bytes);
});

it('does not describe geometry from a file changed outside Insight', async () => {
  const qa = await fixture(), before = qa.controller.snapshot().presentation!;
  await writeFile(path.join(qa.localDir, before.filename), 'Externally changed file.');
  await expect(qa.request([{ type: 'describe_layout', target: 2 }])).rejects.toThrow('edited outside Insight');
  await expect(qa.controller.presentationLayout()).rejects.toThrow('edited outside Insight');
  expect(qa.deck().slides).toEqual(seed.slides);
});

it('returns hash-matched scenes and accurate measured appearance for graphs, processes and charts', async () => {
  const mixed = structuredClone(seed);
  mixed.slides.push({ id: 'graph', type: 'flowchart', title: 'Campaign approval', graph: materializeFlowchart({ orientation: 'vertical', nodes: [
    { ref: 'start', kind: 'start', label: 'Submit' }, { ref: 'decision', kind: 'decision', label: 'Approved?' }, { ref: 'yes', kind: 'end', label: 'Launch' }, { ref: 'no', kind: 'end', label: 'Revise' },
  ], edges: [{ from: 'start', to: 'decision' }, { from: 'decision', to: 'yes', branchLabel: 'Approved' }, { from: 'decision', to: 'no', branchLabel: 'Rejected' }] }) },
  { id: 'process', type: 'process', title: 'Project stages', stages: [{ label: 'Prepare', detail: 'Gather the source material.' }, { label: 'Review', detail: 'Check the proposed message.' }, { label: 'Share', detail: 'Publish the approved version.' }] },
  { id: 'chart', type: 'chart', title: 'Sample revenue', chart: { labels: ['North', 'South'], series: [{ name: 'Prior', values: [20, 30] }, { name: 'Current', values: [25, 40] }], unit: 'USD', provenance: { datasetId: 'synthetic-test', revision: 1, verifiedAt: '2026-10-11T00:00:00.000Z', provider: 'local', summary: 'Synthetic test values.' } } });
  const qa = await fixture(mixed);
  const preview = await qa.controller.presentationLayout();
  expect(preview.scenes.map(scene => scene.slideId)).toEqual(mixed.slides.map(slide => slide.id));
  expect(preview.sha256).toBe(qa.controller.snapshot().presentation!.sha256);
  await expect(qa.controller.presentationLayout({ sha256: preview.sha256, projectId: 'cccccccc-cccc-4ccc-bccc-cccccccccccc' })).rejects.toThrow('different presentation revision');
  await expect(qa.controller.presentationImage(1, { sha256: preview.sha256, projectId: 'cccccccc-cccc-4ccc-bccc-cccccccccccc' })).rejects.toThrow('different presentation revision');
  const image = await qa.controller.presentationImage(1, { sha256: preview.sha256, projectId: preview.projectId });
  expect(image.byteLength).toBeGreaterThan(0);
  expect(JSON.stringify(preview)).not.toContain(qa.localDir);
  const graph = (await qa.request([{ type: 'describe_layout', target: 4 }])).summary;
  expect(graph).toContain('saved slide'); expect(graph).toContain('lane'); expect(graph).toContain('Approved');
  expect((await qa.request([{ type: 'describe_layout', target: 5 }])).summary).toContain('3 stages run left to right');
  expect((await qa.request([{ type: 'describe_layout', target: 6 }])).summary).toContain('cannot certify their internal pixel positions');
  const zip = await JSZip.loadAsync((await qa.controller.presentationExport()).bytes);
  const xml = await zip.file('ppt/slides/slide5.xml')!.async('string');
  expect(xml).toContain('process-stage-1-label');
  expect(xml).toContain('x="685800" y="2331720"'); // measured .75in/2.55in label position
});

it('edits a picture alternate description, exports it, persists it and undoes without changing visible content', async () => {
  const qa = await fixture();
  const before = qa.controller.snapshot().presentation!;
  const description = 'A turquoise rectangle representing a proposed campaign banner.';
  expect((await qa.request([{ type: 'describe_image', target: 2 }])).summary).toContain('AI-generated');
  await qa.request([{ type: 'edit_image_description', target: 2, description }]);
  expect(qa.deck().slides[1]).toEqual({ ...seed.slides[1], imageDescription: description });
  expect(qa.controller.snapshot().presentation!.filename).toBe(before.filename);
  expect((await qa.request([{ type: 'describe_image', target: 2 }])).summary).toContain(`Your supplied picture description: ${description}`);
  const zip = await JSZip.loadAsync((await qa.controller.presentationExport()).bytes);
  expect(await zip.file('ppt/slides/slide2.xml')!.async('string')).toContain(description);
  expect(await zip.file('ppt/notesSlides/notesSlide2.xml')!.async('string')).toContain('User-provided image description');
  const saved = await qa.request([{ type: 'save' }]);
  expect(saved.state.presentation?.project?.saved?.verified).toBe(true);
  await qa.controller.resumePresentation(saved.state.presentation!.project!.saved!.id, signal(), { open: false });
  expect(qa.deck().slides[1]).toMatchObject({ imageDescription: description });
  await qa.request([{ type: 'undo' }]);
  expect(qa.deck()).toEqual(seed);
});

it('binds corrected descriptions to image bytes and restores them with image replacement undo', async () => {
  const qa = await fixture(), description = 'A turquoise rectangle supplied for a campaign.';
  await qa.request([{ type: 'edit_image_description', target: 2, description }]);
  const original = structuredClone((qa.controller as any).pictureSources);
  const loader = vi.spyOn(sourceLoader, 'loadDeckSources').mockResolvedValue(original);
  await (qa.controller as any).insertOrderedImage(qa.localDir, 2, 'same', signal(), false);
  expect(qa.deck().slides[1]).toMatchObject({ imageDescription: description });
  const canvas = createCanvas(100, 60), context = canvas.getContext('2d'); context.fillStyle = '#eeaa22'; context.fillRect(0, 0, 100, 60);
  const bytes = canvas.toBuffer('image/png'), data = `data:image/png;base64,${bytes.toString('base64')}`;
  await writeFile(path.join(qa.localDir, 'second.png'), bytes);
  loader.mockResolvedValue({ ...original, assets: [{ ...original.assets[0], filename: 'second.png', data, preview: data, description: 'A gold rectangle for a second campaign.', sha256: createHash('sha256').update(bytes).digest('hex') }] });
  await (qa.controller as any).insertOrderedImage(qa.localDir, 2, 'different', signal(), false);
  expect(qa.deck().slides[1]).not.toHaveProperty('imageDescription');
  const read = (await qa.request([{ type: 'describe_image', target: 2 }])).summary;
  expect(read).toContain('AI-generated picture description'); expect(read).toContain('A gold rectangle');
  await qa.request([{ type: 'undo' }]);
  expect(qa.deck().slides[1]).toMatchObject({ imageDescription: description, imageId: 1 });
});

it('rejects a layout request if project identity changes during export verification', async () => {
  const qa = await fixture(), before = qa.controller.snapshot().presentation!;
  const saved = await qa.controller.presentationExport();
  vi.spyOn(qa.controller, 'presentationExport').mockImplementationOnce(async () => {
    (qa.controller as any).pictureProjectId = 'cccccccc-cccc-4ccc-bccc-cccccccccccc';
    return saved;
  });
  await expect(qa.controller.presentationLayout({ projectId: before.projectId!, sha256: before.sha256 })).rejects.toThrow('changed before the preview');
});
