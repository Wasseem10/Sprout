import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { loadImage } from '@napi-rs/canvas';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import {
  assertOrderedDeckFits, PresentationRevisionError, reviseOrderedSlide, writeOrderedDeck,
} from '../server/computer/presentation-deck';
import {
  PresentationCapacityRecoveryError, splitPresentationRevision,
} from '../server/computer/presentation-capacity';
import type { OrderedPresentationDeck, OrderedPresentationSlide } from '../shared/presentation-deck';
import type { DeckSources } from '../server/computer/presentation-project';

vi.mock('../server/computer/planner', () => ({ chat: vi.fn() }));
const chatMock = vi.mocked(chat);
const cfg = { ...config(), hfToken: 'test', cloudUrl: '' };
const sources: DeckSources = { root: 'isolated-capacity-recovery', brief: 'Explain the supplied observations.', briefName: null, assets: [] };
const expandedPoints = [
  'Across 12 observations, dogs used tail, ear and body movements to signal feelings.',
  'Tail direction and speed can convey different emotional states and social intentions toward nearby people and animals. Consider the complete body posture alongside the tail instead of relying on an isolated movement.',
  'Forward ears indicate attention and interest in nearby activity, demonstrating awareness of changing surroundings. Follow where the dog directs its attention and note how that focus changes as the environment changes.',
  'Loose body posture and an open mouth can indicate calmness and contentment instead of stress. Compare these signs with the situation and allow space when a dog chooses to move away from an interaction.',
];
const additiveCapacityPoints = expandedPoints.slice(0, 3);
function deck(title = 'Communication Signals'): OrderedPresentationDeck {
  return {
    schemaVersion: 2, title: 'Understanding Pet Behavior', theme: 'blue', textScale: 1, allowImageReuse: false,
    slides: [
      { id: 'cover', type: 'cover', title: 'Understanding Pet Behavior', subtitle: 'Learn to observe familiar animals.' },
      { id: 'signals', type: 'text', title, textScale: 1.1, points: expandedPoints.slice(0, 2) },
      { id: 'space', type: 'text', title: 'Respect Their Space', points: ['Let pets move away when they want a break.'] },
    ],
  };
}
async function capacityFailure(original: OrderedPresentationDeck, target = 'signals'): Promise<PresentationRevisionError> {
  expect(() => assertOrderedDeckFits(original)).not.toThrow();
  chatMock.mockResolvedValue(JSON.stringify({ afterPoint: 1, explanation: expandedPoints[2] }));
  try {
    await reviseOrderedSlide(original, target, 'Explain these observations further.', sources, cfg, new AbortController().signal, { detailChange: 'expand' });
  } catch (error) {
    expect(error).toBeInstanceOf(PresentationRevisionError);
    expect(error).toMatchObject({ code: 'layout_capacity', measurements: { candidateFits: false } });
    return error as PresentationRevisionError;
  }
  throw new Error('Expected the expanded slide to exceed its measured layout.');
}
beforeEach(() => chatMock.mockReset());

