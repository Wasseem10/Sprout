import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { writePresentation } from '../server/computer/presentation';
import * as pictureProject from '../server/computer/presentation-project';
import * as imageEdit from '../server/computer/presentation-image-edit';
import type { ComputerResult } from '../shared/computer';
import type { PictureDeck } from '../shared/presentation-project';

const JSZip = createRequire(import.meta.url)('jszip');
const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const controller of controllers.splice(0)) await controller.close();
});

async function setup(images = ['campaign.png'], ambiguous = false) {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-image-routing-'));
  const output = path.join(localDir, 'Work');
  const marketing = path.join(localDir, 'Desktop', 'Marketing');
  await mkdir(output);
  await mkdir(marketing, { recursive: true });
  const imageBytes = new Map<string, Buffer>();
  for (const [index, name] of images.entries()) {
    const canvas = createCanvas(100, 70);
    const context = canvas.getContext('2d');
    context.fillStyle = index % 2 ? '#d35f38' : '#287acd';
    context.fillRect(0, 0, 100, 70);
    context.fillStyle = '#ffffff';
    context.fillText(`Synthetic QA ${index}`, 5, 35);
    const bytes = canvas.toBuffer('image/png');
    imageBytes.set(name, bytes);
    await writeFile(path.join(marketing, name), bytes);
  }
  const cfg = {
    ...config(),
    host: '127.0.0.1',
    localDir,
    hfToken: 'test-no-network',
    neonUrl: '',
    cloudUrl: '',
    dbToken: '',
  };
  // Legacy/no-interpreter compatibility: these cases isolate the deterministic image executor.
  // Current conversational routing is covered by presentation-semantic-routing.test.ts.
  const controller = new ComputerController(cfg, { semanticPresentation: false });
  controllers.push(controller);
  await controller.init();
  const launchOffice = vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  await controller.authorizeFolder(
    output,
    await readFile(path.join(localDir, 'desktop-bridge-key'), 'utf8'),
  );
  const filename = 'declaration-of-independence-qa.pptx';
  const file = path.join(output, filename);
  await writePresentation(
    {
      title: 'Declaration of Independence',
      subtitle: 'Synthetic generated-deck fixture',
      slides: [
        {
          title: 'Historical context',
          points: ['A supplied overview of the context', 'Preserve this source text'],
        },
        {
          title: 'Key ideas',
          points: ['A supplied overview of key ideas', 'No new factual claims are added'],
        },
        {
          title: 'Closing discussion',
          points: ['Keep the original conclusion', 'Add the source image beside this content'],
        },
      ],
    },
    file,
  );
  const before = await readFile(file);
  controller.state.presentation = {
    filename,
    title: 'Declaration of Independence',
    slideCount: 4,
    slideTitles: [
      'Declaration of Independence',
      'Historical context',
      'Key ideas',
      'Closing discussion',
    ],
    sha256: sha256(before),
    opened: true,
  };
  controller.recordSelectedSlide(filename, 4);
  const finder = vi
    .spyOn(pictureProject, 'findPresentationFolder')
    .mockImplementation(async (name, _selected, _roots, location) => {
      if (name.toLowerCase() !== 'marketing') throw new Error(`Unexpected QA folder name: ${name}`);
      if (ambiguous && location !== 'desktop')
        throw new pictureProject.PresentationProjectError(
          'I found more than one Marketing folder. Is it on your Desktop, in Documents, or in Downloads?',
        );
      return marketing;
    });
  const fetch = vi.fn(async () => {
    throw new Error('No inference or external account calls belong to this deterministic edit.');
  });
  vi.stubGlobal('fetch', fetch);
  return {
    controller,
    cfg,
    localDir,
    output,
    marketing,
    filename,
    before,
    imageBytes,
    finder,
    fetch,
    launchOffice,
  };
}

