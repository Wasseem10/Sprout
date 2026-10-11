import { createHash } from 'node:crypto';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { NativePptxSlide } from './presentation-pptx-types.js';
import type { OrderedPresentationDeck, OrderedPresentationSlide } from '../../shared/presentation-deck.js';
import { orderedPresentationSlideSchema } from '../../shared/presentation-deck.js';
import type {
  EditableSlideScene, EditableVisualSlide, PresentationLayoutChoice, VisualBounds,
  VisualLayoutFinding, VisualReadbackEvidence, VisualText,
} from '../../shared/presentation-visual-layout.js';

type DeckStyle = Pick<OrderedPresentationDeck, 'theme' | 'textScale'>;
export class PresentationVisualLayoutError extends Error {
  readonly code = 'layout_capacity';
  readonly changed = false;
  constructor(message: string) { super(message); this.name = 'PresentationVisualLayoutError'; }
}
const measurement = createCanvas(16, 16).getContext('2d');
const epsilon = 0.00001;
export const presentationPalette = (theme: DeckStyle['theme']) => ({
  bg: theme === 'dark' ? '111D31' : theme === 'light' ? 'FFFFFF' : 'F4F7FC',
  ink: theme === 'dark' ? 'F4F7FF' : '142541',
  muted: theme === 'dark' ? 'BDCBE0' : '51617B',
  accent: theme === 'dark' ? '8CC6FF' : '2465BC',
  line: theme === 'dark' ? '385371' : 'CCD8E8',
});
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)]));
  return value;
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export function editableSlideFingerprint(slide: EditableVisualSlide, style: DeckStyle): string {
  return fingerprint({ slide: orderedPresentationSlideSchema.parse(slide), style });
}
function fail(message: string): never { throw new PresentationVisualLayoutError(`${message} Your slide is unchanged. Try a different layout or ask to split the content.`); }
function measured(text: string, width: number, font: number, bold = false) {
  measurement.font = `${bold ? 'bold ' : ''}${font * 96 / 72}px Arial`;
  const lines: { text: string; width: number }[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (measurement.measureText(word).width / 96 > width + epsilon) fail('A word is too wide for the requested text region.');
      const combined = line ? `${line} ${word}` : word;
      if (line && measurement.measureText(combined).width / 96 > width) {
        lines.push({ text: line, width: measurement.measureText(line).width / 96 });
        line = word;
      } else line = combined;
    }
    lines.push({ text: line, width: measurement.measureText(line).width / 96 });
  }
  return { lines, lineHeight: font / 72 * 1.23 };
}
function rows(points: string[], width: number, font: number, compact: number, available: number, gap: number) {
  const needed = points.map(point => { const value = measured(point, width, font); return value.lines.length * value.lineHeight + gap; });
  const required = needed.reduce((sum, value) => sum + value, 0);
  if (required > available + 0.04) fail('The complete text does not fit at its current readable size.');
  const compactHeight = Math.min(compact, available / points.length);
  const padding = needed.map(height => Math.max(0, compactHeight - height));
  const paddingTotal = padding.reduce((sum, value) => sum + value, 0);
  const paddingScale = paddingTotal ? Math.min(1, Math.max(0, available - required) / paddingTotal) : 0;
  let offset = 0;
  return needed.map((height, index) => { const row = { height: height + padding[index] * paddingScale, offset }; offset += row.height; return row; });
}

