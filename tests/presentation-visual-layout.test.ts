import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { orderedPresentationSlideSchema, type OrderedPresentationDeck, type OrderedPresentationSlide } from '../shared/presentation-deck';
import type { EditableVisualSlide, VisualText } from '../shared/presentation-visual-layout';
import {
  applyPresentationLayout, describeSlideLayout, describeSlideLayoutChange,
  inspectEditableSlideScene, layoutEditableSlide, renderEditableSlideScene, solidContrastRatio,
} from '../server/computer/presentation-visual-layout';
import { assertOrderedSlideFits, writeOrderedDeck } from '../server/computer/presentation-deck';
import type { DeckSources } from '../server/computer/presentation-project';
import { readPresentationLayoutScene } from '../server/computer/presentation-layout-manifest';

const style = { theme: 'blue' as const, textScale: 1 };
const text: EditableVisualSlide = { id: 'review', type: 'text', title: 'Campaign review', points: [
  'Ask community members to review the proposed draft before publication.',
  'Record specific accessibility concerns so the team can revise the draft.',
  'Publish the approved materials after checking the outstanding concerns.',
] };
const picture: EditableVisualSlide = { id: 'picture', type: 'image', title: 'Community planning', imageId: 1, layout: 'split', caption: 'An illustration of the proposed planning process.', points: [
  'Use the illustration to explain how the proposed process works.',
  'Keep the original source picture while adjusting its placement.',
] };
const bodies = (slide: EditableVisualSlide) => layoutEditableSlide(slide, style).elements.filter((e): e is VisualText => e.kind === 'text' && e.role === 'body');

describe('bounded visual layout controls', () => {
  it('retains exact old text and image geometry when optional fields are absent', () => {
    const original = layoutEditableSlide(text, style);
    expect(original.layout).toBe('single');
    expect(original.elements.find(e => e.kind === 'text' && e.role === 'title')).toMatchObject({ bounds: { x: .75, y: .5, width: 11.85, height: 1 }, fontSize: 30 });
    expect(bodies(text)[0]).toMatchObject({ bounds: { x: 1.65, y: 1.8, width: 10.6 }, fontSize: 24 });
    expect(layoutEditableSlide(picture, style).elements.find(e => e.kind === 'image')).toMatchObject({ side: 'right', bounds: { x: 6.85, y: 1.86, width: 5.65, height: 4.1 } });
    const explicit = applyPresentationLayout(picture, style, { layout: 'image-right' });
    expect(layoutEditableSlide(explicit, style).elements).toEqual(layoutEditableSlide(picture, style).elements);
  });

  it.each(['blue', 'light', 'dark'] as const)('moves the image to either side without changing words, source or body size in %s', theme => {
    const frozen = structuredClone(picture);
    const left = applyPresentationLayout(picture, { ...style, theme }, { layout: 'image-left' });
    const right = applyPresentationLayout(left, { ...style, theme }, { layout: 'image-right' });
    expect(picture).toEqual(frozen);
    expect(left).toEqual({ ...picture, imageSide: 'left' });
    expect(right).toEqual({ ...picture, imageSide: 'right' });
    const scene = layoutEditableSlide(left, { ...style, theme });
    expect(inspectEditableSlideScene(scene)).toEqual([]);
    expect(scene.elements.find(e => e.kind === 'image')?.bounds.x).toBe(.75);
    expect(scene.elements.find(e => e.kind === 'text' && e.role === 'body')).toMatchObject({ bounds: { x: 7.3 }, fontSize: 21 });
  });

  it('splits only between complete paragraphs and preserves left-then-right reading order', () => {
    const changed = applyPresentationLayout(text, style, { layout: 'two-column' });
    expect(changed).toEqual({ ...text, layout: 'two-column' });
    const scene = layoutEditableSlide(changed, style);
    const body = scene.elements.filter((e): e is VisualText => e.kind === 'text' && e.role === 'body');
    expect(body.map(e => e.text)).toEqual(text.type === 'text' ? text.points : []);
    expect(body.map(e => e.pointIndex)).toEqual([0, 1, 2]);
    expect(body.every(e => e.fontSize === 24)).toBe(true);
    expect(body.some(e => e.column === 'left')).toBe(true);
    expect(body.some(e => e.column === 'right')).toBe(true);
    expect(body.map(e => e.column).join(',')).toMatch(/^left,(?:left,)?right(?:,right)?$/);
    expect(inspectEditableSlideScene(scene)).toEqual([]);
  });

  it('enlarges only the title and preserves body size and complete content', () => {
    const changed = applyPresentationLayout(text, style, { titleScale: 1.2 });
    const scene = layoutEditableSlide(changed, style);
    expect(scene.elements.find(e => e.kind === 'text' && e.role === 'title')).toMatchObject({ fontSize: 36 });
    expect(bodies(changed)).toEqual(bodies(text));
    expect(changed).toEqual({ ...text, titleScale: 1.2 });
  });

  it('refuses to hide existing paragraphs behind a large picture', () => {
    expect(() => applyPresentationLayout(picture, style, { layout: 'large-image' })).toThrow('hide the existing paragraphs');
    expect(() => assertOrderedSlideFits({ ...picture, layout: 'large' } as EditableVisualSlide)).toThrow('hide the existing paragraphs');
  });

  it('allows a large picture and caption when there are no paragraphs', () => {
    const { points: _points, ...noPoints } = picture as Extract<OrderedPresentationSlide, { type: 'image' }>;
    const changed = applyPresentationLayout(noPoints, style, { layout: 'large-image' });
    const scene = layoutEditableSlide(changed, style);
    expect(scene.elements.find(e => e.kind === 'image')).toMatchObject({ side: 'full', imageId: 1 });
    expect(scene.elements.some(e => e.kind === 'text' && e.role === 'caption' && e.text === noPoints.caption)).toBe(true);
    expect(() => applyPresentationLayout(changed, style, { layout: 'image-left' })).toThrow('needs accompanying text');
  });

  it('rejects incompatible layouts and single-paragraph columns without changing input', () => {
    expect(() => applyPresentationLayout(text, style, { layout: 'image-left' })).toThrow('does not match');
    expect(() => applyPresentationLayout(picture, style, { layout: 'two-column' })).toThrow('does not match');
    expect(() => applyPresentationLayout({ ...text, type: 'text', points: ['A single complete paragraph remains together.'] }, style, { layout: 'two-column' })).toThrow('at least two');
  });

  it('rejects an oversized title rather than shrinking its font or deleting text', () => {
    const longTitle = { ...text, title: 'A deliberately lengthy title that needs more than one line at this requested presentation title size' };
    expect(() => applyPresentationLayout(longTitle, style, { titleScale: 1.3 })).toThrow('does not fit');
    expect(longTitle.title).toContain('deliberately lengthy');
    expect(orderedPresentationSlideSchema.safeParse({ ...text, titleScale: 1.5 }).success).toBe(false);
  });

  it('rejects crowded columns and unsupported chart typography', () => {
    const crowded: EditableVisualSlide = { ...text, type: 'text', points: Array.from({ length: 5 }, () => 'A full paragraph explains the proposed review and how community members will give useful feedback before publication. '.repeat(2).trim()) };
    expect(() => applyPresentationLayout(crowded, style, { layout: 'two-column' })).toThrow(/do not fit|does not fit/);
    const process: OrderedPresentationSlide = { id: 'steps', type: 'process', title: 'Steps', stages: ['Plan', 'Review', 'Publish'].map(label => ({ label, detail: 'Follow this proposed step.' })) };
    expect(() => applyPresentationLayout(process, style, { titleScale: 1.1 })).toThrow('fixed diagram or chart');
    expect(orderedPresentationSlideSchema.safeParse({ ...process, titleScale: 1.1 }).success).toBe(false);
  });
});

