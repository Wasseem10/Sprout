import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { z } from 'zod';
import type { OrderedPresentationDeck, OrderedPresentationSlide } from '../../shared/presentation-deck.js';
import type { EditableSlideScene, EditableVisualSlide } from '../../shared/presentation-visual-layout.js';
import { editableSlideFingerprint, inspectEditableSlideScene } from './presentation-visual-layout.js';
import type { SavedSlideScene, StructuredSlideScene } from '../../shared/presentation-review-scene.js';
import { structuredSlideFingerprint } from './presentation-review-scene.js';

const name = z.string().regex(/^[a-zA-Z0-9_-]{1,140}$/);
const objectName = z.string().regex(/^[a-zA-Z0-9_:-]{1,240}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const coordinate = z.number().finite().min(0).max(14);
const bounds = z.strictObject({ x: coordinate, y: coordinate, width: z.number().finite().positive().max(14), height: z.number().finite().positive().max(8) });
const color = z.string().regex(/^[A-Fa-f0-9]{6}$/);
const text = z.strictObject({
  id: name, kind: z.literal('text'), role: z.enum(['title', 'subtitle', 'body', 'caption', 'marker']),
  text: z.string().max(500), bounds, fontSize: z.number().finite().min(10).max(80), bold: z.boolean(), color,
  lines: z.array(z.strictObject({ text: z.string().max(500), width: z.number().finite().min(0).max(14) })).min(1).max(30),
  lineHeight: z.number().finite().positive().max(2), readingOrder: z.number().int().min(0).max(20).optional(),
  pointIndex: z.number().int().min(0).max(4).optional(), column: z.enum(['left', 'right']).optional(),
});
const image = z.strictObject({
  id: name, kind: z.literal('image'), imageId: z.number().int().min(1).max(6), bounds,
  readingOrder: z.number().int().min(0).max(20), side: z.enum(['left', 'right', 'full']),
});
const sceneSchema = z.strictObject({
  schemaVersion: z.literal(1), layoutVersion: z.literal('editable-v1'), slideId: name,
  slideType: z.enum(['cover', 'text', 'image']), semanticFingerprint: sha, contentFingerprint: sha,
  width: z.literal(40 / 3), height: z.literal(7.5), background: color, theme: z.enum(['blue', 'light', 'dark']),
  layout: z.enum(['cover', 'single', 'two-column', 'split', 'large']),
  fontPolicy: z.strictObject({ family: z.literal('Arial'), fallback: z.literal('Arial'), metrics: z.literal('@napi-rs/canvas'), dpi: z.literal(96) }),
  elements: z.array(z.discriminatedUnion('kind', [text, image])).min(1).max(16),
  readingOrder: z.array(name).min(1).max(16),
});
const reviewText = text.extend({ id: objectName, role: z.enum(['title', 'subtitle', 'body', 'caption', 'marker', 'node-label', 'branch-label', 'stage-label', 'stage-detail']), sourceId: name.optional(), align: z.enum(['left', 'center']).optional(), readingOrder: z.number().int().min(0).max(60).optional() });
const reviewSceneSchema = z.strictObject({
  schemaVersion: z.literal(1), layoutVersion: z.literal('structured-v1'), slideId: name,
  slideType: z.enum(['flowchart', 'process', 'chart']), semanticFingerprint: sha,
  width: z.literal(40 / 3), height: z.literal(7.5), background: color, theme: z.enum(['blue', 'light', 'dark']),
  elements: z.array(z.discriminatedUnion('kind', [reviewText,
    z.strictObject({ id: objectName, kind: z.literal('shape'), sourceId: name, geometry: z.enum(['rect', 'roundRect', 'diamond']), bounds, fill: color, stroke: color, strokeWidthPt: z.number().finite().min(.1).max(5) }),
    z.strictObject({ id: objectName, kind: z.literal('connector'), sourceId: name, points: z.array(z.strictObject({ x: coordinate, y: coordinate })).min(2).max(6), stroke: color, strokeWidthPt: z.number().finite().min(.1).max(5) }),
    z.strictObject({ id: name, kind: z.literal('chart'), bounds, labels: z.array(z.string().min(1).max(60)).min(1).max(12), series: z.array(z.strictObject({ name: z.string().min(1).max(70), values: z.array(z.number().finite()).min(1).max(12) })).min(1).max(4), unit: z.string().min(1).max(40), internalGeometry: z.literal('office') }),
  ])).min(1).max(50),
  readingOrder: z.array(objectName).min(1).max(50),
  branches: z.array(z.strictObject({ edgeId: name, label: z.string().min(1).max(32), lane: z.enum(['left', 'right']), nodeIds: z.array(name).min(1).max(7) })).length(2).optional(),
});
const manifestSchema = z.union([
  z.strictObject({ schemaVersion: z.literal(1), layoutVersion: z.literal('editable-v1'), scenes: z.array(sceneSchema).max(10) }),
  z.strictObject({ schemaVersion: z.literal(2), layoutVersion: z.literal('mixed-v1'), scenes: z.array(z.union([sceneSchema, reviewSceneSchema])).max(10) }),
]);
const part = 'customXml/insight-layout.xml';
const ns = 'urn:insightos:layout:v1';
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescape = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Public semantic scene only: never local paths, image bytes, secrets, or source workbooks. */
export function embedPresentationLayoutManifest(zip: JSZip, scenes: SavedSlideScene[]): void {
  const manifest = manifestSchema.parse({ schemaVersion: 2, layoutVersion: 'mixed-v1', scenes });
  if (new Set(scenes.map(scene => scene.slideId)).size !== scenes.length) throw new Error('Duplicate scene slide identity.');
  zip.file(part, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><insightLayout xmlns="${ns}">${escape(JSON.stringify(manifest))}</insightLayout>`);
}

/** Finish package relationship/content-type metadata without modifying any slide XML. */
export async function finalizePresentationLayoutManifest(zip: JSZip): Promise<void> {
  const types = zip.file('[Content_Types].xml');
  const rels = zip.file('ppt/_rels/presentation.xml.rels');
  if (!types || !rels) throw new Error('The presentation package metadata is missing.');
  const typeXml = await types.async('string');
  if (!typeXml.includes(`PartName="/${part}"`)) zip.file('[Content_Types].xml', typeXml.replace('</Types>', `<Override PartName="/${part}" ContentType="application/xml"/></Types>`));
  const relXml = await rels.async('string');
  if (!relXml.includes('Id="rIdInsightLayout"')) zip.file('ppt/_rels/presentation.xml.rels', relXml.replace('</Relationships>', '<Relationship Id="rIdInsightLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/insight-layout.xml"/></Relationships>'));
}

async function readManifest(bytes: Buffer, expectedSha256: string) {
  if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error('The presentation file changed before its appearance could be verified.');
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file(part);
  if (!file) throw new Error('This older export has no saved layout evidence. Make a presentation edit or resume the project to export a verified layout first.');
  const declaredSize = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (declaredSize !== undefined && declaredSize > 384 * 1024) throw new Error('The saved layout evidence is too large.');
  const xml = await file.async('string');
  if (Buffer.byteLength(xml, 'utf8') > 384 * 1024) throw new Error('The saved layout evidence is too large.');
  const match = xml.match(/^<\?xml[^?]*\?><insightLayout xmlns="urn:insightos:layout:v1">([\s\S]*)<\/insightLayout>$/);
  if (!match) throw new Error('The saved layout evidence is not recognized.');
  const manifest = manifestSchema.parse(JSON.parse(unescape(match[1])));
  if (new Set(manifest.scenes.map(scene => scene.slideId)).size !== manifest.scenes.length) throw new Error('The saved layout contains duplicate slide identities.');
  return manifest;
}
function assertStructuredScene(scene: StructuredSlideScene, slide: OrderedPresentationSlide) {
  const ids = scene.elements.map(e => e.id);
  if (new Set(ids).size !== ids.length || new Set(scene.readingOrder).size !== scene.readingOrder.length || scene.readingOrder.some(id => !ids.includes(id))) throw new Error('The saved layout has invalid reading order.');
  for (const element of scene.elements) {
    if (element.kind === 'connector') {
      if (element.points.some(p => p.x > scene.width || p.y > scene.height)) throw new Error('A saved connector exceeds the slide.');
    } else {
      const b = element.bounds;
      if (b.x + b.width > scene.width + .001 || b.y + b.height > scene.height + .001) throw new Error('A saved region exceeds the slide.');
      if (element.kind === 'text' && (element.lines.some(line => line.width > b.width + .001) || element.lines.length * element.lineHeight > b.height + .04)) throw new Error('Saved text does not fit its measured region.');
    }
  }
  const text = scene.elements.filter(e => e.kind === 'text');
  if (text.filter(e => e.role === 'title').length !== 1 || text.find(e => e.role === 'title')?.text !== slide.title) throw new Error('The saved layout title does not match.');
  if (slide.type === 'process') {
    if (JSON.stringify(text.filter(e => e.role === 'stage-label').map(e => e.text)) !== JSON.stringify(slide.stages.map(s => s.label)) || JSON.stringify(text.filter(e => e.role === 'stage-detail').map(e => e.text)) !== JSON.stringify(slide.stages.map(s => s.detail))) throw new Error('The saved process content does not match.');
  } else if (slide.type === 'flowchart') {
    if (text.filter(e => e.role === 'node-label').length !== slide.graph.nodes.length || slide.graph.nodes.some(node => text.find(e => e.role === 'node-label' && e.sourceId === node.id)?.text !== node.label)) throw new Error('The saved diagram labels do not match.');
    const branches = slide.graph.edges.filter(e => e.branchLabel);
    if (branches.some(edge => text.find(e => e.role === 'branch-label' && e.sourceId === edge.id)?.text !== edge.branchLabel)) throw new Error('The saved branch labels do not match.');
  } else if (slide.type === 'chart') {
    const chart = scene.elements.find(e => e.kind === 'chart');
    if (!chart || JSON.stringify(chart.labels) !== JSON.stringify(slide.chart.labels) || JSON.stringify(chart.series) !== JSON.stringify(slide.chart.series) || chart.unit !== slide.chart.unit || text.find(e => e.role === 'caption')?.text !== `${slide.chart.unit}. ${slide.chart.provenance.summary}`) throw new Error('The saved chart region or evidence does not match.');
  }
}
export async function readPresentationLayoutScene(
  bytes: Buffer, expectedSha256: string, slide: EditableVisualSlide,
  style: Pick<OrderedPresentationDeck, 'theme' | 'textScale'>,
): Promise<EditableSlideScene>;
export async function readPresentationLayoutScene(
  bytes: Buffer, expectedSha256: string, slide: OrderedPresentationSlide,
  style: Pick<OrderedPresentationDeck, 'theme' | 'textScale'>,
): Promise<SavedSlideScene>;
export async function readPresentationLayoutScene(
  bytes: Buffer, expectedSha256: string, slide: OrderedPresentationSlide,
  style: Pick<OrderedPresentationDeck, 'theme' | 'textScale'>,
): Promise<SavedSlideScene> {
  const manifest = await readManifest(bytes, expectedSha256);
  const scene = manifest.scenes.find(value => value.slideId === slide.id);
  if (slide.type === 'flowchart' || slide.type === 'process' || slide.type === 'chart') {
    if (!scene || scene.layoutVersion !== 'structured-v1' || scene.slideType !== slide.type || scene.semanticFingerprint !== structuredSlideFingerprint(slide, style)) throw new Error('The saved layout does not match this presentation revision.');
    assertStructuredScene(scene, slide); return scene;
  }
  if (scene?.layoutVersion !== 'editable-v1') throw new Error('The saved layout does not match this presentation revision.');
  if (!scene || scene.slideType !== slide.type || scene.semanticFingerprint !== editableSlideFingerprint(slide, style)) throw new Error('The saved layout does not match this presentation revision.');
  if (inspectEditableSlideScene(scene).length) throw new Error('The saved layout failed its measured region checks.');
  const actualText = scene.elements.filter(element => element.kind === 'text');
  if (actualText.filter(element => element.role === 'title').length !== 1 || actualText.find(element => element.role === 'title')?.text !== slide.title) throw new Error('The saved layout title does not match the slide.');
  const actualBody = actualText.filter(element => element.role === 'body').sort((a, b) => a.readingOrder! - b.readingOrder!).map(element => element.text);
  const expectedBody = slide.type === 'cover' ? [] : slide.type === 'text' ? slide.points : slide.points ?? [];
  if (JSON.stringify(actualBody) !== JSON.stringify(expectedBody)) throw new Error('The saved layout words do not match the slide.');
  if (slide.type === 'cover' && actualText.find(element => element.role === 'subtitle')?.text !== slide.subtitle) throw new Error('The saved layout subtitle does not match.');
  if (slide.type === 'image' && (actualText.find(element => element.role === 'caption')?.text ?? '') !== slide.caption) throw new Error('The saved layout caption does not match.');
  const images = scene.elements.filter(element => element.kind === 'image');
  const imageId = 'imageId' in slide ? slide.imageId : undefined;
  if (images.length !== (imageId ? 1 : 0) || imageId && images[0]?.imageId !== imageId) throw new Error('The saved picture binding does not match the slide.');
  return scene;
}