/** Coordinates and measurements used both by export and appearance readback. No I/O or model calls. */
export function layoutEditableSlide(slide: EditableVisualSlide, style: DeckStyle): EditableSlideScene {
  if (!GlobalFonts.has('Arial')) fail('Arial font metrics are unavailable; the layout cannot silently substitute another font.');
  const parsed = orderedPresentationSlideSchema.parse(slide) as EditableVisualSlide;
  const scale = parsed.textScale ?? style.textScale;
  const titleScale = parsed.titleScale ?? 1;
  const color = presentationPalette(style.theme);
  const { textScale: _textScale, titleScale: _titleScale, ...content } = parsed;
  const contentOnly = { ...content } as Record<string, unknown>;
  delete contentOnly.layout; delete contentOnly.imageSide;
  const scene: EditableSlideScene = {
    schemaVersion: 1, layoutVersion: 'editable-v1', slideId: parsed.id, slideType: parsed.type,
    semanticFingerprint: editableSlideFingerprint(parsed, style), contentFingerprint: fingerprint(contentOnly),
    width: 40 / 3, height: 7.5, background: color.bg, theme: style.theme,
    layout: parsed.type === 'cover' ? 'cover' : parsed.type === 'text' ? parsed.layout ?? 'single' : parsed.layout,
    fontPolicy: { family: 'Arial', fallback: 'Arial', metrics: '@napi-rs/canvas', dpi: 96 }, elements: [], readingOrder: [],
  };
  let readingOrder = 0;
  const addText = (role: VisualText['role'], text: string, x: number, y: number, width: number, height: number, fontSize: number, options: Partial<Pick<VisualText, 'bold' | 'color' | 'pointIndex' | 'column'>> = {}) => {
    const metrics = measured(text, width, fontSize, options.bold);
    if (metrics.lines.length * metrics.lineHeight > height + 0.04) fail('The complete text does not fit at the requested size.');
    const id = `${parsed.id}-${role}-${scene.elements.length}`;
    const element: VisualText = { id, kind: 'text', role, text, bounds: { x, y, width, height }, fontSize, bold: false, color: color.ink, ...metrics, ...options, ...(role === 'marker' ? {} : { readingOrder: readingOrder++ }) };
    scene.elements.push(element);
    if (role !== 'marker') scene.readingOrder.push(id);
  };
  const addImage = (imageId: number, bounds: VisualBounds, side: 'left' | 'right' | 'full') => {
    const id = `${parsed.id}-image`;
    scene.elements.push({ id, kind: 'image', imageId, bounds, side, readingOrder: readingOrder++ });
    scene.readingOrder.push(id);
  };
  if (parsed.type === 'cover') {
    addText('title', parsed.title, 0.75, 1.42, parsed.imageId ? 6 : 11.75, 2.25, (parsed.imageId ? 38 : 44) * scale * titleScale, { bold: true });
    addText('subtitle', parsed.subtitle, 0.75, 4.18, parsed.imageId ? 6 : 10.9, 1.45, 22 * scale, { color: color.muted });
    if (parsed.imageId) addImage(parsed.imageId, { x: 7.25, y: 1.4, width: 5.3, height: 4.7 }, 'right');
  } else {
    addText('title', parsed.title, 0.75, 0.5, 11.85, 1, 30 * scale * titleScale, { bold: true });
    if (parsed.type === 'text') {
      if ((parsed.layout ?? 'single') === 'single') {
        const positions = rows(parsed.points, 10.6, 24 * scale, 1.28, 4.7, 0.18);
        parsed.points.forEach((point, i) => {
          addText('marker', String(i + 1).padStart(2, '0'), 0.78, 1.88 + positions[i].offset, 0.62, 0.44, 17 * scale, { color: color.accent, bold: true });
          addText('body', point, 1.65, 1.8 + positions[i].offset, 10.6, positions[i].height - 0.18, 24 * scale, { pointIndex: i });
        });
      } else {
        if (parsed.points.length < 2) fail('Two columns need at least two complete paragraphs.');
        const splits: { at: number; left: ReturnType<typeof rows>; right: ReturnType<typeof rows>; balance: number }[] = [];
        for (let at = 1; at < parsed.points.length; at++) {
          try {
            const left = rows(parsed.points.slice(0, at), 5.35, 24 * scale, 1.28, 4.7, 0.22);
            const right = rows(parsed.points.slice(at), 5.35, 24 * scale, 1.28, 4.7, 0.22);
            splits.push({ at, left, right, balance: Math.abs(left.at(-1)!.offset + left.at(-1)!.height - right.at(-1)!.offset - right.at(-1)!.height) });
          } catch (error) { if (!(error instanceof PresentationVisualLayoutError)) throw error; }
        }
        const selected = splits.sort((a, b) => a.balance - b.balance || a.at - b.at)[0];
        if (!selected) fail('The full paragraphs do not fit in two columns without shrinking or deleting text.');
        parsed.points.forEach((point, i) => {
          const left = i < selected.at;
          const position = (left ? selected.left : selected.right)[left ? i : i - selected.at];
          addText('body', point, left ? 0.75 : 6.95, 1.8 + position.offset, 5.35, position.height - 0.22, 24 * scale, { pointIndex: i, column: left ? 'left' : 'right' });
        });
      }
    } else if (parsed.layout === 'split' && parsed.points?.length) {
      const side = parsed.imageSide ?? 'right';
      const imageX = side === 'right' ? 6.85 : 0.75;
      const bodyX = side === 'right' ? 0.75 : 7.3;
      const positions = rows(parsed.points, 5.2, 21 * scale, 1.5, 4.6, 0.16);
      parsed.points.forEach((point, i) => addText('body', point, bodyX, 1.86 + positions[i].offset, 5.2, positions[i].height - 0.16, 21 * scale, { pointIndex: i }));
      addImage(parsed.imageId, { x: imageX, y: 1.86, width: 5.65, height: 4.1 }, side);
      if (parsed.caption) addText('caption', parsed.caption, imageX, 6.08, 5.65, 0.7, 15 * scale, { color: color.muted });
    } else {
      if (parsed.points?.length) fail('A large picture layout would hide the existing paragraphs. Keep the split layout, or explicitly move the text to another slide.');
      if (parsed.imageSide) fail('A left or right picture layout needs accompanying text. Keep this picture large, or add text first.');
      addImage(parsed.imageId, { x: 0.8, y: 1.68, width: 11.7, height: 4.72 }, 'full');
      if (parsed.caption) addText('caption', parsed.caption, 0.8, 6.46, 11.7, 0.62, 18 * scale, { color: color.muted });
    }
  }
  const findings = inspectEditableSlideScene(scene);
  if (findings.length) fail(findings[0].message);
  return scene;
}

