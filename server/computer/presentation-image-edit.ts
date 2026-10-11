import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { loadImage } from '@napi-rs/canvas';

const MB = 1024 * 1024;
const MAX_ARCHIVE = 40 * MB;
const MAX_EXPANDED = 120 * MB;
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const IMAGE_PANE_NS = 'urn:insightos:presentation:image-pane:1';
const IMAGE_PANE_EXT = '{DDFAE4E4-8035-4E5D-A997-6FBB00A7C1DC}';

export class PresentationImageEditError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PresentationImageEditError';
  }
}

export type GeneratedSlideImageEdit = {
  inputFile: string;
  outputFile: string;
  image: { bytes: Uint8Array; filename: string; altText: string };
  target: number | 'last';
  // Omission fills the reserved slot, replacing a previous Insight insertion.
  // Explicit insertion never silently replaces a picture.
  mode?: 'insert' | 'replace';
  signal?: AbortSignal;
};

const fail = (message: string): never => {
  throw new PresentationImageEditError(message);
};
const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
const attrs = (tag: string) =>
  Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
const decodeXml = (value: string) =>
  value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (entity) => {
    const basic: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    };
    if (basic[entity]) return basic[entity];
    const code = entity.startsWith('&#x')
      ? parseInt(entity.slice(3, -1), 16)
      : parseInt(entity.slice(2, -1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });

// Check central-directory sizes before JSZip decompresses anything. This editor
// only consumes bounded, ordinary InsightOS files; ZIP64/encrypted archives and
// path traversal are outside that contract.
function validateZipDirectory(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) fail('The presentation is not a supported PowerPoint archive.');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const directorySize = bytes.readUInt32LE(end + 12);
  if (
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    count !== bytes.readUInt16LE(end + 8) ||
    count < 1 ||
    count > 1200 ||
    directorySize === 0xffffffff ||
    offset + directorySize !== end
  )
    fail('This presentation archive is outside the supported editing limits.');
  let expanded = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      fail('The presentation archive directory is invalid.');
    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(compression) || size > 32 * MB)
      fail('The presentation contains an unsupported archive entry.');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (
      !name ||
      /[\\\u0000]/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((part) => part === '..' || part === '.') ||
      names.has(name)
    )
      fail('The presentation contains an invalid archive path.');
    names.add(name);
    expanded += size;
    if (expanded > MAX_EXPANDED) fail('The presentation is too large to edit safely.');
    offset = next;
  }
  if (offset !== end) fail('The presentation archive directory is invalid.');
}

async function readXml(zip: JSZip, name: string) {
  const part = zip.file(name);
  if (!part) fail('This presentation is missing a required Office part.');
  const xml = await part!.async('string');
  if (xml.length > 4 * MB || /<!DOCTYPE|<!ENTITY/i.test(xml))
    fail('This presentation contains unsupported XML.');
  return xml;
}

type Shape = { xml: string; x: number; y: number; w: number; h: number; background: boolean };
type ImagePane = { x: number; y: number; w: number; h: number };

function imagePane(slideWidth: number, slideHeight: number): ImagePane {
  return {
    x: slideWidth * 0.715,
    y: slideHeight * 0.29,
    w: slideWidth * 0.235,
    h: slideHeight * 0.6,
  };
}
function geometry(xml: string, slideWidth: number, slideHeight: number): Shape {
  const transform = xml.match(/<(?:a|p):xfrm\b[^>]*>[\s\S]*?<\/(?:a|p):xfrm>/)?.[0];
  const off = transform?.match(/<a:off\b[^>]*\/>/)?.[0];
  const ext = transform?.match(/<a:ext\b[^>]*\/>/)?.[0];
  if (!off || !ext || /\brot="(?!0")/.test(transform!))
    fail('This slide uses a layout that cannot yet accept an image. Your deck is unchanged.');
  const origin = attrs(off!),
    size = attrs(ext!);
  const [x, y, w, h] = [origin.x, origin.y, size.cx, size.cy].map(Number);
  if (
    ![x, y, w, h].every(Number.isSafeInteger) ||
    x < 0 ||
    y < 0 ||
    w < 0 ||
    h < 0 ||
    x + w > slideWidth + 100 ||
    y + h > slideHeight + 100
  )
    fail('The slide contains unsupported object coordinates. Your deck is unchanged.');
  const background =
    !/<a:t\b|<p:pic\b|<p:graphicFrame\b/.test(xml) &&
    x < slideWidth * 0.02 &&
    y < slideHeight * 0.02 &&
    w > slideWidth * 0.95 &&
    h > slideHeight * 0.95;
  return { xml, x, y, w, h, background };
}