it('splits a validated expansion into editable slides without dropping any point, changing fonts or losing the existing picture', async () => {
  const original = deck();
  const imageBytes = await readFile(path.resolve('artifacts/workspace.png'));
  const image = await loadImage(imageBytes);
  const withPicture: DeckSources = { ...sources, assets: [{ id: 1, filename: 'workspace.png', description: 'Original picture',
    sha256: createHash('sha256').update(imageBytes).digest('hex'), data: `data:image/png;base64,${imageBytes.toString('base64')}`,
    preview: '', width: image.width, height: image.height }] };
  original.slides[0] = { ...original.slides[0], type: 'cover', subtitle: 'Learn to observe familiar animals.', imageId: 1 };
  const before = structuredClone(original);
  const directory = await mkdtemp(path.join(tmpdir(), 'insight-split-'));
  const oldFile = path.join(directory, 'original.pptx');
  await writeOrderedDeck(original, withPicture, oldFile);
  const oldBytes = await readFile(oldFile);
  const failure = await capacityFailure(original);
  expect(failure.validatedCandidate).toMatchObject({ id: 'signals', type: 'text', textScale: 1.1, points: additiveCapacityPoints });
  const recovered = splitPresentationRevision(original, failure, 'signals-continuation');
  expect(recovered).toEqual(splitPresentationRevision(original, failure, 'signals-continuation'));
  expect(chatMock).toHaveBeenCalledTimes(2); // Recovery adds no model request.
  expect(recovered.slides.map(slide => slide.id)).toEqual(['cover', 'signals', 'signals-continuation', 'space']);
  expect(recovered.slides[1].title).toBe(original.slides[1].title);
  expect(recovered.slides[2].title).toBe(`${original.slides[1].title} (continued)`);
  expect(recovered.slides.slice(1, 3).flatMap(slide => slide.type === 'text' ? slide.points : [])).toEqual(additiveCapacityPoints);
  expect(recovered.slides.slice(1, 3).map(slide => slide.textScale)).toEqual([1.1, 1.1]);
  expect(recovered.slides[0]).toEqual(before.slides[0]);
  expect(recovered.slides[3]).toEqual(before.slides[2]);
  expect(original).toEqual(before);
  expect(await readFile(oldFile)).toEqual(oldBytes);
  expect(() => assertOrderedDeckFits(recovered)).not.toThrow();

  const output = path.join(directory, 'recovered.pptx');
  await writeOrderedDeck(recovered, withPicture, output);
  const zip = await JSZip.loadAsync(await readFile(output));
  const slideXml = await Promise.all([2, 3].map(index => zip.file(`ppt/slides/slide${index}.xml`)!.async('string')));
  for (const point of additiveCapacityPoints) expect(slideXml.filter(xml => xml.includes(point))).toHaveLength(1);
  for (const xml of slideXml) { expect(xml).toContain('<p:sp>'); expect(xml).toContain('sz="2640"'); expect(xml).not.toContain('sz="2160"'); }
  const media = await Promise.all(Object.values(zip.files).filter(file => /^ppt\/media\/.*\.png$/.test(file.name)).map(file => file.async('nodebuffer')));
  expect(media.some(bytes => bytes.equals(imageBytes))).toBe(true);
  expect(await zip.file('ppt/slides/slide4.xml')!.async('string')).toContain('Let pets move away when they want a break.');
});

it('supports an existing summary and insertion as the tenth slide without special phrase rules', async () => {
  const original = deck('Summary');
  while (original.slides.length < 9) original.slides.push({ id: `other-${original.slides.length}`, type: 'text', title: 'A separate topic', points: ['Keep this original supporting information unchanged.'] });
  const failure = await capacityFailure(original);
  const recovered = splitPresentationRevision(original, failure, 'summary-continuation');
  expect(recovered.slides).toHaveLength(10);
  expect(recovered.slides[2].title).toBe('Summary (continued)');
  expect(recovered.slides.slice(3)).toEqual(original.slides.slice(2));
});

it('rejects an eleventh slide instead of dropping existing content', async () => {
  const original = deck();
  while (original.slides.length < 10) original.slides.push({ id: `other-${original.slides.length}`, type: 'text', title: 'A separate topic', points: ['Keep this original supporting information unchanged.'] });
  const before = structuredClone(original), failure = await capacityFailure(original);
  expect(() => splitPresentationRevision(original, failure, 'continuation')).toThrow(PresentationCapacityRecoveryError);
  try { splitPresentationRevision(original, failure, 'continuation'); } catch (error) { expect(error).toMatchObject({ code: 'deck_limit', changed: false }); }
  expect(original).toEqual(before);
});

it('binds recovery to the original content and font while allowing stable-ID reorder and unrelated changes', async () => {
  const original = deck(), failure = await capacityFailure(original);
  const moved = { ...original, slides: [original.slides[2], original.slides[0], original.slides[1]] };
  const recovered = splitPresentationRevision(moved, failure, 'continuation');
  expect(recovered.slides.map(slide => slide.id)).toEqual(['space', 'cover', 'signals', 'continuation']);
  for (const stale of [
    { ...original, textScale: 1.05 },
    { ...original, slides: original.slides.map(slide => slide.id === 'signals' ? { ...slide, title: 'Changed topic' } : slide) },
  ]) {
    try { splitPresentationRevision(stale, failure, 'continuation'); throw new Error('Unexpected recovery'); }
    catch (error) { expect(error).toMatchObject({ code: 'stale_revision', changed: false }); }
  }
});