/** Pure semantic style edit. The renderer performs the same measured validation before saving. */
export function applyPresentationLayout(slide: OrderedPresentationSlide, style: DeckStyle, change: { layout?: PresentationLayoutChoice; titleScale?: number }, options: { validate?: boolean } = {}): EditableVisualSlide {
  if (!['cover', 'text', 'image'].includes(slide.type)) fail('This slide uses a fixed diagram or chart layout.');
  const candidate = structuredClone(slide) as EditableVisualSlide;
  if (change.titleScale !== undefined) candidate.titleScale = change.titleScale;
  if (change.layout) {
    if (candidate.type === 'text' && ['single', 'two-column'].includes(change.layout)) candidate.layout = change.layout as 'single' | 'two-column';
    else if (candidate.type === 'image' && ['image-left', 'image-right'].includes(change.layout)) {
      candidate.layout = 'split'; candidate.imageSide = change.layout === 'image-left' ? 'left' : 'right';
    } else if (candidate.type === 'image' && change.layout === 'large-image') {
      candidate.layout = 'large'; delete candidate.imageSide;
    } else fail('That layout does not match this slide’s content.');
  }
  const parsed = orderedPresentationSlideSchema.parse(candidate) as EditableVisualSlide;
  if (options.validate !== false) layoutEditableSlide(parsed, style);
  return parsed;
}

/** The same scene supplies export geometry, typography, spatial readback and fit checks. */
export function renderEditableSlideScene(
  slide: NativePptxSlide,
  scene: EditableSlideScene,
  picture: (imageId: number, box: { x: number; y: number; w: number; h: number }) => void,
): void {
  const findings = inspectEditableSlideScene(scene);
  if (findings.length) fail(findings[0].message);
  for (const element of scene.elements) {
    const { x, y, width: w, height: h } = element.bounds;
    if (element.kind === 'image') picture(element.imageId, { x, y, w, h });
    else slide.addText(element.text, {
      x, y, w, h, fontFace: 'Arial', fontSize: element.fontSize,
      color: element.color, bold: element.bold, margin: 0, breakLine: false,
      valign: 'middle', paraSpaceAfter: 0,
    });
  }
}