function scaleShape(shape: Shape, scale: number, dx: number, dy: number) {
  let xml = shape.xml.replace(/<(a|p):xfrm\b[^>]*>[\s\S]*?<\/\1:xfrm>/, (transform) =>
    transform
      .replace(/<a:off\b[^>]*\/>/, (off) =>
        off
          .replace(/\bx="\d+"/, `x="${Math.round(shape.x * scale + dx)}"`)
          .replace(/\by="\d+"/, `y="${Math.round(shape.y * scale + dy)}"`),
      )
      .replace(/<a:ext\b[^>]*\/>/, (ext) =>
        ext
          .replace(/\bcx="\d+"/, `cx="${Math.round(shape.w * scale)}"`)
          .replace(/\bcy="\d+"/, `cy="${Math.round(shape.h * scale)}"`),
      ),
  );
  // Scale typography and its internal spacing with the box. A horizontal-only
  // squeeze would keep text strings but could cause hidden overflow.
  xml = xml.replace(/<a:(?:rPr|defRPr|endParaRPr|bodyPr|pPr|ln|spcPts)\b[^>]*>/g, (tag) =>
    tag.replace(
      /\b(sz|spc|kern|lIns|rIns|tIns|bIns|marL|marR|indent|w|val)="(-?\d+)"/g,
      (attribute, key: string, value: string) => {
        if (key === 'val' && !tag.startsWith('<a:spcPts')) return attribute;
        return `${key}="${Math.round(Number(value) * scale)}"`;
      },
    ),
  );
  return xml;
}

function reserveImagePane(xml: string, slideWidth: number, slideHeight: number) {
  if (/<p:grpSp\b|<p:oleObj\b|<p:contentPart\b/.test(xml))
    fail('Grouped or embedded objects on this slide are not supported for this edit.');
  const matches = [...xml.matchAll(/<(p:(?:sp|pic|cxnSp|graphicFrame))(?=[\s>])[\s\S]*?<\/\1>/g)];
  const shapes = matches.map((match) => geometry(match[0], slideWidth, slideHeight));
  if (!shapes.length || shapes.length > 150)
    fail('This slide is outside the supported generated-slide layout.');
  const headerBottom = slideHeight * 0.275,
    footerTop = slideHeight * 0.91;
  const body = shapes.filter(
    (shape) => !shape.background && shape.y + shape.h > headerBottom && shape.y < footerTop,
  );
  const region = {
    x: slideWidth * 0.05,
    y: slideHeight * 0.29,
    w: slideWidth * 0.64,
    h: slideHeight * 0.6,
  };
  const pane = imagePane(slideWidth, slideHeight);
  if (!body.length) return { xml, pane };
  const minX = Math.min(...body.map((s) => s.x)),
    minY = Math.min(...body.map((s) => s.y));
  const maxX = Math.max(...body.map((s) => s.x + s.w)),
    maxY = Math.max(...body.map((s) => s.y + s.h));
  const scale = Math.min(
    1,
    region.w / Math.max(1, maxX - minX),
    region.h / Math.max(1, maxY - minY),
  );
  if (scale < 0.6)
    fail('This slide is too dense to add a picture without making its content too small.');
  for (const shape of body) {
    if (shape.h < 457_200) continue; // Small source captions and kickers are not body copy.
    const fontSizes = [
      ...shape.xml.matchAll(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*\bsz="(\d+)"/g),
    ].map((match) => Number(match[1]));
    if (fontSizes.some((size) => size * scale < 1200))
      fail('Adding a picture here would make the existing text too small. Your deck is unchanged.');
  }
  const dx = region.x - minX * scale;
  const dy = region.y + (region.h - (maxY - minY) * scale) / 2 - minY * scale;
  let index = 0;
  const next = xml.replace(/<(p:(?:sp|pic|cxnSp|graphicFrame))(?=[\s>])[\s\S]*?<\/\1>/g, () => {
    const shape = shapes[index++];
    return body.includes(shape) ? scaleShape(shape, scale, dx, dy) : shape.xml;
  });
  // All original text runs remain exact, even when the layout is rearranged.
  const texts = (value: string) =>
    [...value.matchAll(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>/g)].map((m) => m[0]);
  if (JSON.stringify(texts(next)) !== JSON.stringify(texts(xml)))
    fail('The slide text could not be preserved. Your deck is unchanged.');
  return { xml: next, pane };
}

