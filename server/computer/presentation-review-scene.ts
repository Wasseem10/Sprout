import { createHash } from 'node:crypto';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { OrderedPresentationDeck, OrderedPresentationSlide } from '../../shared/presentation-deck.js';
import { orderedPresentationSlideSchema } from '../../shared/presentation-deck.js';
import type { PresentationScene } from '../../shared/presentation-scene.js';
import type { StructuredSlideScene, ReviewText } from '../../shared/presentation-review-scene.js';
import type { VisualReadbackEvidence } from '../../shared/presentation-visual-layout.js';
import { presentationPalette } from './presentation-visual-layout.js';

type Style = Pick<OrderedPresentationDeck, 'theme' | 'textScale'>;
type StructuredSlide = Extract<OrderedPresentationSlide, { type: 'process' | 'flowchart' | 'chart' }>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function structuredSlideFingerprint(slide: StructuredSlide, style: Style): string {
  return createHash('sha256').update(JSON.stringify(canonical({ slide: orderedPresentationSlideSchema.parse(slide), style }))).digest('hex');
}
const context = createCanvas(16, 16).getContext('2d');
function measuredText(id: string, role: ReviewText['role'], text: string, x: number, y: number, width: number, height: number, fontSize: number, color: string, bold = false): ReviewText {
  if (!GlobalFonts.has('Arial')) throw new Error('Arial is unavailable; the layout cannot substitute a different font silently.');
  context.font = `${bold ? 'bold ' : ''}${fontSize * 96 / 72}px Arial`;
  const lines: { text: string; width: number }[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width / 96 > width) { lines.push({ text: line, width: context.measureText(line).width / 96 }); line = word; }
      else line = candidate;
    }
    lines.push({ text: line, width: context.measureText(line).width / 96 });
  }
  const result: ReviewText = { id, kind: 'text', role, text, bounds: { x, y, width, height }, fontSize, color, bold, lines, lineHeight: fontSize / 72 * 1.23 };
  if (lines.some(line => line.width > width + 0.001) || lines.length * result.lineHeight > height + 0.04) throw new Error('Measured diagram or chart text does not fit its region.');
  return result;
}
/** Convert the SAME flowchart scene sent to the native renderer; never run a second graph layout. */
export function flowchartReviewScene(slide: Extract<StructuredSlide, { type: 'flowchart' }>, style: Style, scene: PresentationScene): StructuredSlideScene {
  return {
    schemaVersion: 1, layoutVersion: 'structured-v1', slideId: slide.id, slideType: 'flowchart',
    semanticFingerprint: structuredSlideFingerprint(slide, style), width: scene.width, height: scene.height,
    background: scene.background, theme: style.theme, readingOrder: [...scene.readingOrder], branches: scene.flowchart.branches.map(({ edgeId, label, lane, nodeIds }) => ({ edgeId, label, lane, nodeIds })),
    elements: scene.elements.map(element => element.kind === 'text' ? {
      id: element.id, kind: 'text', role: element.role, text: element.text, bounds: element.bounds,
      fontSize: element.font.sizePt, bold: element.font.bold, color: element.font.color, lines: element.lines,
      lineHeight: element.lineHeight, align: element.align, readingOrder: element.readingOrder, sourceId: element.sourceId,
    } : element.kind === 'shape' ? { id: element.id, kind: 'shape', sourceId: element.sourceId!, geometry: element.geometry, bounds: element.bounds, fill: element.fill, stroke: element.stroke, strokeWidthPt: element.strokeWidthPt }
      : { id: element.id, kind: 'connector', sourceId: element.sourceId, points: element.points, stroke: element.stroke, strokeWidthPt: element.strokeWidthPt }),
  };
}
/** Process coordinates and native-chart frame are owned here by both export and preview. */
export function layoutStructuredSlide(slide: Extract<StructuredSlide, { type: 'process' | 'chart' }>, style: Style): StructuredSlideScene {
  const color = presentationPalette(style.theme), scale = slide.textScale ?? style.textScale;
  const scene: StructuredSlideScene = { schemaVersion: 1, layoutVersion: 'structured-v1', slideId: slide.id, slideType: slide.type, semanticFingerprint: structuredSlideFingerprint(slide, style), width: 40 / 3, height: 7.5, background: color.bg, theme: style.theme, elements: [], readingOrder: [] };
  const add = (item: ReviewText) => { item.readingOrder = scene.readingOrder.length; scene.elements.push(item); scene.readingOrder.push(item.id); };
  add(measuredText(`${slide.id}-title`, 'title', slide.title, .75, .5, 11.85, 1, 30 * scale, color.ink, true));
  if (slide.type === 'process') {
    const width = (11.8 - (slide.stages.length - 1) * .32) / slide.stages.length;
    slide.stages.forEach((stage, index) => {
      const x = .75 + index * (width + .32), id = `${slide.id}-stage-${index + 1}`;
      const marker = measuredText(`${id}-number`, 'marker', String(index + 1).padStart(2, '0'), x, 1.9, width, .42, 17 * scale, color.accent, true);
      scene.elements.push(marker);
      add(measuredText(`${id}-label`, 'stage-label', stage.label, x, 2.55, width - .24, 1.1, 19 * scale, color.ink, true));
      add(measuredText(`${id}-detail`, 'stage-detail', stage.detail, x, 4.04, width, 2.4, 17 * scale, color.ink));
      if (index < slide.stages.length - 1) scene.elements.push({ id: `${id}-arrow`, kind: 'connector', sourceId: id, points: [{ x: x + width - .02, y: 3.11 }, { x: x + width + .28, y: 3.11 }], stroke: color.accent, strokeWidthPt: 1.5 });
    });
  } else {
    const chart = { id: `${slide.id}-chart`, kind: 'chart' as const, bounds: { x: .9, y: 1.8, width: 11.5, height: 4.45 }, labels: slide.chart.labels, series: slide.chart.series, unit: slide.chart.unit, internalGeometry: 'office' as const };
    scene.elements.push(chart); scene.readingOrder.push(chart.id);
    add(measuredText(`${slide.id}-caption`, 'caption', `${slide.chart.unit}. ${slide.chart.provenance.summary}`, .9, 6.44, 11.5, .52, 13, color.muted));
  }
  return scene;
}
export function renderStructuredScene(slide: any, scene: StructuredSlideScene, renderChart: (chart: Extract<StructuredSlideScene['elements'][number], { kind: 'chart' }>) => void): void {
  for (const item of scene.elements) {
    if (item.kind === 'text') slide.addText(item.text, { x: item.bounds.x, y: item.bounds.y, w: item.bounds.width, h: item.bounds.height, fontFace: 'Arial', fontSize: item.fontSize, color: item.color, bold: item.bold, margin: 0, breakLine: false, valign: 'mid', paraSpaceAfter: 0, objectName: item.id });
    else if (item.kind === 'connector') { const [a, b] = item.points; slide.addShape('line', { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, objectName: item.id, line: { color: item.stroke, width: item.strokeWidthPt, beginArrowType: 'none', endArrowType: 'triangle' } }); }
    else if (item.kind === 'chart') renderChart(item);
  }
}
export function describeStructuredLayout(scene: StructuredSlideScene, evidence: VisualReadbackEvidence): string {
  if (!evidence.outputMatches) return 'The saved file no longer matches this layout. I need to verify it before describing its appearance.';
  const title = scene.elements.find((e): e is ReviewText => e.kind === 'text' && e.role === 'title')!;
  const beginning = `${evidence.nativeSlideVerified ? 'This verified slide' : 'The saved slide'} has a ${Number(title.fontSize.toFixed(1))}-point title across the top.`;
  if (scene.slideType === 'flowchart') return `${beginning} The start and decision are centered above two branches. ${(scene.branches ?? []).map(branch => `“${branch.label}” follows the ${branch.lane} lane`).join('; ')}. Arrows connect the editable shapes. Ask me to explain a branch or named step.`;
  if (scene.slideType === 'process') {
    const labels = scene.elements.filter((e): e is ReviewText => e.kind === 'text' && e.role === 'stage-label');
    return `${beginning} ${labels.length} stages run left to right with arrows between them. Their ${Number(labels[0].fontSize.toFixed(1))}-point labels sit above explanatory text. Read each stage's label and detail before moving right.`;
  }
  return `${beginning} The comparison chart fills the wide middle region, with a source and takeaway caption below it. PowerPoint positions the chart's axes and bars; I can verify this outer arrangement and read the saved values, but cannot certify their internal pixel positions.`;
}
