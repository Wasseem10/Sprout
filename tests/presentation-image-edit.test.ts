import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { createCanvas } from '@napi-rs/canvas';
import PptxGenJS from 'pptxgenjs';
import { writePresentation } from '../server/computer/presentation';
import { writePictureDeck } from '../server/computer/presentation-project';
import {
  addImageToGeneratedPresentation,
  readGeneratedPresentationSlide,
} from '../server/computer/presentation-image-edit';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'insight-slide-image-'));
  directories.push(directory);
  const inputFile = path.join(directory, 'original.pptx');
  const outputFile = path.join(directory, 'revision.pptx');
  await writePresentation(
    {
      title: 'Declaration of Independence',
      subtitle: 'The original editable draft',
      slides: [
        {
          title: 'Context',
          points: ['A first original point with unchanged content', 'A second original point'],
        },
        {
          title: 'Main sections & content',
          points: [
            'Introduction & preamble',
            'Rights and grievances',
            'Declaration and conclusion',
          ],
        },
      ],
    },
    inputFile,
  );
  const canvas = createCanvas(320, 160);
  canvas.getContext('2d').fillStyle = '#245ea8';
  canvas.getContext('2d').fillRect(0, 0, 320, 160);
  const image = {
    bytes: canvas.toBuffer('image/png'),
    filename: 'our & marketing.png',
    altText: 'Marketing picture: a blue rectangle, supplied by the user.',
  };
  return { directory, inputFile, outputFile, image };
}

const textRuns = (xml: string) =>
  [...xml.matchAll(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>/g)].map((m) => m[0]);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const withoutOwnedPicture = (xml: string) =>
  xml.replace(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g, (picture) =>
    picture.includes('<insight:imagePane') ? '' : picture,
  );
function replacementImage() {
  const canvas = createCanvas(140, 280);
  const context = canvas.getContext('2d');
  context.fillStyle = '#a85424';
  context.fillRect(0, 0, 140, 280);
  return {
    bytes: canvas.toBuffer('image/png'),
    filename: 'replacement.png',
    altText: 'A portrait replacement supplied by the user.',
  };
}
function objects(xml: string) {
  return [...xml.matchAll(/<(p:(?:sp|pic|cxnSp|graphicFrame))(?=[\s>])[\s\S]*?<\/\1>/g)].map(
    (match) => {
      const geometry = match[0].match(/<(?:a|p):xfrm\b[^>]*>[\s\S]*?<\/(?:a|p):xfrm>/)![0];
      const off = geometry.match(/<a:off x="(\d+)" y="(\d+)"/)!,
        extent = geometry.match(/<a:ext cx="(\d+)" cy="(\d+)"/)!;
      return {
        xml: match[0],
        x: Number(off[1]),
        y: Number(off[2]),
        w: Number(extent[1]),
        h: Number(extent[2]),
      };
    },
  );
}