async function ownedImageSlot(
  zip: JSZip,
  slide: string,
  rels: string,
  slideWidth: number,
  slideHeight: number,
) {
  const relationships = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map((m) => attrs(m[0]));
  const pane = imagePane(slideWidth, slideHeight);
  const slots: { xml: string; id: number; sha256: string; pane: ImagePane }[] = [];
  for (const match of slide.matchAll(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g)) {
    const xml = match[0];
    const markerTag = xml.match(/<insight:imagePane\b[^>]*\/>/)?.[0];
    const blip = xml.match(/<a:blip\b[^>]*>/)?.[0];
    const relId = blip ? attrs(blip)['r:embed'] : undefined;
    const refs = relationships.filter((relationship) => relationship.Id === relId);
    const relationship = refs[0];
    const media = relationship?.Target?.match(
      /^\.\.\/media\/(insight-image-([a-f0-9]{64})\.(?:png|jpeg))$/,
    );
    if (!markerTag && !media) continue;
    if (
      !media ||
      refs.length !== 1 ||
      relationship.Type !== `${REL_NS}/image` ||
      relationship.TargetMode === 'External' ||
      [...slide.matchAll(/\br:embed="([^"]+)"/g)].filter((ref) => ref[1] === relId).length !== 1
    )
      return fail(
        'The previously added picture has an unsupported reference. Your deck is unchanged.',
      );
    const part = zip.file(`ppt/media/${media[1]}`);
    if (!part) fail('The previously added picture is missing. Your deck is unchanged.');
    const bytes = await part!.async('nodebuffer');
    if (bytes.length > 8 * MB || createHash('sha256').update(bytes).digest('hex') !== media[2])
      fail('The previously added picture changed in the archive. Your deck is unchanged.');
    if (markerTag) {
      const marker = attrs(markerTag);
      if (
        marker['xmlns:insight'] !== IMAGE_PANE_NS ||
        marker.version !== '1' ||
        marker.sha256 !== media[2] ||
        [marker.x, marker.y, marker.cx, marker.cy].some(
          (value, i) => Number(value) !== Math.round([pane.x, pane.y, pane.w, pane.h][i]),
        )
      )
        fail(
          'The previously added picture has unsupported layout metadata. Your deck is unchanged.',
        );
    }
    const shape = geometry(xml, slideWidth, slideHeight);
    if (
      shape.w < 1 ||
      shape.h < 1 ||
      shape.x < pane.x - 1 ||
      shape.y < pane.y - 1 ||
      shape.x + shape.w > pane.x + pane.w + 1 ||
      shape.y + shape.h > pane.y + pane.h + 1
    )
      fail('The previously added picture moved outside its reserved area. Your deck is unchanged.');
    const property = xml.match(/<p:cNvPr\b[^>]*>/)?.[0];
    const id = property ? Number(attrs(property).id) : NaN;
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      [...slide.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].filter((match) => Number(match[1]) === id)
        .length !== 1
    )
      fail('The previously added picture has invalid object metadata. Your deck is unchanged.');
    slots.push({ xml, id, sha256: media[2], pane });
  }
  if (slots.length > 1)
    fail('This slide has several added pictures. Choose a single picture before replacing it.');
  const slot = slots[0];
  if (!slot) return undefined;
  if (/<p:grpSp\b|<p:oleObj\b|<p:contentPart\b/.test(slide))
    fail('Grouped or embedded objects on this slide are not supported for this edit.');
  const shapes = [...slide.matchAll(/<(p:(?:sp|pic|cxnSp|graphicFrame))(?=[\s>])[\s\S]*?<\/\1>/g)];
  if (shapes.length > 151) fail('This slide is outside the supported generated-slide layout.');
  // Also check legacy slots: the old editor did not record pane metadata. A
  // moved text box or an unrelated picture in this area must remain untouched.
  for (const match of shapes) {
    if (match[0] === slot.xml) continue;
    const shape = geometry(match[0], slideWidth, slideHeight);
    if (
      !shape.background &&
      shape.x < pane.x + pane.w &&
      shape.x + shape.w > pane.x &&
      shape.y < pane.y + pane.h &&
      shape.y + shape.h > pane.y
    )
      fail('The picture area now overlaps existing content. Your deck is unchanged.');
  }
  return slot;
}