describe('grounded appearance and change readback', () => {
  it('refuses a stale file and distinguishes saved geometry from verified native display', () => {
    const scene = layoutEditableSlide(picture, style);
    expect(describeSlideLayout(scene, { outputMatches: false, nativeSlideVerified: true })).toContain('need to reload or verify');
    expect(describeSlideLayout(scene, { outputMatches: true })).toMatch(/^The saved slide/);
    expect(describeSlideLayout(scene, { outputMatches: true, nativeSlideVerified: true })).toMatch(/^This verified slide/);
    expect(describeSlideLayout(scene, { outputMatches: true })).toContain('picture is on the right');
  });

  it('reports the measured column order and independent title size', () => {
    const changed = applyPresentationLayout(text, style, { layout: 'two-column', titleScale: 1.2 });
    const description = describeSlideLayout(layoutEditableSlide(changed, style), { outputMatches: true });
    expect(description).toContain('36-point title');
    expect(description).toContain('left column from top to bottom, then the right');
    expect(description).not.toContain('hash');
  });

  it('describes actual before/after changes and only claims preserved content when equal', () => {
    const before = layoutEditableSlide(picture, style);
    const moved = applyPresentationLayout(picture, style, { layout: 'image-left' });
    expect(describeSlideLayoutChange(before, layoutEditableSlide(moved, style))).toBe('Moved the picture to the left. The words and picture source are unchanged.');
    const rewritten = { ...moved, title: 'A different title' };
    expect(describeSlideLayoutChange(before, layoutEditableSlide(rewritten, style))).not.toContain('words and picture source are unchanged');
    expect(describeSlideLayoutChange(before, before)).toBe('The layout is unchanged.');
    expect(() => describeSlideLayoutChange(before, layoutEditableSlide(text, style))).toThrow('same stable slide');
  });

  it('detects changed semantic revision independently of object key order', () => {
    const a = layoutEditableSlide(text, style);
    const { title, ...rest } = text;
    const b = layoutEditableSlide({ title, ...rest }, style);
    expect(a.semanticFingerprint).toBe(b.semanticFingerprint);
    expect(layoutEditableSlide({ ...text, title: 'Other title' }, style).semanticFingerprint).not.toBe(a.semanticFingerprint);
  });
});

