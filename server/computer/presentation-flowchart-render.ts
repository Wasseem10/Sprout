import type { NativePptxSlide, NativePptxShape } from './presentation-pptx-types.js';
import JSZip from 'jszip';
import type {
  PresentationScene,
  PresentationSceneElement,
} from '../../shared/presentation-scene.js';
import { assertFlowchartScene } from './presentation-flowchart-layout.js';

export type FlowchartRenderReceipt = {
  slideId: string;
  width: number;
  height: number;
  /** Shape/text alt descriptions require finalizeFlowchartPptx after PptxGenJS writes. */
  requiresAccessibilityFinalization: true;
  objects: {
    sceneElementId: string;
    objectName: string;
    altText: string;
    kind: PresentationSceneElement['kind'];
    readingOrder: number;
  }[];
};
const emu = (inches: number) => Math.round(inches * 914400);
const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const nameFor = (element: PresentationSceneElement) => `${element.role} [${element.id}]`;

/** Paints the single measured scene with editable Office geometry, never a raster preview. */
export function renderFlowchartScene(
  slide: NativePptxSlide,
  scene: PresentationScene,
): FlowchartRenderReceipt {
  assertFlowchartScene(scene); // Validate before touching the caller's slide.
  const byId = new Map(scene.elements.map((element) => [element.id, element]));
  const nodeLabel = (id: string) =>
    scene.elements.find(
      (element) =>
        element.kind === 'text' && element.role === 'node-label' && element.sourceId === id,
    );
  const objects: FlowchartRenderReceipt['objects'] = [];
  slide.background = { color: scene.background };
  for (const id of scene.readingOrder) {
    const element = byId.get(id)!;
    const objectName = nameFor(element);
    let altText: string;
    if (element.kind === 'shape') {
      slide.addShape(element.geometry, {
        x: element.bounds.x,
        y: element.bounds.y,
        w: element.bounds.width,
        h: element.bounds.height,
        objectName,
        fill: { color: element.fill },
        line: { color: element.stroke, width: element.strokeWidthPt },
        ...(element.geometry === 'roundRect' ? { rectRadius: 0.1 } : {}),
      });
      // The following editable text object supplies the label in reading order.
      altText = `${element.role === 'decision' ? 'Decision' : element.role === 'process' ? 'Process step' : element.role === 'start' ? 'Start' : 'End'} node.`;
    } else if (element.kind === 'text') {
      slide.addText(element.lines.map((line) => line.text).join('\n'), {
        x: element.bounds.x,
        y: element.bounds.y,
        w: element.bounds.width,
        h: element.bounds.height,
        objectName,
        fontFace: element.font.family,
        fontSize: element.font.sizePt,
        bold: element.font.bold,
        color: element.font.color,
        align: element.align,
        valign: 'middle',
        margin: 0,
        fit: 'none',
        wrap: false,
        lineSpacing: element.lineHeight * 72,
        paraSpaceBefore: 0,
        paraSpaceAfter: 0,
        breakLine: false,
      });
      altText = element.role === 'branch-label' ? `${element.text} branch.` : element.text;
    } else {
      const xs = element.points.map((point) => point.x),
        ys = element.points.map((point) => point.y);
      const x = Math.min(...xs),
        y = Math.min(...ys);
      // One native freeform path keeps every bend and a single arrow head together.
      // A tiny nonzero viewport permits a straight vertical/horizontal custom path;
      // the actual path coordinates remain exactly those of the shared scene.
      slide.addShape('custGeom' as NativePptxShape, {
        x,
        y,
        w: Math.max(0.001, Math.max(...xs) - x),
        h: Math.max(0.001, Math.max(...ys) - y),
        objectName,
        points: element.points.map((point) => ({ x: point.x - x, y: point.y - y })),
        line: {
          color: element.stroke,
          width: element.strokeWidthPt,
          endArrowType: element.arrowhead,
        },
      });
      const from = nodeLabel(element.fromNodeId),
        to = nodeLabel(element.toNodeId);
      const branch = scene.flowchart.branches.find(
        (candidate) => candidate.edgeId === element.sourceId,
      );
      altText = `${branch ? `${branch.label}: ` : ''}${from?.kind === 'text' ? from.text : element.fromNodeId} leads to ${to?.kind === 'text' ? to.text : element.toNodeId}.`;
    }
    objects.push({
      sceneElementId: element.id,
      objectName,
      altText,
      kind: element.kind,
      readingOrder: element.readingOrder,
    });
  }
  return {
    slideId: scene.slideId,
    width: scene.width,
    height: scene.height,
    requiresAccessibilityFinalization: true,
    objects,
  };
}

/**
 * PptxGenJS 4.x ignores altText for native shapes/text. Patch only exact named
 * objects created by this renderer. Actual package parts and relationships stay intact;
 * unused missing-master declarations emitted by PptxGenJS are removed separately.
 * Exporters must call this before claiming diagram accessibility metadata.
 */
export async function finalizeFlowchartPptx(
  bytes: Uint8Array,
  receipts: FlowchartRenderReceipt[],
): Promise<Buffer> {
  if (!receipts.length) return Buffer.from(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const presentation = await zip.file('ppt/presentation.xml')?.async('string');
  const dimensions = presentation?.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  if (
    !dimensions ||
    receipts.some(
      (receipt) =>
        Number(dimensions[1]) !== emu(receipt.width) ||
        Number(dimensions[2]) !== emu(receipt.height),
    )
  )
    throw new Error('The exported slide size does not match its measured flowchart scene.');
  const metadata = new Map<string, FlowchartRenderReceipt['objects'][number]>();
  for (const receipt of receipts)
    for (const object of receipt.objects) {
      const key = escapeXml(object.objectName);
      if (metadata.has(key))
        throw new Error('Flowchart export object names must be globally unique.');
      metadata.set(key, object);
    }
  const seen = new Set<string>();
  for (const filename of Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name),
  )) {
    const original = await zip.file(filename)!.async('string');
    const xml = original.replace(/<p:cNvPr\b[^>]*>/g, (tag) => {
      const name = tag.match(/\bname="([^"]*)"/)?.[1];
      if (!name || !metadata.has(name)) return tag;
      if (seen.has(name))
        throw new Error('A diagram object name appears more than once in the exported package.');
      seen.add(name);
      const clean = tag.replace(/\sdescr="[^"]*"/g, '');
      return clean.replace(
        /\s*\/?>$/,
        (ending) => ` descr="${escapeXml(metadata.get(name)!.altText)}"${ending}`,
      );
    });
    if (xml !== original) zip.file(filename, xml);
  }
  if (seen.size !== metadata.size)
    throw new Error(
      'The exported package is missing a named flowchart object; accessibility metadata was not finalized.',
    );
  const types = zip.file('[Content_Types].xml');
  if (!types) throw new Error('The exported PowerPoint package has no content types.');
  const originalTypes = await types.async('string');
  const cleanedTypes = originalTypes.replace(/<Override\b[^>]*\/>/g, (entry) => {
    const part = entry.match(/\bPartName="([^"]+)"/)?.[1];
    return part &&
      /^\/ppt\/slideMasters\/slideMaster\d+\.xml$/.test(part) &&
      !zip.file(part.slice(1))
      ? ''
      : entry;
  });
  if (cleanedTypes !== originalTypes) zip.file('[Content_Types].xml', cleanedTypes);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