function generatedSlideTitle(slide: string, slideHeight: number, fallbackTexts: string[]) {
  const branding = /^(?:INSIGHTOS PRESENTATION|INSIGHT\s*\/\s*VOICE-DIRECTED WORK)$/i;
  const candidates = [...slide.matchAll(/<p:sp(?=[\s>])[\s\S]*?<\/p:sp>/g)].flatMap((match) => {
    const xml = match[0];
    if (/<p:cNvPr\b[^>]*\bhidden="1"/.test(xml)) return [];
    const text = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((run) => decodeXml(run[1]).trim())
      .filter(Boolean)
      .join(' ');
    if (!text || branding.test(text)) return [];
    const transform = xml.match(/<(?:a|p):xfrm\b[^>]*>[\s\S]*?<\/(?:a|p):xfrm>/)?.[0];
    const originTag = transform?.match(/<a:off\b[^>]*\/>/)?.[0];
    const y = originTag ? Number(attrs(originTag).y) : 0;
    if (Number.isFinite(y) && y >= slideHeight * 0.9) return [];
    const placeholder = xml.match(/<p:ph\b[^>]*\/>/)?.[0];
    const type = placeholder ? attrs(placeholder).type : '';
    const titlePlaceholder = type === 'title' || type === 'ctrTitle';
    const sizes = [...xml.matchAll(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*\bsz="(\d+)"/g)].map(
      (font) => Number(font[1]),
    );
    return [
      { text, titlePlaceholder, fontSize: Math.max(0, ...sizes), y: Number.isFinite(y) ? y : 0 },
    ];
  });
  candidates.sort(
    (a, b) =>
      Number(b.titlePlaceholder) - Number(a.titlePlaceholder) ||
      b.fontSize - a.fontSize ||
      a.y - b.y,
  );
  return candidates[0]?.text ?? fallbackTexts.find((text) => !branding.test(text)) ?? '';
}

async function loadGeneratedPresentationSlide(
  inputFile: string,
  target: number | 'last',
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!path.isAbsolute(inputFile) || path.extname(inputFile).toLowerCase() !== '.pptx')
    fail('Use an absolute path to an InsightOS PowerPoint file.');
  const info = await lstat(inputFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_ARCHIVE)
    fail('The source presentation must be an ordinary file under 40 MB.');
  if ((await realpath(inputFile)).toLowerCase() !== path.resolve(inputFile).toLowerCase())
    fail('The source presentation must not use symbolic links.');
  const source = await readFile(inputFile);
  if (source.length > MAX_ARCHIVE) fail('The source presentation changed size. Try again.');
  validateZipDirectory(source);
  const zip = await JSZip.loadAsync(source, { checkCRC32: true });
  const core = await readXml(zip, 'docProps/core.xml');
  if (!/<dc:creator>InsightOS<\/dc:creator>/.test(core))
    fail('This operation currently supports presentations created by InsightOS.');
  const presentation = await readXml(zip, 'ppt/presentation.xml');
  const sizeTag = presentation.match(/<p:sldSz\b[^>]*\/>/)?.[0];
  if (!sizeTag) fail('This presentation is missing its slide dimensions.');
  const size = attrs(sizeTag!),
    slideWidth = Number(size.cx),
    slideHeight = Number(size.cy);
  if (
    ![slideWidth, slideHeight].every(
      (value) => Number.isSafeInteger(value) && value > 1_000_000 && value < 40_000_000,
    )
  )
    fail('This presentation has unsupported slide dimensions.');
  const slides = [...presentation.matchAll(/<p:sldId\b[^>]*\/>/g)].map((m) => attrs(m[0])['r:id']);
  if (slides.length < 1 || slides.length > 20 || new Set(slides).size !== slides.length)
    fail('This presentation has an unsupported slide list.');
  const slideNumber = target === 'last' ? slides.length : target;
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > slides.length)
    fail(`Choose a slide from 1 to ${slides.length}. Your deck is unchanged.`);
  const relationships = await readXml(zip, 'ppt/_rels/presentation.xml.rels');
  const relationship = [...relationships.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((m) => attrs(m[0]))
    .find((r) => r.Id === slides[slideNumber - 1]);
  if (
    !relationship ||
    relationship.Type !== `${REL_NS}/slide` ||
    relationship.TargetMode === 'External' ||
    !relationship.Target
  )
    fail('This presentation has an unsupported slide relationship.');
  const slidePath = path.posix.normalize(path.posix.join('ppt', relationship!.Target));
  if (!/^ppt\/slides\/slide\d+\.xml$/.test(slidePath))
    fail('This presentation has an unsupported slide path.');
  const slide = await readXml(zip, slidePath);
  if (!slide.includes('</p:spTree>')) fail('This slide is missing its editable shapes.');
  const originalSlideTexts = [...slide.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXml(match[1]).trim())
    .filter(Boolean);
  signal?.throwIfAborted();
  return {
    zip,
    slide,
    slidePath,
    slideWidth,
    slideHeight,
    slideNumber,
    slideCount: slides.length,
    originalSlideTexts,
    slideTitle:
      generatedSlideTitle(slide, slideHeight, originalSlideTexts) || `Slide ${slideNumber}`,
  };
}