function continuation(result: ComputerResult) {
  const intent = result.desktopIntent;
  if (intent?.kind !== 'openFolder' || !intent.continueRequest)
    throw new Error('Expected a verified source-folder opening and continuation.');
  expect(intent.imageSource).toBe(true);
  return intent.continueRequest;
}

async function assertEmbedded(result: ComputerResult, expected: Buffer) {
  const exported = await result.state.presentation;
  expect(exported?.imageEdits?.at(-1)?.slide).toBe(4);
  return sha256(expected);
}

async function restart(cfg: ReturnType<typeof config>) {
  const controller = new ComputerController(cfg, { semanticPresentation: false });
  controllers.push(controller);
  await controller.init();
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  return controller;
}

async function structuredSetup() {
  const qa = await setup(['inserted.png']);
  const assets: pictureProject.DeckSources['assets'] = [];
  for (const id of [1, 2]) {
    const canvas = createCanvas(110, 80);
    const context = canvas.getContext('2d');
    context.fillStyle = id === 1 ? '#46803d' : '#743da8';
    context.fillRect(0, 0, 110, 80);
    const bytes = canvas.toBuffer('image/png');
    const filename = `original-${id}.png`;
    await writeFile(path.join(qa.output, filename), bytes);
    assets.push({
      id,
      filename,
      description: `Synthetic QA source ${id}`,
      sha256: sha256(bytes),
      data: `data:image/png;base64,${bytes.toString('base64')}`,
      preview: `data:image/png;base64,${bytes.toString('base64')}`,
      width: 110,
      height: 80,
    });
  }
  const deck: PictureDeck = {
    title: 'Declaration of Independence',
    subtitle: 'Synthetic proposed presentation',
    theme: 'blue',
    slides: assets.map((asset) => ({
      title: `Source section ${asset.id}`,
      imageId: asset.id,
      points: ['Preserve the original image source', 'Keep these supplied content points'],
    })),
    diagram: {
      title: 'Proposed discussion process',
      stages: [
        { label: 'Explore', detail: 'Read the provided information' },
        { label: 'Review', detail: 'Check the original content' },
        { label: 'Discuss', detail: 'Explain the proposed interpretation' },
      ],
    },
  };
  const sources: pictureProject.DeckSources = {
    root: qa.output,
    assets,
    brief: 'Synthetic QA source material; this is not real historical evidence.',
    briefName: null,
  };
  await pictureProject.writePictureDeck(deck, sources, path.join(qa.output, qa.filename));
  const before = await readFile(path.join(qa.output, qa.filename));
  qa.controller.state.presentation = {
    filename: qa.filename,
    title: deck.title,
    slideCount: 4,
    slideTitles: [deck.title, ...deck.slides.map((slide) => slide.title), deck.diagram.title],
    opened: true,
    sha256: sha256(before),
    selectedSlide: 4,
    project: {
      revision: 1,
      folder: path.basename(qa.output),
      basis: 'Synthetic test sources',
      assets: assets.map(({ id, filename, description }) => ({ id, filename, description })),
      deck,
    },
  };
  // Install the same source context normally produced by the creation route,
  // without calling or mocking inference during these controller edit checks.
  (qa.controller as any).pictureSources = sources;
  (qa.controller as any).pictureProjectId = crypto.randomUUID();
  return { ...qa, before, sources, deck };
}