function luminance(hex: string): number {
  const rgb = hex.match(/../g)!.map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function solidContrastRatio(foreground: string, background: string): number {
  if (![foreground, background].every(value => /^[0-9a-f]{6}$/i.test(value))) throw new Error('Contrast requires solid six-digit RGB colors.');
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const overlaps = (a: VisualBounds, b: VisualBounds) => a.x < b.x + b.width - epsilon && a.x + a.width > b.x + epsilon && a.y < b.y + b.height - epsilon && a.y + a.height > b.y + epsilon;
/** Solid-color and measured-box checks, not a full accessibility certification or image analysis. */
export function inspectEditableSlideScene(scene: EditableSlideScene): VisualLayoutFinding[] {
  const findings: VisualLayoutFinding[] = [];
  for (const element of scene.elements) {
    const b = element.bounds;
    if (b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > scene.width + epsilon || b.y + b.height > 7.08 + epsilon)
      findings.push({ code: 'bounds', elementIds: [element.id], message: 'An element exceeds the slide’s content boundary.' });
    if (element.kind === 'text') {
      if (element.lines.length * element.lineHeight > b.height + 0.04 || element.lines.some(line => line.width > b.width + epsilon)) findings.push({ code: 'text_fit', elementIds: [element.id], message: 'Measured text exceeds its region.' });
      // WCAG large text: at least 18pt, or bold at least 14pt. This checks solid colors only.
      const threshold = element.fontSize >= 18 || element.bold && element.fontSize >= 14 ? 3 : 4.5;
      if (solidContrastRatio(element.color, scene.background) < threshold) findings.push({ code: 'contrast', elementIds: [element.id], message: 'Text contrast is below the solid-color contrast threshold.' });
    }
  }
  for (let i = 0; i < scene.elements.length; i++) for (let j = i + 1; j < scene.elements.length; j++) {
    if (overlaps(scene.elements[i].bounds, scene.elements[j].bounds)) findings.push({ code: 'overlap', elementIds: [scene.elements[i].id, scene.elements[j].id], message: 'Content regions overlap.' });
  }
  const readable = scene.elements.filter(element => element.kind !== 'text' || element.role !== 'marker').sort((a, b) => a.readingOrder! - b.readingOrder!);
  if (JSON.stringify(readable.map(element => element.id)) !== JSON.stringify(scene.readingOrder) || new Set(scene.readingOrder).size !== readable.length)
    findings.push({ code: 'reading_order', elementIds: [], message: 'The slide reading order does not match its content.' });
  return findings;
}

const number = (value: number) => Number(value.toFixed(1));
/** Call only with the scene associated with the saved output, not a recomputed unrelated revision. */
export function describeSlideLayout(scene: EditableSlideScene, evidence: VisualReadbackEvidence): string {
  if (!evidence.outputMatches) return 'The saved file no longer matches this layout. I need to reload or verify it before describing its appearance.';
  const title = scene.elements.find((element): element is VisualText => element.kind === 'text' && element.role === 'title')!;
  const image = scene.elements.find(element => element.kind === 'image');
  const body = scene.elements.filter((element): element is VisualText => element.kind === 'text' && element.role === 'body');
  const clauses = [evidence.nativeSlideVerified ? 'This verified slide' : 'The saved slide'];
  clauses[0] += ` uses the ${scene.theme === 'blue' ? 'clean blue' : scene.theme === 'light' ? 'light' : 'dark'} theme with a ${number(title.fontSize)}-point title.`;
  if (scene.layout === 'two-column') {
    const left = body.filter(element => element.column === 'left').length;
    clauses.push(`${body.length} paragraphs are in two columns: ${left} on the left and ${body.length - left} on the right. Read the left column from top to bottom, then the right.`);
  } else if (body.length) clauses.push(`${body.length} paragraphs use ${number(body[0].fontSize)}-point text${image && image.kind === 'image' && image.side !== 'full' ? ` on the ${image.side === 'left' ? 'right' : 'left'}` : ' in one column'}.`);
  if (image?.kind === 'image') clauses.push(image.side === 'full'
    ? `A large picture sits below the title${scene.elements.some(element => element.kind === 'text' && element.role === 'caption') ? ', with its caption underneath' : ''}.`
    : `The picture is on the ${image.side}.`);
  else if (scene.slideType === 'cover') clauses.push('The title sits above the subtitle.');
  return clauses.join(' ');
}

/** Changes come from the actual before/after scenes. Does not claim other slides were untouched. */
export function describeSlideLayoutChange(before: EditableSlideScene, after: EditableSlideScene): string {
  if (before.slideId !== after.slideId) throw new Error('Layout changes require the same stable slide identity.');
  const changes: string[] = [];
  const oldImage = before.elements.find(element => element.kind === 'image');
  const newImage = after.elements.find(element => element.kind === 'image');
  if (oldImage?.kind === 'image' && newImage?.kind === 'image' && oldImage.side !== newImage.side) changes.push(newImage.side === 'full' ? 'Changed to a large picture layout.' : `Moved the picture to the ${newImage.side}.`);
  if (before.layout !== after.layout && after.layout === 'two-column') changes.push('Arranged the complete paragraphs in two columns, read left column first.');
  if (before.layout === 'two-column' && after.layout === 'single') changes.push('Returned the paragraphs to a single column.');
  const oldTitle = before.elements.find((e): e is VisualText => e.kind === 'text' && e.role === 'title');
  const newTitle = after.elements.find((e): e is VisualText => e.kind === 'text' && e.role === 'title');
  if (oldTitle?.fontSize !== newTitle?.fontSize && newTitle) changes.push(`Changed the title to ${number(newTitle.fontSize)} points.`);
  if (before.theme !== after.theme) changes.push(`Changed the theme to ${after.theme}.`);
  if (before.contentFingerprint === after.contentFingerprint && changes.length) changes.push('The words and picture source are unchanged.');
  if (!changes.length) return before.semanticFingerprint === after.semanticFingerprint ? 'The layout is unchanged.' : 'The slide changed; no supported spatial change was detected.';
  return changes.join(' ');
}