/** Read stored text and image accessibility metadata, without inventing a caption
 * or asking a model to describe the slide. This does not launch PowerPoint.
 */
export async function readGeneratedPresentationSlide(request: {
  inputFile: string;
  target: number | 'last';
  signal?: AbortSignal;
}): Promise<{
  slideNumber: number;
  slideCount: number;
  title: string;
  texts: string[];
  images: { name: string; altText: string }[];
}> {
  const loaded = await loadGeneratedPresentationSlide(
    request.inputFile,
    request.target,
    request.signal,
  );
  const images = [...loaded.slide.matchAll(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g)].map((match) => {
    const propertyTag = match[0].match(/<p:cNvPr\b[^>]*>/)?.[0];
    const properties = propertyTag ? attrs(propertyTag) : {};
    return {
      name: decodeXml(properties.name ?? 'Picture'),
      altText: decodeXml(properties.descr ?? ''),
    };
  });
  request.signal?.throwIfAborted();
  return {
    slideNumber: loaded.slideNumber,
    slideCount: loaded.slideCount,
    title: loaded.slideTitle,
    texts: loaded.originalSlideTexts,
    images,
  };
}

/** Fill one image pane on one InsightOS-generated slide, on a new copy.
 * Repeated requests replace the owned insertion without shrinking text again.
 * This intentionally does not import arbitrary user PPTX or regenerate content.
 */