describe('shared scene export and measurement checks', () => {
  it('passes the same box/font/image bindings to PowerPoint export as readback uses', () => {
    const slide = { addText: vi.fn() };
    const image = vi.fn();
    const scene = layoutEditableSlide(applyPresentationLayout(picture, style, { layout: 'image-left', titleScale: 1.1 }), style);
    renderEditableSlideScene(slide as any, scene, image);
    const title = scene.elements.find((e): e is VisualText => e.kind === 'text' && e.role === 'title')!;
    expect(slide.addText).toHaveBeenCalledWith(title.text, expect.objectContaining({ x: title.bounds.x, y: title.bounds.y, w: title.bounds.width, h: title.bounds.height, fontSize: title.fontSize }));
    expect(image).toHaveBeenCalledWith(1, { x: .75, y: 1.86, w: 5.65, h: 4.1 });
  });

  it('finds bounds, overlaps, low solid contrast and wrong reading order', () => {
    const scene = layoutEditableSlide(text, style);
    const title = scene.elements.find((e): e is VisualText => e.kind === 'text' && e.role === 'title')!;
    title.bounds = { x: -1, y: 1.8, width: 12, height: 1 };
    title.color = scene.background;
    scene.readingOrder.reverse();
    const codes = inspectEditableSlideScene(scene).map(finding => finding.code);
    expect(codes).toEqual(expect.arrayContaining(['bounds', 'overlap', 'contrast', 'reading_order']));
    expect(() => renderEditableSlideScene({} as any, scene, vi.fn())).toThrow();
    expect(solidContrastRatio('000000', 'FFFFFF')).toBeCloseTo(21);
    expect(() => solidContrastRatio('transparent', 'FFFFFF')).toThrow('solid six-digit');
  });

  it('exports two columns as complete editable text and leaves unrelated slide XML identical', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'insight-layout-'));
    const sources: DeckSources = { root, brief: '', briefName: null, originalRequest: 'Fixture', assets: [] };
    const original: OrderedPresentationDeck = { schemaVersion: 2, title: 'Community plan', theme: 'blue', textScale: 1, allowImageReuse: false, slides: [
      { id: 'cover', type: 'cover', title: 'Community plan', subtitle: 'A proposed campaign.' }, text,
      { id: 'last', type: 'text', title: 'Summary', points: ['Review the proposed campaign with the community before sharing it.'] },
    ] };
    const changed = structuredClone(original);
    changed.slides[1] = applyPresentationLayout(text, style, { layout: 'two-column', titleScale: 1.2 });
    const a = path.join(root, 'before.pptx'), b = path.join(root, 'after.pptx');
    await writeOrderedDeck(original, sources, a);
    await writeOrderedDeck(changed, sources, b);
    const before = await JSZip.loadAsync(await readFile(a));
    const after = await JSZip.loadAsync(await readFile(b));
    for (const slide of [1, 3]) expect(await after.file(`ppt/slides/slide${slide}.xml`)!.async('string')).toBe(await before.file(`ppt/slides/slide${slide}.xml`)!.async('string'));
    const xml = await after.file('ppt/slides/slide2.xml')!.async('string');
    for (const point of text.type === 'text' ? text.points : []) expect(xml).toContain(point);
    expect(xml).toContain('sz="3600"');
    expect(xml).toContain('sz="2400"');
    const twoColumnScene = layoutEditableSlide(changed.slides[1] as EditableVisualSlide, changed);
    for (const element of twoColumnScene.elements.filter(e => e.kind === 'text' && e.role === 'body')) expect(xml).toContain(`x="${Math.round(element.bounds.x * 914400)}"`);
    const bytes = await readFile(b), hash = createHash('sha256').update(bytes).digest('hex');
    expect(await readPresentationLayoutScene(bytes, hash, changed.slides[1] as EditableVisualSlide, changed)).toEqual(twoColumnScene);
    await expect(readPresentationLayoutScene(bytes, '0'.repeat(64), changed.slides[1] as EditableVisualSlide, changed)).rejects.toThrow('file changed');
    await expect(readPresentationLayoutScene(bytes, hash, text, changed)).rejects.toThrow('does not match this presentation revision');
    const manifestPart = after.file('customXml/insight-layout.xml')!;
    expect(await manifestPart.async('string')).not.toContain(root);
    expect(await after.file('ppt/_rels/presentation.xml.rels')!.async('string')).toContain('customXml/insight-layout.xml');
    const damaged = (await manifestPart.async('string')).replace('"width":5.35', '"width":10000');
    after.file('customXml/insight-layout.xml', damaged);
    const damagedBytes = await after.generateAsync({ type: 'nodebuffer' });
    await expect(readPresentationLayoutScene(damagedBytes, createHash('sha256').update(damagedBytes).digest('hex'), changed.slides[1] as EditableVisualSlide, changed)).rejects.toThrow();
  });
});