it('never exposes an invalid, fact-changing or directionally wrong candidate as capacity recovery', async () => {
  const original = deck();
  for (const candidate of [
    { afterPoint: 0, explanation: 'Too much text '.repeat(40) },
    { afterPoint: 0, explanation: 'Across 15 observations, the dogs showed how nearby activity can influence their attention and posture.' },
    { afterPoint: 0, explanation: expandedPoints[0] },
  ]) {
    chatMock.mockResolvedValue(JSON.stringify(candidate));
    try {
      await reviseOrderedSlide(original, 'signals', 'Add more explanation.', sources, cfg, new AbortController().signal, { detailChange: 'expand' });
      throw new Error('Unexpected revision');
    } catch (error) {
      expect(error).toBeInstanceOf(PresentationRevisionError);
      expect((error as PresentationRevisionError).validatedCandidate).toBeUndefined();
      expect((error as PresentationRevisionError).recoveryBaseline).toBeUndefined();
      expect(() => splitPresentationRevision(original, error as PresentationRevisionError, 'continuation')).toThrow('no validated extra detail');
    }
  }
});

it('offers only the earlier validated candidate when the final repair violates factual checks', async () => {
  const original = deck();
  chatMock.mockResolvedValueOnce(JSON.stringify({ afterPoint: 1, explanation: expandedPoints[2] }))
    .mockResolvedValueOnce(JSON.stringify({ afterPoint: 0, explanation: 'These 15 observations show how context can help observers interpret signals without relying on isolated movements.' }));
  await expect(reviseOrderedSlide(original, 'signals', 'Explain further.', sources, cfg, new AbortController().signal, { detailChange: 'expand' }))
    .rejects.toMatchObject({ code: 'layout_capacity', validatedCandidate: { points: additiveCapacityPoints }, recoveryBaseline: { originalSlide: original.slides[1] } });
});

it('honestly refuses a valid expansion whose complete paragraphs need more than two readable slides', async () => {
  const original = deck(), before = structuredClone(original);
  const points = [...expandedPoints,
    'Observe familiar behavior over time to understand individual differences without assuming that each movement has a universal meaning. Consider the combination of posture, ears, tail and surrounding activity before reacting.'];
  // Exercise the split algorithm with a validated oversized snapshot, independently
  // of the now-additive editor (which cannot replace the source with five new points).
  const basis = await capacityFailure(original);
  const failure = new PresentationRevisionError('layout_capacity', 'signals', 'expand', 2, basis.measurements, new Error('validated split fixture'), {
    originalSlide: original.slides[1], candidateSlide: { id: 'signals', type: 'text', title: original.slides[1].title, textScale: 1.1, points }, deckTextScale: 1,
  });
  expect(failure?.validatedCandidate).toMatchObject({ points });
  try { splitPresentationRevision(original, failure!, 'continuation'); throw new Error('Unexpected recovery'); }
  catch (error) { expect(error).toMatchObject({ code: 'no_fitting_split', changed: false }); }
  expect(original).toEqual(before);
});

it('refuses to split picture layouts or cut an indivisible overwide point', async () => {
  const original = deck(), failure = await capacityFailure(original);
  const imageDeck = deck();
  imageDeck.slides[1] = { id: 'signals', type: 'image', title: 'Communication Signals', imageId: 1, layout: 'split', caption: 'An original picture.', points: ['Keep the original picture.'] };
  const imageFailure = new PresentationRevisionError('layout_capacity', 'signals', 'expand', 2, failure.measurements, new Error('fixture'), {
    originalSlide: imageDeck.slides[1], candidateSlide: { ...imageDeck.slides[1], points: expandedPoints }, deckTextScale: 1,
  });
  expect(() => splitPresentationRevision(imageDeck, imageFailure, 'continuation')).toThrow('text and summary slides');
  const indivisible = new PresentationRevisionError('layout_capacity', 'signals', 'expand', 2, failure.measurements, new Error('fixture'), {
    originalSlide: original.slides[1], candidateSlide: { id: 'signals', type: 'text', title: original.slides[1].title, textScale: original.slides[1].textScale, points: ['W'.repeat(200), 'Keep this second complete idea intact.'] }, deckTextScale: 1,
  });
  expect(() => splitPresentationRevision(original, indivisible, 'continuation')).toThrow('complete points do not fit');
});

it.each(['signals', '', '../continuation'])('rejects invalid or existing continuation identity %j', async continuationId => {
  const original = deck(), failure = await capacityFailure(original);
  try { splitPresentationRevision(original, failure, continuationId); throw new Error('Unexpected recovery'); }
  catch (error) { expect(error).toMatchObject({ code: 'invalid_continuation_id', changed: false }); }
});