describe('existing presentation image routing', () => {
  it('keeps editing after the first image, resolves a filler-rich second-slide command, and replaces without shrinking again', async () => {
    const qa = await setup(['campaign-1.png', 'campaign-2.png'], true);
    const first = await qa.controller.request(
      'Oh, okay. Can you now add an, uh, image from my marketing folder in desktop for the first slide?',
      signal(),
    );
    expect(first.summary).toMatch(/which picture/i);
    expect(qa.finder.mock.calls.at(-1)?.[3]).toBe('desktop');
    const choice = await qa.controller.request('Use campaign-1.png', signal());
    const inserted = await qa.controller.request(continuation(choice), signal());
    expect(inserted.state.presentation?.imageEdits?.at(-1)?.slide).toBe(1);
    const firstZip = await JSZip.loadAsync((await qa.controller.presentationExport()).bytes);
    const firstSlide = await firstZip.file('ppt/slides/slide1.xml').async('string');

    const second = await qa.controller.request(
      'Nice. Okay. Now, can you add an image, a different image in the second, uh, slide?',
      signal(),
    );
    expect(second.summary).toContain('campaign-2.png');
    expect(second.summary).toContain('slide 2');
    const secondDone = await qa.controller.request(continuation(second), signal());
    expect(secondDone.state.presentation?.imageEdits?.at(-1)).toMatchObject({
      slide: 2,
      filename: 'campaign-2.png',
    });
    const secondBytes = (await qa.controller.presentationExport()).bytes;
    const secondZip = await JSZip.loadAsync(secondBytes);
    expect(await secondZip.file('ppt/slides/slide1.xml').async('string')).toBe(firstSlide);

    const repeat = await qa.controller.request(
      "Can you add an image in the first slide from my marketing folder that's in desktop?",
      signal(),
    );
    expect(repeat.summary).toMatch(/which picture/i);
    const replacementChoice = await qa.controller.request('Use campaign-2.png', signal());
    const replaced = await qa.controller.request(continuation(replacementChoice), signal());
    expect(replaced.summary).toMatch(/replaced.*slide 1/i);
    expect(
      replaced.state.presentation?.imageEdits?.filter((edit) => edit.slide === 1),
    ).toHaveLength(1);
    const finalZip = await JSZip.loadAsync((await qa.controller.presentationExport()).bytes);
    const finalSlide = await finalZip.file('ppt/slides/slide1.xml').async('string');
    const nonPictures = (xml: string) => xml.replace(/<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g, '');
    expect(nonPictures(finalSlide)).toBe(nonPictures(firstSlide));
    expect([...finalSlide.matchAll(/<p:pic\b/g)]).toHaveLength(1);
    for (const slide of [2, 3, 4]) {
      const part = `ppt/slides/slide${slide}.xml`;
      expect(await finalZip.file(part).async('nodebuffer')).toEqual(
        await secondZip.file(part).async('nodebuffer'),
      );
    }
    const undone = await qa.controller.request('Undo image.', signal());
    expect(undone.state.presentation?.filename).toBe(secondDone.state.presentation?.filename);
    expect((await qa.controller.presentationExport()).bytes).toEqual(secondBytes);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('accepts “I said the second slide” after an edit fails and rejects the obsolete continuation', async () => {
    const qa = await setup();
    const source = await qa.controller.request(
      'Add an image from my Marketing folder in desktop to the first slide.',
      signal(),
    );
    const staleContinuation = continuation(source);
    vi.spyOn(imageEdit, 'addImageToGeneratedPresentation').mockRejectedValueOnce(
      new Error(
        'Adding another picture here would make the existing text too small. Your deck is unchanged.',
      ),
    );
    await expect(qa.controller.request(staleContinuation, signal())).rejects.toThrow(/too small/);
    const corrected = await qa.controller.request('I said the second slide.', signal());
    expect(corrected.summary).toContain('slide 2');
    expect(continuation(corrected)).not.toBe(staleContinuation);
    const stale = await qa.controller.request(staleContinuation, signal());
    expect(stale.summary).toMatch(/request was replaced/i);
    expect(stale.state.presentation?.filename).toBe(qa.filename);
    const done = await qa.controller.request(continuation(corrected), signal());
    expect(done.state.presentation?.imageEdits?.at(-1)?.slide).toBe(2);
    expect(qa.finder).toHaveBeenCalledOnce();
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('retains Desktop after an ambiguity reply and reuses it for the next edit', async () => {
    const qa = await setup(['campaign.png'], true);
    await expect(
      qa.controller.request('Add the image from my Marketing folder to the first slide.', signal()),
    ).rejects.toThrow(/more than one Marketing/);
    const found = await qa.controller.request("It's in desktop.", signal());
    expect(qa.finder.mock.calls.at(-1)?.[3]).toBe('desktop');
    await qa.controller.request(continuation(found), signal());
    const second = await qa.controller.request(
      'Add the image from my Marketing folder to slide two.',
      signal(),
    );
    expect(second.summary).toContain('slide 2');
    expect(second.summary).not.toMatch(/more than one|where|Desktop, in Documents/i);
    const done = await qa.controller.request(continuation(second), signal());
    expect(done.state.presentation?.imageEdits?.at(-1)?.slide).toBe(2);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('explains when no different source exists and accepts a spoken same-picture choice', async () => {
    const qa = await setup();
    const source = await qa.controller.request(
      'Add the image in my Marketing folder to slide one.',
      signal(),
    );
    await qa.controller.request(continuation(source), signal());
    const noOther = await qa.controller.request('Add a different image to slide two.', signal());
    expect(noOther.summary).toMatch(/already used/i);
    expect(noOther.clarification).toBe(true);
    const same = await qa.controller.request('Use the same picture.', signal());
    const done = await qa.controller.request(continuation(same), signal());
    expect(done.state.presentation?.imageEdits?.at(-1)).toMatchObject({
      slide: 2,
      filename: 'campaign.png',
    });
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('handles the exact folder clarification transcript without rebuilding or clearing the deck', async () => {
    const qa = await setup(['campaign.png'], true);
    const originalState = qa.controller.snapshot();
    for (const fragment of ['Um, can you create for me...', 'A...']) {
      const result = await qa.controller.request(fragment, signal());
      expect(result.summary).toMatch(/listening/i);
      expect(result.state.presentation).toEqual(originalState.presentation);
    }
    const question = await qa.controller.request(
      'Yes, can you pull the image from my folder and, uh, add it to that slide?',
      signal(),
    );
    expect(question.summary).toMatch(/folder called/i);
    expect(question.state.presentation).toEqual(originalState.presentation);
    expect(question.state.folder).toEqual(originalState.folder);
    const filler =
      'Well, there is called marketing. You can add just one PNG for now, or JPG, whatever it is.';
    await expect(qa.controller.request(filler, signal())).rejects.toThrow(
      /more than one Marketing/,
    );
    expect(qa.finder.mock.calls.at(-1)?.[0]).toBe('marketing');
    expect(qa.controller.snapshot().presentation).toEqual(originalState.presentation);
    await expect(
      qa.controller.request('The folder is called "Marketing."', signal()),
    ).rejects.toThrow(/more than one Marketing/);
    expect(qa.finder.mock.calls.at(-1)?.[0]).toBe('Marketing');
    const found = await qa.controller.request(
      "It's on desktop. Can you add it to our last slide?",
      signal(),
    );
    expect(qa.finder.mock.calls.at(-1)?.[0]).toBe('Marketing');
    expect(qa.finder.mock.calls.at(-1)?.[3]).toBe('desktop');
    expect(found.state.folder).toEqual(originalState.folder);
    expect(found.state.presentation).toEqual(originalState.presentation);
    expect(found.desktopIntent).toMatchObject({
      kind: 'openFolder',
      path: qa.marketing,
      imageSource: true,
    });
    const done = await qa.controller.request(continuation(found), signal());
    expect(done.summary).toMatch(/added campaign.png to slide 4/i);
    expect(done.summary).not.toMatch(/style|theme|clean blue|dark|created/i);
    expect(done.state.presentation).toMatchObject({
      title: 'Declaration of Independence',
      slideCount: 4,
    });
    expect(done.state.presentation?.selectedSlide).toBeUndefined();
    expect(done.state.folder).toEqual(originalState.folder);
    expect(done.state.presentation?.filename).not.toBe(qa.filename);
    expect(qa.fetch).not.toHaveBeenCalled();
    expect(qa.launchOffice).toHaveBeenCalledOnce();
    const edited = (await qa.controller.presentationExport()).bytes;
    const originalZip = await JSZip.loadAsync(qa.before),
      zip = await JSZip.loadAsync(edited);
    for (const index of [1, 2, 3]) {
      const name = `ppt/slides/slide${index}.xml`;
      expect(await zip.file(name).async('nodebuffer')).toEqual(
        await originalZip.file(name).async('nodebuffer'),
      );
    }
    const final = await zip.file('ppt/slides/slide4.xml').async('string');
    expect(final).toContain('Keep the original conclusion');
    expect(final).toContain('Source picture: campaign.png, from Marketing.');
    const hash = await assertEmbedded(done, qa.imageBytes.get('campaign.png')!);
    expect(await zip.file(`ppt/media/insight-image-${hash}.png`).async('nodebuffer')).toEqual(
      qa.imageBytes.get('campaign.png'),
    );
    expect(await readFile(path.join(qa.output, qa.filename))).toEqual(qa.before);
  });

  it('lets a voice-only filename choice select an original source among multiple images', async () => {
    const qa = await setup(['campaign-1.png', 'campaign-2.png']);
    const question = await qa.controller.request(
      'Add the image in my Marketing folder to the last slide.',
      signal(),
    );
    expect(question.summary).toMatch(/which picture/i);
    expect(question.desktopIntent).toBeUndefined();
    const choice = await qa.controller.request('Use campaign-2.png', signal());
    expect(choice.summary).toContain('campaign-2.png');
    const done = await qa.controller.request(continuation(choice), signal());
    expect(done.state.presentation?.imageEdits?.at(-1)?.filename).toBe('campaign-2.png');
    const zip = await JSZip.loadAsync((await qa.controller.presentationExport()).bytes);
    const chosen = qa.imageBytes.get('campaign-2.png')!;
    expect(
      await zip.file(`ppt/media/insight-image-${sha256(chosen)}.png`).async('nodebuffer'),
    ).toEqual(chosen);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('honors the advertised just-one reply without needing a picker or inference', async () => {
    const qa = await setup(['campaign-1.png', 'campaign-2.png']);
    const question = await qa.controller.request(
      'Use the image in my Marketing folder on the last slide.',
      signal(),
    );
    expect(question.summary).toMatch(/which picture/i);
    const choice = await qa.controller.request('Use just one picture', signal());
    expect(choice.summary).toContain('campaign-1.png');
    const done = await qa.controller.request(continuation(choice), signal());
    expect(done.state.presentation?.imageEdits?.at(-1)?.filename).toBe('campaign-1.png');
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('treats a slide-only answer as a destination and still asks for the image folder', async () => {
    const qa = await setup();
    delete qa.controller.state.presentation!.selectedSlide;
    const question = await qa.controller.request(
      'Add an image to my existing presentation.',
      signal(),
    );
    expect(question.summary).toMatch(/which slide/i);
    const namedSlide = await qa.controller.request('The last slide', signal());
    expect(namedSlide.summary).toMatch(/folder called/i);
    expect(qa.finder).not.toHaveBeenCalled();
    const source = await qa.controller.request('The folder is called Marketing.', signal());
    expect(source.desktopIntent?.kind).toBe('openFolder');
    const done = await qa.controller.request(continuation(source), signal());
    expect(done.state.presentation?.imageEdits?.at(-1)?.slide).toBe(4);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('leaves the active presentation and its original bytes unchanged if the selected source is invalid', async () => {
    const qa = await setup(['broken.png']);
    await writeFile(path.join(qa.marketing, 'broken.png'), 'This is not a PNG image.');
    const original = qa.controller.snapshot();
    const files = await readdir(qa.output);
    const found = await qa.controller.request(
      'Add the image in my Marketing folder to slide four.',
      signal(),
    );
    await expect(qa.controller.request(continuation(found), signal())).rejects.toThrow(
      /not a valid PNG|could not be read/i,
    );
    expect(qa.controller.snapshot().presentation).toEqual(original.presentation);
    expect(qa.controller.snapshot().folder).toEqual(original.folder);
    expect(await readFile(path.join(qa.output, qa.filename))).toEqual(qa.before);
    expect(await readdir(qa.output)).toEqual(files);
    expect(qa.launchOffice).not.toHaveBeenCalled();
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('rejects a stale verified-slide filename without replacing the current slide selection', async () => {
    const qa = await setup();
    expect(() => qa.controller.recordSelectedSlide('previous-deck.pptx', 2)).toThrow(
      /current presentation/,
    );
    expect(() => qa.controller.recordSelectedSlide(qa.filename, 20)).toThrow(
      /current presentation/,
    );
    expect(qa.controller.snapshot().presentation?.selectedSlide).toBe(4);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('rejects the old insertion continuation after the active deck has changed', async () => {
    const qa = await setup();
    const found = await qa.controller.request(
      'Add the image in my Marketing folder to the last slide.',
      signal(),
    );
    const next = {
      ...qa.controller.snapshot().presentation!,
      filename: 'different-generated-deck.pptx',
    };
    qa.controller.state.presentation = next;
    const stale = await qa.controller.request(continuation(found), signal());
    expect(stale.summary).toMatch(/active presentation changed/i);
    expect(stale.state.presentation).toEqual(next);
    expect(qa.launchOffice).not.toHaveBeenCalled();
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('preserves an inserted diagram image and both original source images through a theme-only revision', async () => {
    const qa = await structuredSetup();
    const found = await qa.controller.request(
      'Add the image in my Marketing folder to the last slide.',
      signal(),
    );
    const inserted = await qa.controller.request(continuation(found), signal());
    expect(inserted.state.presentation?.project?.deck).toEqual(qa.deck);
    const revised = await qa.controller.request(
      'Change the presentation theme to dark. Save only.',
      signal(),
    );
    expect(revised.state.presentation?.project?.deck).toEqual({ ...qa.deck, theme: 'dark' });
    expect(revised.state.presentation?.imageEdits).toEqual(inserted.state.presentation?.imageEdits);
    expect(revised.state.presentation?.project?.revision).toBe(
      inserted.state.presentation!.project!.revision + 1,
    );
    const zip = await JSZip.loadAsync((await qa.controller.presentationExport()).bytes);
    const added = qa.imageBytes.get('inserted.png')!;
    expect(
      await zip.file(`ppt/media/insight-image-${sha256(added)}.png`).async('nodebuffer'),
    ).toEqual(added);
    const allMedia = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^ppt\/media\//.test(name) && !zip.files[name].dir)
        .map((name) => zip.file(name).async('nodebuffer')),
    );
    const hashes = allMedia.map((bytes: Buffer) => sha256(bytes));
    for (const asset of qa.sources.assets) expect(hashes).toContain(asset.sha256);
    const final = await zip.file('ppt/slides/slide4.xml').async('string');
    expect(final).toContain('Proposed discussion process');
    expect(final).toContain('Source picture: inserted.png, from Marketing.');
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('refuses to commit a structured revision if the added source image changes on disk', async () => {
    const qa = await structuredSetup();
    const found = await qa.controller.request(
      'Add the image in my Marketing folder to the last slide.',
      signal(),
    );
    await qa.controller.request(continuation(found), signal());
    const previous = qa.controller.snapshot();
    const previousFile = await qa.controller.presentationExport();
    await writeFile(
      path.join(qa.marketing, 'inserted.png'),
      qa.sources.assets[0].data.split(',')[1],
      'base64',
    );
    await expect(
      qa.controller.request('Change the presentation theme to dark. Save only.', signal()),
    ).rejects.toThrow(/picture.*changed on disk/i);
    expect(qa.controller.snapshot().presentation).toEqual(previous.presentation);
    expect((await qa.controller.presentationExport()).bytes).toEqual(previousFile.bytes);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('explains the persistence limitation instead of marking an extra-image revision as saved to Neon', async () => {
    const qa = await structuredSetup();
    const found = await qa.controller.request(
      'Add the image in my Marketing folder to the last slide.',
      signal(),
    );
    await qa.controller.request(continuation(found), signal());
    const previous = qa.controller.snapshot();
    await expect(qa.controller.request('Save my presentation.', signal())).rejects.toThrow(
      /cannot be restored from Neon yet/i,
    );
    expect(qa.controller.snapshot().presentation).toEqual(previous.presentation);
    expect(qa.controller.snapshot().presentation?.project?.saved).toBeUndefined();
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('does not substitute the selected slide when an explicitly requested destination is out of range', async () => {
    const qa = await setup();
    const before = qa.controller.snapshot();
    const question = await qa.controller.request(
      'Add the image in my Marketing folder to slide 99.',
      signal(),
    );
    expect(question.clarification).toBe(true);
    expect(question.summary).toMatch(/which slide|from 1 to 4|slide.*(?:range|four|4)/i);
    expect(question.desktopIntent).toBeUndefined();
    expect(question.state.presentation).toEqual(before.presentation);
    expect(qa.finder).not.toHaveBeenCalled();
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('retains the exact revised file and real slide readback after a backend restart', async () => {
    const qa = await setup();
    const found = await qa.controller.request(
      'Add the image in my Marketing folder to the last slide.',
      signal(),
    );
    await qa.controller.request(continuation(found), signal());
    const before = await qa.controller.presentationExport();
    await qa.controller.close();
    const resumed = await restart(qa.cfg);
    expect(resumed.snapshot().presentation?.filename).toBe(before.filename);
    expect(resumed.snapshot().presentation?.selectedSlide).toBeUndefined();
    expect((await resumed.presentationExport()).bytes).toEqual(before.bytes);
    const readback = await resumed.request('Read the last slide.', signal());
    expect(readback.summary).toContain('Keep the original conclusion');
    expect(readback.summary).toContain('campaign.png');
    expect(readback.summary).toContain('Marketing');
    expect(sha256((await resumed.presentationExport()).bytes)).toBe(sha256(before.bytes));
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('does not adopt a checkpoint when the generated presentation has changed on disk', async () => {
    const qa = await setup();
    await qa.controller.request('Open the presentation.', signal());
    const active = qa.controller.snapshot().presentation!;
    await qa.controller.close();
    await writeFile(
      path.join(qa.output, active.filename),
      'Not the previously verified presentation.',
    );
    const resumed = await restart(qa.cfg);
    expect(resumed.snapshot().presentation).toBeFalsy();
    await expect(resumed.presentationExport()).rejects.toThrow(/create a presentation/i);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it.each(['different author', 'linked source folder'])(
    'does not adopt an invalid active-file checkpoint: %s',
    async (invalid) => {
      const qa = await setup();
      await qa.controller.request('Open the presentation.', signal());
      await qa.controller.close();
      const checkpointFile = path.join(qa.localDir, 'active-presentation.json');
      const checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
      if (invalid === 'different author') {
        const zip = await JSZip.loadAsync(qa.before);
        const core = await zip.file('docProps/core.xml').async('string');
        zip.file(
          'docProps/core.xml',
          core.replace(
            '<dc:creator>InsightOS</dc:creator>',
            '<dc:creator>Other application</dc:creator>',
          ),
        );
        const counterfeit = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        await writeFile(path.join(qa.output, qa.filename), counterfeit);
        checkpoint.presentation.sha256 = sha256(counterfeit);
      } else {
        const linked = path.join(qa.localDir, 'Linked Work');
        await symlink(qa.output, linked, process.platform === 'win32' ? 'junction' : 'dir');
        checkpoint.root = linked;
      }
      await writeFile(checkpointFile, JSON.stringify(checkpoint));
      const resumed = await restart(qa.cfg);
      expect(resumed.snapshot().presentation).toBeFalsy();
      expect(qa.fetch).not.toHaveBeenCalled();
    },
  );
});