export async function addImageToGeneratedPresentation(edit: GeneratedSlideImageEdit) {
  edit.signal?.throwIfAborted();
  if (!path.isAbsolute(edit.outputFile) || path.extname(edit.outputFile).toLowerCase() !== '.pptx')
    fail('Presentation edits need an absolute PowerPoint output path.');
  if (path.resolve(edit.inputFile).toLowerCase() === path.resolve(edit.outputFile).toLowerCase())
    fail('An image edit must create a new copy rather than overwrite your presentation.');
  if (edit.mode !== undefined && edit.mode !== 'insert' && edit.mode !== 'replace')
    fail('Choose whether to insert or replace the added picture.');
  const {
    zip,
    slide,
    slidePath,
    slideWidth,
    slideHeight,
    slideNumber,
    slideCount,
    originalSlideTexts,
    slideTitle,
  } = await loadGeneratedPresentationSlide(edit.inputFile, edit.target, edit.signal);
  const imageBytes = Buffer.from(edit.image.bytes);
  if (
    !imageBytes.length ||
    imageBytes.length > 8 * MB ||
    !edit.image.filename ||
    edit.image.filename !== path.basename(edit.image.filename) ||
    !/\.(?:png|jpe?g)$/i.test(edit.image.filename) ||
    !edit.image.altText.trim() ||
    edit.image.altText.length > 1500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(edit.image.altText)
  )
    fail('Use one PNG or JPG under 8 MB with a short image description.');
  const png = imageBytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg = imageBytes[0] === 255 && imageBytes[1] === 216 && imageBytes[2] === 255;
  if (!png && !jpeg) fail('The selected image is not a valid PNG or JPEG.');
  if (png) {
    if (imageBytes.length < 24 || imageBytes.subarray(12, 16).toString('ascii') !== 'IHDR')
      fail('The selected PNG is missing its image dimensions.');
    const width = imageBytes.readUInt32BE(16),
      height = imageBytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width * height > 25_000_000)
      fail('Use a picture under 25 megapixels.');
  }
  const image = await loadImage(imageBytes).catch(() =>
    fail('The selected image could not be read.'),
  );
  if (image.width < 1 || image.height < 1 || image.width * image.height > 25_000_000)
    fail('Use a picture under 25 megapixels.');
  edit.signal?.throwIfAborted();
  const relPath = `${path.posix.dirname(slidePath)}/_rels/${path.posix.basename(slidePath)}.rels`;
  let rels = await readXml(zip, relPath);
  if (!rels.includes('</Relationships>')) fail('This slide has invalid image relationships.');
  const slot = await ownedImageSlot(zip, slide, rels, slideWidth, slideHeight);
  if (slot && edit.mode === 'insert')
    fail(
      'This slide already has an added picture. Replace that picture to keep the existing text readable.',
    );
  if (!slot && edit.mode === 'replace')
    fail(
      'This slide has no picture previously added by Insight to replace. Your deck is unchanged.',
    );
  const operation = slot ? ('replaced' as const) : ('inserted' as const);
  const reserved = slot
    ? { xml: slide, pane: slot.pane }
    : reserveImagePane(slide, slideWidth, slideHeight);
  const imageScale = Math.min(reserved.pane.w / image.width, reserved.pane.h / image.height);
  const w = Math.round(image.width * imageScale),
    h = Math.round(image.height * imageScale);
  const x = Math.round(reserved.pane.x + (reserved.pane.w - w) / 2);
  const y = Math.round(reserved.pane.y + (reserved.pane.h - h) / 2);
  const usedIds = new Set([...rels.matchAll(/\bId="([^"]+)"/g)].map((m) => m[1]));
  let relIndex = 1;
  while (usedIds.has(`rId${relIndex}`)) relIndex++;
  const relId = `rId${relIndex}`;
  const objectIds = [...slide.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]));
  const objectId = slot?.id ?? Math.max(0, ...objectIds) + 1;
  const imageSha256 = createHash('sha256').update(imageBytes).digest('hex');
  const extension = png ? 'png' : 'jpeg';
  const mediaName = `insight-image-${imageSha256}.${extension}`;
  const mediaPath = `ppt/media/${mediaName}`;
  const existingMedia = zip.file(mediaPath);
  if (existingMedia && !(await existingMedia.async('nodebuffer')).equals(imageBytes))
    fail('The image archive reference conflicts with an existing image.');
  const marker = `<a:extLst><a:ext uri="${IMAGE_PANE_EXT}"><insight:imagePane xmlns:insight="${IMAGE_PANE_NS}" version="1" sha256="${imageSha256}" x="${Math.round(reserved.pane.x)}" y="${Math.round(reserved.pane.y)}" cx="${Math.round(reserved.pane.w)}" cy="${Math.round(reserved.pane.h)}"/></a:ext></a:extLst>`;
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="${objectId}" name="${escapeXml(edit.image.filename)}" descr="${escapeXml(edit.image.altText.trim())}">${marker}</p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
  const editedSlide = slot
    ? reserved.xml.replace(slot.xml, picture)
    : reserved.xml.replace('</p:spTree>', `${picture}</p:spTree>`);
  rels = rels.replace(
    '</Relationships>',
    `<Relationship Id="${relId}" Type="${REL_NS}/image" Target="../media/${mediaName}"/></Relationships>`,
  );
  let contentTypes = await readXml(zip, '[Content_Types].xml');
  const imageType = `image/${extension}`;
  const defaultType = [...contentTypes.matchAll(/<Default\b[^>]*\/>/g)]
    .map((m) => attrs(m[0]))
    .find((type) => type.Extension.toLowerCase() === extension);
  if (defaultType && defaultType.ContentType !== imageType)
    fail('This archive uses an unsupported image content type.');
  if (!defaultType) {
    if (!contentTypes.includes('</Types>')) fail('This archive has invalid content types.');
    contentTypes = contentTypes.replace(
      '</Types>',
      `<Default Extension="${extension}" ContentType="${imageType}"/></Types>`,
    );
    zip.file('[Content_Types].xml', contentTypes);
  }
  zip.file(slidePath, editedSlide);
  zip.file(relPath, rels);
  if (!existingMedia) zip.file(mediaPath, imageBytes);
  const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  edit.signal?.throwIfAborted();
  try {
    await writeFile(edit.outputFile, output, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      fail('That output already exists. Choose a new revision name; no file was overwritten.');
    throw error;
  }
  return {
    file: edit.outputFile,
    slideNumber,
    slideCount,
    imageSha256,
    width: image.width,
    height: image.height,
    altText: edit.image.altText.trim(),
    originalSlideTexts,
    slideTitle,
    operation,
    ...(slot ? { replacedImageSha256: slot.sha256 } : {}),
  };
}