describe('adding one image to a generated slide without regenerating its content', () => {
  it('edits only the last slide, preserves all original text and other archive parts, and embeds exact bytes', async () => {
    const edit = await fixture();
    const original = await readFile(edit.inputFile);
    const sourceZip = await JSZip.loadAsync(original);
    const result = await addImageToGeneratedPresentation({ ...edit, target: 'last' });
    expect(result).toMatchObject({
      file: edit.outputFile,
      slideNumber: 3,
      slideCount: 3,
      width: 320,
      height: 160,
      slideTitle: 'Main sections & content',
      imageSha256: createHash('sha256').update(edit.image.bytes).digest('hex'),
      operation: 'inserted',
    });
    expect(result.originalSlideTexts).toContain('Introduction & preamble');
    expect((await readFile(edit.inputFile)).equals(original)).toBe(true);
    const revised = await JSZip.loadAsync(await readFile(edit.outputFile), { checkCRC32: true });
    for (const [name, part] of Object.entries(sourceZip.files)) {
      if (
        part.dir ||
        [
          'ppt/slides/slide3.xml',
          'ppt/slides/_rels/slide3.xml.rels',
          '[Content_Types].xml',
        ].includes(name)
      )
        continue;
      expect(
        (await revised.file(name)!.async('nodebuffer')).equals(await part.async('nodebuffer')),
        name,
      ).toBe(true);
    }
    const originalSlide = await sourceZip.file('ppt/slides/slide3.xml')!.async('string');
    const newSlide = await revised.file('ppt/slides/slide3.xml')!.async('string');
    expect(textRuns(newSlide)).toEqual(textRuns(originalSlide));
    expect(newSlide.match(/<p:sp>/g)?.length).toBe(originalSlide.match(/<p:sp>/g)?.length);
    expect(newSlide).toContain('name="our &amp; marketing.png"');
    expect(newSlide).toContain(`descr="${edit.image.altText}"`);
    const rels = await revised.file('ppt/slides/_rels/slide3.xml.rels')!.async('string');
    expect(rels).toContain('Target="../slideLayouts/slideLayout1.xml"');
    expect(rels).toContain('Target="../notesSlides/notesSlide3.xml"');
    const newImagePath = Object.keys(revised.files).find((name) =>
      name.startsWith('ppt/media/insight-image-'),
    )!;
    expect((await revised.file(newImagePath)!.async('nodebuffer')).equals(edit.image.bytes)).toBe(
      true,
    );
    expect(rels).toContain(`Target="../media/${path.posix.basename(newImagePath)}"`);
    expect(await revised.file('[Content_Types].xml')!.async('string')).toContain(
      'ContentType="image/png"',
    );
    const shapes = objects(newSlide),
      picture = shapes[shapes.length - 1];
    expect(picture.xml).toContain('<p:pic>');
    expect(picture.w / picture.h).toBeCloseTo(2, 5);
    for (const existing of shapes.slice(0, -1)) {
      const overlaps =
        existing.x < picture.x + picture.w &&
        existing.x + existing.w > picture.x &&
        existing.y < picture.y + picture.h &&
        existing.y + existing.h > picture.y;
      expect(overlaps, existing.xml.slice(0, 100)).toBe(false);
    }
  });

  it('keeps diagram stages, arrows and exact text editable while adding the photo alongside them', async () => {
    const edit = await fixture();
    const hash = createHash('sha256').update(edit.image.bytes).digest('hex');
    await writePictureDeck(
      {
        title: 'Marketing plan',
        subtitle: 'An editable proposed workflow',
        theme: 'dark',
        slides: [
          {
            title: 'Campaign',
            imageId: 1,
            points: ['Share a proposed campaign', 'Review it with stakeholders'],
          },
        ],
        diagram: {
          title: 'Customer journey',
          stages: [
            { label: 'Awareness', detail: 'Introduce the campaign' },
            { label: 'Consideration', detail: 'Explain the product' },
            { label: 'Conversion', detail: 'Make the next step clear' },
          ],
        },
      },
      {
        root: edit.directory,
        brief: '',
        briefName: null,
        assets: [
          {
            id: 1,
            filename: 'marketing.png',
            description: 'A synthetic blue rectangle',
            sha256: hash,
            width: 320,
            height: 160,
            data: `data:image/png;base64,${Buffer.from(edit.image.bytes).toString('base64')}`,
            preview: '',
          },
        ],
      },
      edit.inputFile,
    );
    const source = await JSZip.loadAsync(await readFile(edit.inputFile));
    const prior = await source.file('ppt/slides/slide3.xml')!.async('string');
    await addImageToGeneratedPresentation({ ...edit, target: 3 });
    const revised = await JSZip.loadAsync(await readFile(edit.outputFile));
    const slide = await revised.file('ppt/slides/slide3.xml')!.async('string');
    expect(textRuns(slide)).toEqual(textRuns(prior));
    expect(slide.match(/<p:sp>/g)?.length).toBe(prior.match(/<p:sp>/g)?.length);
    expect(slide.match(/endArrowType|type="triangle"/g)?.length).toBe(
      prior.match(/endArrowType|type="triangle"/g)?.length,
    );
    expect(slide).toContain('<a:t>Awareness</a:t>');
    const shapes = objects(slide),
      picture = shapes.at(-1)!;
    for (const existing of shapes.slice(0, -1)) {
      expect(
        existing.x < picture.x + picture.w &&
          existing.x + existing.w > picture.x &&
          existing.y < picture.y + picture.h &&
          existing.y + existing.h > picture.y,
      ).toBe(false);
    }
  });

  it.each([0, 4, -1, 1.5])(
    'rejects invalid slide %s without creating an output',
    async (target) => {
      const edit = await fixture();
      await expect(addImageToGeneratedPresentation({ ...edit, target })).rejects.toThrow(
        'Choose a slide from 1 to 3',
      );
      await expect(readFile(edit.outputFile)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('selects the numbered slide instead of silently editing the last one', async () => {
    const edit = await fixture();
    await addImageToGeneratedPresentation({ ...edit, target: 2 });
    const original = await JSZip.loadAsync(await readFile(edit.inputFile));
    const revised = await JSZip.loadAsync(await readFile(edit.outputFile));
    expect(await revised.file('ppt/slides/slide3.xml')!.async('string')).toBe(
      await original.file('ppt/slides/slide3.xml')!.async('string'),
    );
    expect(await revised.file('ppt/slides/slide2.xml')!.async('string')).toContain('<p:pic>');
  });

  it('replaces the owned image repeatedly without changing text, object geometry, other parts or prior media', async () => {
    const edit = await fixture();
    await addImageToGeneratedPresentation({ ...edit, target: 'last' });
    const firstRevision = await readFile(edit.outputFile);
    const firstZip = await JSZip.loadAsync(firstRevision);
    const firstSlide = await firstZip.file('ppt/slides/slide3.xml')!.async('string');
    const originalObjects = withoutOwnedPicture(firstSlide);
    const originalId = objects(firstSlide)
      .at(-1)!
      .xml.match(/<p:cNvPr id="(\d+)"/)![1];
    let inputFile = edit.outputFile;
    let previousHash = sha256(edit.image.bytes);
    for (const [index, image] of [replacementImage(), edit.image, replacementImage()].entries()) {
      const outputFile = path.join(edit.directory, `replacement-${index}.pptx`);
      const result = await addImageToGeneratedPresentation({
        ...edit,
        inputFile,
        outputFile,
        image,
        target: 3,
      });
      expect(result).toMatchObject({
        operation: 'replaced',
        imageSha256: sha256(image.bytes),
        replacedImageSha256: previousHash,
      });
      const zip = await JSZip.loadAsync(await readFile(outputFile), { checkCRC32: true });
      const slide = await zip.file('ppt/slides/slide3.xml')!.async('string');
      expect(withoutOwnedPicture(slide)).toBe(originalObjects);
      expect(textRuns(slide)).toEqual(textRuns(firstSlide));
      const pictures = objects(slide).filter((shape) => shape.xml.startsWith('<p:pic>'));
      expect(pictures).toHaveLength(1);
      expect(pictures[0].xml).toContain(`id="${originalId}"`);
      expect(pictures[0].w / pictures[0].h).toBeCloseTo(index % 2 === 0 ? 0.5 : 2, 5);
      expect(
        (await readGeneratedPresentationSlide({ inputFile: outputFile, target: 3 })).images,
      ).toEqual([{ name: image.filename, altText: image.altText }]);
      for (const [name, part] of Object.entries(firstZip.files)) {
        if (
          part.dir ||
          ['ppt/slides/slide3.xml', 'ppt/slides/_rels/slide3.xml.rels'].includes(name)
        )
          continue;
        expect(
          (await zip.file(name)!.async('nodebuffer')).equals(await part.async('nodebuffer')),
          name,
        ).toBe(true);
      }
      inputFile = outputFile;
      previousHash = sha256(image.bytes);
    }
    expect((await readFile(edit.outputFile)).equals(firstRevision)).toBe(true);
  });

  it('reserves a different slide independently after the first insertion, preserving the already edited slide', async () => {
    const edit = await fixture();
    await addImageToGeneratedPresentation({ ...edit, target: 3 });
    const firstZip = await JSZip.loadAsync(await readFile(edit.outputFile));
    const secondOutput = path.join(edit.directory, 'second-slide.pptx');
    const image = replacementImage();
    const result = await addImageToGeneratedPresentation({
      ...edit,
      inputFile: edit.outputFile,
      outputFile: secondOutput,
      image,
      target: 2,
    });
    expect(result).toMatchObject({ operation: 'inserted', slideNumber: 2 });
    const secondZip = await JSZip.loadAsync(await readFile(secondOutput));
    for (const name of [
      'ppt/slides/slide1.xml',
      'ppt/slides/slide3.xml',
      'ppt/slides/_rels/slide3.xml.rels',
    ])
      expect(await secondZip.file(name)!.async('string')).toBe(
        await firstZip.file(name)!.async('string'),
      );
    const independentOutput = path.join(edit.directory, 'independent.pptx');
    await addImageToGeneratedPresentation({
      ...edit,
      outputFile: independentOutput,
      image,
      target: 2,
    });
    const independentZip = await JSZip.loadAsync(await readFile(independentOutput));
    expect(await secondZip.file('ppt/slides/slide2.xml')!.async('string')).toBe(
      await independentZip.file('ppt/slides/slide2.xml')!.async('string'),
    );
    expect(await secondZip.file('ppt/slides/_rels/slide2.xml.rels')!.async('string')).toBe(
      await independentZip.file('ppt/slides/_rels/slide2.xml.rels')!.async('string'),
    );
  });

  it('recognizes a legacy owned insertion by its verified media hash and replaces it in the same pane', async () => {
    const edit = await fixture();
    await addImageToGeneratedPresentation({ ...edit, target: 3 });
    const zip = await JSZip.loadAsync(await readFile(edit.outputFile));
    const slidePath = 'ppt/slides/slide3.xml';
    const legacySlide = (await zip.file(slidePath)!.async('string')).replace(
      /<a:extLst><a:ext uri="\{DDFAE4E4-8035-4E5D-A997-6FBB00A7C1DC\}">[\s\S]*?<\/a:ext><\/a:extLst>/,
      '',
    );
    expect(legacySlide).not.toContain('<insight:imagePane');
    zip.file(slidePath, legacySlide);
    const legacyFile = path.join(edit.directory, 'legacy.pptx');
    await writeFile(legacyFile, await zip.generateAsync({ type: 'nodebuffer' }));
    const outputFile = path.join(edit.directory, 'legacy-replaced.pptx');
    const result = await addImageToGeneratedPresentation({
      ...edit,
      inputFile: legacyFile,
      outputFile,
      image: replacementImage(),
      target: 3,
      mode: 'replace',
    });
    expect(result.operation).toBe('replaced');
    const revised = await JSZip.loadAsync(await readFile(outputFile));
    expect(withoutOwnedPicture(await revised.file(slidePath)!.async('string'))).toBe(
      legacySlide.replace(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/, ''),
    );
  });

  it('rejects explicit insertion into an occupied pane and explicit replacement on a fresh slide', async () => {
    const edit = await fixture();
    await addImageToGeneratedPresentation({ ...edit, target: 3 });
    const secondOutput = path.join(edit.directory, 'second-revision.pptx');
    await expect(
      addImageToGeneratedPresentation({
        ...edit,
        inputFile: edit.outputFile,
        outputFile: secondOutput,
        target: 'last',
        mode: 'insert',
      }),
    ).rejects.toThrow('Replace that picture');
    await expect(
      addImageToGeneratedPresentation({
        ...edit,
        outputFile: secondOutput,
        target: 2,
        mode: 'replace',
      }),
    ).rejects.toThrow('no picture previously added by Insight');
    await expect(readFile(secondOutput)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a source picture and native chart/workbook when adding and then replacing a separate picture', async () => {
    const edit = await fixture();
    const pptx = new (PptxGenJS as unknown as new () => any)();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'InsightOS';
    const slide = pptx.addSlide();
    slide.addText('Regional results', { x: 0.7, y: 0.7, w: 11.5, h: 0.8, fontSize: 32 });
    slide.addChart(
      pptx.ChartType.bar,
      [{ name: 'Revenue', labels: ['North', 'South'], values: [125, 141] }],
      { x: 0.7, y: 2.3, w: 6.4, h: 3.7, showValue: true, showLegend: false },
    );
    slide.addImage({
      data: `data:image/png;base64,${Buffer.from(edit.image.bytes).toString('base64')}`,
      x: 7.8,
      y: 2.5,
      w: 4.5,
      h: 2.25,
      altText: 'Original blue source picture: keep this metadata.',
    });
    slide.addText('Original source caption', { x: 7.8, y: 5, w: 4.5, h: 0.7, fontSize: 20 });
    await pptx.writeFile({ fileName: edit.inputFile });
    const originalBytes = await readFile(edit.inputFile);
    const original = await JSZip.loadAsync(originalBytes);
    const image = replacementImage();
    // Replacement must not target the original picture generated by PptxGenJS.
    await expect(
      addImageToGeneratedPresentation({ ...edit, image, target: 1, mode: 'replace' }),
    ).rejects.toThrow('no picture previously added by Insight');
    const first = await addImageToGeneratedPresentation({ ...edit, image, target: 1 });
    expect(first.operation).toBe('inserted');
    const inserted = await JSZip.loadAsync(await readFile(edit.outputFile));
    const insertedSlide = await inserted.file('ppt/slides/slide1.xml')!.async('string');
    const chart = objects(insertedSlide).find((shape) => shape.xml.startsWith('<p:graphicFrame>'))!;
    const originalPicture = objects(insertedSlide).find(
      (shape) => shape.xml.startsWith('<p:pic>') && !shape.xml.includes('<insight:imagePane'),
    )!;
    expect(originalPicture.xml).toContain(
      'descr="Original blue source picture: keep this metadata."',
    );
    const outputFile = path.join(edit.directory, 'chart-replacement.pptx');
    await addImageToGeneratedPresentation({
      ...edit,
      inputFile: edit.outputFile,
      outputFile,
      target: 1,
      mode: 'replace',
    });
    const replaced = await JSZip.loadAsync(await readFile(outputFile), { checkCRC32: true });
    const replacedSlide = await replaced.file('ppt/slides/slide1.xml')!.async('string');
    expect(replacedSlide).toContain(chart.xml);
    expect(replacedSlide).toContain(originalPicture.xml);
    expect(withoutOwnedPicture(replacedSlide)).toBe(withoutOwnedPicture(insertedSlide));
    const payloads = Object.keys(original.files).filter(
      (name) => /^ppt\/(charts|embeddings|media)\//.test(name) && !original.files[name].dir,
    );
    expect(payloads.some((name) => name.endsWith('.xlsx'))).toBe(true);
    expect(payloads.some((name) => /chart\d+\.xml$/.test(name))).toBe(true);
    for (const name of payloads)
      expect(
        (await replaced.file(name)!.async('nodebuffer')).equals(
          await original.file(name)!.async('nodebuffer'),
        ),
        name,
      ).toBe(true);
    expect((await readFile(edit.inputFile)).equals(originalBytes)).toBe(true);
  });

  it('still enforces the 12 point body-text floor on a first insertion', async () => {
    const edit = await fixture();
    const original = await JSZip.loadAsync(await readFile(edit.inputFile));
    const slidePath = 'ppt/slides/slide3.xml';
    const slide = await original.file(slidePath)!.async('string');
    original.file(slidePath, slide.replace(/sz="(?:2200|2400)"/g, 'sz="1400"'));
    await writeFile(edit.inputFile, await original.generateAsync({ type: 'nodebuffer' }));
    const sourceBytes = await readFile(edit.inputFile);
    await expect(addImageToGeneratedPresentation({ ...edit, target: 3 })).rejects.toThrow(
      'existing text too small',
    );
    expect((await readFile(edit.inputFile)).equals(sourceBytes)).toBe(true);
    await expect(readFile(edit.outputFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['hash', 'overlap', 'position'])(
    'rejects replacement if an owned %s was changed',
    async (change) => {
      const edit = await fixture();
      await addImageToGeneratedPresentation({ ...edit, target: 3 });
      const zip = await JSZip.loadAsync(await readFile(edit.outputFile));
      const slidePath = 'ppt/slides/slide3.xml';
      const slide = await zip.file(slidePath)!.async('string');
      if (change === 'hash') {
        const mediaPath = Object.keys(zip.files).find((name) =>
          name.startsWith('ppt/media/insight-image-'),
        )!;
        zip.file(mediaPath, replacementImage().bytes);
      } else if (change === 'overlap') {
        zip.file(
          slidePath,
          slide.replace(/<p:sp>[\s\S]*?<\/p:sp>/, (shape) =>
            shape
              .replace(/<a:off x="\d+" y="\d+"\/>/, '<a:off x="9000000" y="3000000"/>')
              .replace(/<a:ext cx="\d+" cy="\d+"\/>/, '<a:ext cx="1000000" cy="1000000"/>'),
          ),
        );
      } else {
        zip.file(
          slidePath,
          slide.replace(/<p:pic>[\s\S]*?<\/p:pic>/, (picture) =>
            picture.replace(/<a:off x="\d+" y="\d+"\/>/, '<a:off x="100000" y="100000"/>'),
          ),
        );
      }
      const changedFile = path.join(edit.directory, 'changed.pptx');
      await writeFile(changedFile, await zip.generateAsync({ type: 'nodebuffer' }));
      const outputFile = path.join(edit.directory, 'unsafe-replacement.pptx');
      await expect(
        addImageToGeneratedPresentation({ ...edit, inputFile: changedFile, outputFile, target: 3 }),
      ).rejects.toThrow(
        change === 'hash'
          ? 'picture changed'
          : change === 'overlap'
            ? 'overlaps existing content'
            : 'moved outside',
      );
      await expect(readFile(outputFile)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('never overwrites an existing revision or the original', async () => {
    const edit = await fixture();
    await writeFile(edit.outputFile, 'existing user file');
    await expect(addImageToGeneratedPresentation({ ...edit, target: 'last' })).rejects.toThrow(
      'no file was overwritten',
    );
    expect(await readFile(edit.outputFile, 'utf8')).toBe('existing user file');
    await expect(
      addImageToGeneratedPresentation({ ...edit, outputFile: edit.inputFile, target: 'last' }),
    ).rejects.toThrow('rather than overwrite');
  });

  it('rejects non-images, too-large pictures, and unowned presentations without writing', async () => {
    const edit = await fixture();
    await expect(
      addImageToGeneratedPresentation({
        ...edit,
        target: 'last',
        image: { ...edit.image, bytes: Buffer.from('not a PNG') },
      }),
    ).rejects.toThrow('not a valid PNG');
    await expect(
      addImageToGeneratedPresentation({
        ...edit,
        target: 'last',
        image: { ...edit.image, bytes: Buffer.alloc(8 * 1024 * 1024 + 1) },
      }),
    ).rejects.toThrow('under 8 MB');
    const zip = await JSZip.loadAsync(await readFile(edit.inputFile));
    zip.file(
      'docProps/core.xml',
      (await zip.file('docProps/core.xml')!.async('string')).replace(
        '<dc:creator>InsightOS</dc:creator>',
        '<dc:creator>Another app</dc:creator>',
      ),
    );
    await writeFile(edit.inputFile, await zip.generateAsync({ type: 'nodebuffer' }));
    await expect(addImageToGeneratedPresentation({ ...edit, target: 'last' })).rejects.toThrow(
      'created by InsightOS',
    );
    await expect(readFile(edit.outputFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cancels before writing and rejects malformed archives', async () => {
    const edit = await fixture();
    const abort = new AbortController();
    abort.abort();
    await expect(
      addImageToGeneratedPresentation({ ...edit, target: 'last', signal: abort.signal }),
    ).rejects.toThrow();
    await expect(readFile(edit.outputFile)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(edit.inputFile, Buffer.from('not an Office archive'));
    await expect(addImageToGeneratedPresentation({ ...edit, target: 'last' })).rejects.toThrow(
      'not a supported PowerPoint archive',
    );
  });

  it('rejects ZIP path traversal and oversized expansion before creating output', async () => {
    const edit = await fixture();
    const zip = await JSZip.loadAsync(await readFile(edit.inputFile));
    zip.file('../untrusted.xml', '<xml/>');
    await writeFile(
      edit.inputFile,
      await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    );
    await expect(addImageToGeneratedPresentation({ ...edit, target: 'last' })).rejects.toThrow(
      'invalid archive path',
    );
    await expect(readFile(edit.outputFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('reading the actual generated slide without inference', () => {
  it('identifies the actual cover title instead of the smaller InsightOS brand label', async () => {
    const edit = await fixture();
    const slide = await readGeneratedPresentationSlide({ inputFile: edit.inputFile, target: 1 });
    expect(slide.title).toBe('Declaration of Independence');
    expect(slide.texts).toContain('INSIGHTOS PRESENTATION');
    expect(slide.texts).toContain('The original editable draft');
  });

  it('returns exact last-slide text and stored inserted-image metadata', async () => {
    const edit = await fixture();
    await addImageToGeneratedPresentation({
      ...edit,
      target: 'last',
      image: {
        ...edit.image,
        altText: 'Our "Marketing" image & logo. No visual description was generated.',
      },
    });
    const hashBefore = createHash('sha256')
      .update(await readFile(edit.outputFile))
      .digest('hex');
    const slide = await readGeneratedPresentationSlide({
      inputFile: edit.outputFile,
      target: 'last',
    });
    expect(slide).toEqual({
      slideNumber: 3,
      slideCount: 3,
      title: 'Main sections & content',
      texts: [
        'Main sections & content',
        'Introduction & preamble',
        'Rights and grievances',
        'Declaration and conclusion',
        '3 / 3',
      ],
      images: [
        {
          name: 'our & marketing.png',
          altText: 'Our "Marketing" image & logo. No visual description was generated.',
        },
      ],
    });
    expect(
      createHash('sha256')
        .update(await readFile(edit.outputFile))
        .digest('hex'),
    ).toBe(hashBefore);
  });

  it('reads the chosen numbered slide and preserves actual numeric text', async () => {
    const edit = await fixture();
    await writePresentation(
      {
        title: 'Q3',
        subtitle: 'User-supplied results',
        slides: [
          {
            title: 'Same locations',
            points: ['Growth is 11.9%, not 52.2%.', 'Revenue was $126,000 and is now $141,000.'],
          },
          { title: 'Another slide', points: ['A separate point', 'Another separate point'] },
        ],
      },
      edit.inputFile,
    );
    const slide = await readGeneratedPresentationSlide({ inputFile: edit.inputFile, target: 2 });
    expect(slide).toMatchObject({
      slideNumber: 2,
      slideCount: 3,
      title: 'Same locations',
      images: [],
    });
    expect(slide.texts).toContain('Growth is 11.9%, not 52.2%.');
    expect(slide.texts).toContain('Revenue was $126,000 and is now $141,000.');
    expect(slide.texts).not.toContain('A separate point');
  });

  it('enforces the same ownership, target, cancellation and archive bounds as editing', async () => {
    const edit = await fixture();
    await expect(
      readGeneratedPresentationSlide({ inputFile: edit.inputFile, target: 0 }),
    ).rejects.toThrow('Choose a slide from 1 to 3');
    const abort = new AbortController();
    abort.abort();
    await expect(
      readGeneratedPresentationSlide({
        inputFile: edit.inputFile,
        target: 2,
        signal: abort.signal,
      }),
    ).rejects.toThrow();
    const zip = await JSZip.loadAsync(await readFile(edit.inputFile));
    zip.file(
      'docProps/core.xml',
      (await zip.file('docProps/core.xml')!.async('string')).replace(
        '<dc:creator>InsightOS</dc:creator>',
        '<dc:creator>Another app</dc:creator>',
      ),
    );
    await writeFile(edit.inputFile, await zip.generateAsync({ type: 'nodebuffer' }));
    await expect(
      readGeneratedPresentationSlide({ inputFile: edit.inputFile, target: 'last' }),
    ).rejects.toThrow('created by InsightOS');
    await writeFile(edit.inputFile, Buffer.from('not a PPTX'));
    await expect(
      readGeneratedPresentationSlide({ inputFile: edit.inputFile, target: 'last' }),
    ).rejects.toThrow('not a supported PowerPoint archive');
  });
});
