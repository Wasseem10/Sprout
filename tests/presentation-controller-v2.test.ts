import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, unlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { config, type Config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import * as interpreter from '../server/computer/presentation-intent';
import * as nativeApps from '../server/computer/native-apps';
import type { ComputerResult } from '../shared/computer';
import type { PresentationTurnIntent } from '../shared/presentation-intent';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import { PresentationStore } from '../server/providers/presentationStore';
import { PresentationWorkingFiles } from '../server/computer/presentation-working-file';
import { writePresentation } from '../server/computer/presentation';

const JSZip = createRequire(import.meta.url)('jszip');
const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function turn(partial: Partial<PresentationTurnIntent>): PresentationTurnIntent {
  return {
    kind: 'request',
    domain: 'presentation',
    startsNewTask: false,
    awaitingContinuation: false,
    fields: { open: false },
    operations: [],
    ...partial,
  };
}

async function newController(cfg: Config) {
  const controller = new ComputerController(cfg);
  controllers.push(controller);
  await controller.init();
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  return controller;
}

async function fixture(options: { audiencePoints?: string[]; revisedPoints?: string[] } = {}) {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-controller-v2-'));
  const root = path.join(localDir, 'Desktop', 'Marketing');
  const extra = path.join(localDir, 'Documents', 'Other Campaign');
  await mkdir(root, { recursive: true });
  await mkdir(extra, { recursive: true });
  const canvas = createCanvas(320, 200);
  const context = canvas.getContext('2d');
  context.fillStyle = '#245ccd';
  context.fillRect(0, 0, 320, 200);
  const firstImage = canvas.toBuffer('image/png');
  await writeFile(path.join(root, 'campaign.png'), firstImage);
  context.fillStyle = '#df742f';
  context.fillRect(0, 0, 320, 200);
  const secondImage = canvas.toBuffer('image/png');
  await writeFile(path.join(extra, 'different.png'), secondImage);
  const cfg = {
    ...config(),
    localDir,
    host: '127.0.0.1',
    owner: 'controller-v2-test',
    hfToken: 'test-no-network',
    cloudUrl: '',
    neonUrl: '',
    dbToken: '',
  };
  const interpretations = new Map<string, PresentationTurnIntent>();
  vi.spyOn(interpreter, 'interpretPresentationTurn').mockImplementation(async (request) => {
    const intent = interpretations.get(request);
    if (!intent) throw new Error(`No synthetic intent registered for ${request}`);
    return structuredClone(intent);
  });
  vi.spyOn(nativeApps, 'openNativeApp').mockResolvedValue({
    app: 'fileExplorer',
    name: 'File Explorer',
    mode: 'launched',
  });
  const modelCalls: { system: string; input: any }[] = [];
  const fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const system: string = body.messages[0].content;
    const raw = body.messages[1].content;
    const input = Array.isArray(raw) ? raw : JSON.parse(raw);
    modelCalls.push({ system, input });
    let output: unknown;
    if (Array.isArray(raw))
      output = { description: 'A synthetic campaign illustration used only for QA.' };
    else if (system.startsWith('Write a concise editable slide deck')) {
      output = {
        schemaVersion: 2,
        title: input.topic,
        theme: 'blue',
        textScale: 1,
        allowImageReuse: false,
        slides: input.slots.map((slot: any, index: number) => {
          if (slot.type === 'cover')
            return { ...slot, title: input.topic, subtitle: 'A proposed accessible campaign with clear messages and practical review steps' };
          if (slot.type === 'process')
            return {
              ...slot,
              title: 'Proposed process',
              stages: [
                { label: 'Prepare', detail: 'Prepare campaign material for the selected audience and channel.' },
                { label: 'Review', detail: 'Review wording and image choices with the responsible campaign owner.' },
                { label: 'Publish', detail: 'Publish approved messages after checking links and delivery timing.' },
              ],
            };
          if (slot.type === 'image')
            return {
              ...slot,
              title: 'Campaign illustration',
              points: [
                'Use the supplied campaign picture to illustrate the message that the audience will encounter.',
                'Review its meaning and description before publishing so every reader can understand its purpose.',
              ],
              caption: 'Supplied synthetic campaign picture.',
              layout: 'split',
            };
          return {
            ...slot,
            title:
              ['Cover', 'Audience', 'Campaign message', 'Channels', 'Review'][index] ??
              `Campaign details ${index}`,
            points:
              index === 1 && options.audiencePoints
                ? options.audiencePoints
                : [
                    [
                      'Explain the campaign purpose before asking readers to explore the proposal and decide whether it addresses their needs.',
                      'Choose the audience who would benefit from the proposed campaign, then ask the team which needs the message should address.',
                      'Prepare a clear campaign message that explains the proposed offer, its intended audience, and the next action a reader can take.',
                      'Choose channels that readers already use, then shape the approved message to fit how each channel works.',
                      'Review the campaign with its owner before release, checking that the words, image notes, and links agree.',
                    ][index] ?? `Assign a named owner to campaign activity ${index} so the team knows who will prepare material and respond to feedback.`,
                    [
                      'Identify the decision this presentation supports, then invite the team to review the source material before approving the next step.',
                      'Describe the audience concerns in plain language so reviewers can check whether the campaign gives readers a useful reason to respond.',
                      'Check the draft against the supplied brief before sharing it, and remove claims that the team cannot support with source material.',
                      'Schedule a review of each channel draft before publication so the team can check accessibility, consistency, and the destination for responses.',
                      'Record the changes requested during review and confirm who will approve the final version before the campaign is distributed to readers.',
                    ][index] ?? `Check the output of campaign activity ${index} against its agreed purpose before sharing it with the rest of the team for approval.`,
                  ],
          };
        }),
      };
    } else if (system.startsWith('Revise only the supplied slide')) {
      output = {
        ...input.slide,
        title: input.title ?? input.slide?.title,
        points: options.revisedPoints ?? [
          'Choose the proposed campaign audience and ask which needs to address.',
          'Describe audience concerns plainly so reviewers can check readers’ reasons to respond.',
        ],
      };
    } else if (system.startsWith('Summarize the supplied presentation')) {
      output = {
        title: 'Campaign summary',
        points: [
          'Choose an audience and prepare a clear message.',
          'Review campaign material before publishing.',
        ],
      };
    } else throw new Error(`Unexpected provider contract: ${system.slice(0, 100)}`);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetch);
  const controller = await newController(cfg);
  async function request(
    text: string,
    intent: PresentationTurnIntent,
    active = controller,
  ): Promise<ComputerResult> {
    interpretations.set(text, intent);
    let result = await active.request(text, signal());
    for (let count = 0; count < 6; count++) {
      const desktop = result.desktopIntent;
      if (!desktop || !('continueRequest' in desktop) || !desktop.continueRequest) return result;
      if (desktop.kind === 'slide')
        active.recordSelectedSlide(desktop.filename!, Number(desktop.slide), desktop.identity);
      result = await active.request(desktop.continueRequest, signal());
    }
    throw new Error('Desktop continuation did not finish.');
  }
  async function create(images = true) {
    return request(
      'Create the six-slide Cyber Monday campaign.',
      turn({
        startsNewTask: true,
        fields: {
          topic: 'Cyber Monday campaign',
          totalSlides: 6,
          theme: 'dark',
          open: false,
          ...(images ? { folderPath: root, imageDestination: 1 } : {}),
        },
        operations: [
          { type: 'create' },
          ...(images ? [{ type: 'insert_image' as const, target: 1 }] : []),
        ],
      }),
    );
  }
  return {
    cfg,
    root,
    extra,
    firstImage,
    secondImage,
    controller,
    interpretations,
    fetch,
    modelCalls,
    request,
    create,
  };
}

const deck = (controller: ComputerController): OrderedPresentationDeck =>
  structuredClone(controller.snapshot().presentation!.project!.orderedDeck!);

describe('presentation change receipts', () => {
  it('keeps a no-op theme request on the same revision and file without adding undo history', async () => {
    const qa = await fixture();
    await qa.create();
    const before = qa.controller.snapshot().presentation!;
    const result = await qa.request('Keep the same dark design.', turn({ operations: [{ type: 'set_theme', theme: 'dark' }] }));
    expect(result.summary).toContain('did not change');
    expect(result.state.presentation?.filename).toBe(before.filename);
    expect(result.state.presentation?.project?.revision).toBe(before.project?.revision);
    expect(result.state.presentation?.project?.canUndo).toBe(before.project?.canUndo);
  });

  it('reports the measured change on the requested slide and leaves other slide XML untouched', async () => {
    const qa = await fixture();
    await qa.create();
    const before = await exported(qa.controller);
    const result = await qa.request('Make the second slide less wordy.', turn({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Make the second slide less wordy.', detailChange: 'shorten' }] }));
    expect(result.summary).toMatch(/Shortened slide 2 from \d+ to \d+ words/);
    expect(result.summary).toContain('other slides are unchanged');
    const after = await exported(qa.controller);
    expect(after.slides[1]).not.toBe(before.slides[1]);
    expect(after.slides.filter((_, i) => i !== 1)).toEqual(before.slides.filter((_, i) => i !== 1));
    await expectWorkingRevision(qa.cfg, qa.controller, before);
  });
});
async function exported(controller: ComputerController) {
  const file = await controller.presentationExport();
  expect(sha256(file.bytes)).toBe(controller.snapshot().presentation?.sha256);
  const zip = await JSZip.loadAsync(file.bytes);
  const slides: string[] = [];
  for (let index = 1; index <= controller.snapshot().presentation!.slideCount; index++)
    slides.push(await zip.file(`ppt/slides/slide${index}.xml`).async('string'));
  const images: Buffer[] = await Promise.all(
    Object.keys(zip.files)
      .filter((name) => name.startsWith('ppt/media/') && !zip.files[name].dir)
      .map((name) => zip.file(name).async('nodebuffer')),
  );
  return { ...file, zip, slides, images };
}

async function expectWorkingRevision(
  cfg: Config,
  controller: ComputerController,
  previous: Awaited<ReturnType<typeof exported>>,
) {
  const current = await exported(controller);
  const projectId = controller.presentationSelectionIdentity()!.projectId;
  const workingFiles = new PresentationWorkingFiles(cfg);
  const record = await workingFiles.load(projectId);
  expect(record).not.toBeNull();
  expect(current.filename).toBe(previous.filename);
  expect(path.basename(record!.working.path)).toBe(current.filename);
  expect(record!.working.sha256).toBe(sha256(current.bytes));
  expect((await readFile(record!.working.path)).equals(current.bytes)).toBe(true);
  expect(current.bytes.equals(previous.bytes)).toBe(false);
  const archive = path.join(workingFiles.directory(projectId), `previous-${sha256(previous.bytes)}.pptx`);
  expect((await readFile(archive)).equals(previous.bytes)).toBe(true);
}

async function slidePictureBytes(pptx: Awaited<ReturnType<typeof exported>>, index: number) {
  const pictureId = pptx.slides[index - 1].match(/<a:blip[^>]+r:embed="([^"]+)"/)?.[1];
  expect(pictureId).toBeTruthy();
  const relationships = await pptx.zip
    .file(`ppt/slides/_rels/slide${index}.xml.rels`)
    .async('string');
  const relationship = (relationships.match(/<Relationship\s[^>]+\/>/g) as string[]).find((item) =>
    item.includes(`Id="${pictureId}"`),
  );
  const target = relationship?.match(/Target="([^"]+)"/)?.[1];
  expect(target).toBeTruthy();
  return pptx.zip.file(path.posix.normalize(`ppt/slides/${target}`)).async('nodebuffer');
}

describe('ordered presentation controller and actual exported revisions', () => {
  it('creates six editable slides from one source picture placed exactly once on the cover', async () => {
    const qa = await fixture();
    const result = await qa.create();
    expect(result.state.presentation?.slideCount).toBe(6);
    const current = deck(qa.controller);
    expect(current.slides.map((slide) => slide.type)).toEqual([
      'cover',
      'text',
      'text',
      'text',
      'text',
      'process',
    ]);
    expect(current.slides[0]).toMatchObject({ type: 'cover', imageId: 1 });
    expect(current.slides.filter((slide) => 'imageId' in slide)).toHaveLength(1);
    const pptx = await exported(qa.controller);
    expect(pptx.slides).toHaveLength(6);
    expect(pptx.slides[0].match(/<p:pic>/g)).toHaveLength(1);
    expect(pptx.slides.slice(1).every((xml) => !xml.includes('<p:pic>'))).toBe(true);
    expect(pptx.slides.every((xml) => xml.includes('<a:t>'))).toBe(true);
    expect(pptx.images.some((image) => image.equals(qa.firstImage))).toBe(true);
    expect(await readFile(path.join(qa.root, 'campaign.png'))).toEqual(qa.firstImage);
  });

  it('keeps scoped edits, reference resolution, larger text, themes, stable reorder IDs and summary undo coherent', async () => {
    const qa = await fixture();
    await qa.create();
    const original = deck(qa.controller);
    const before = await exported(qa.controller);
    const read = await qa.request(
      'Read slide two.',
      turn({ operations: [{ type: 'read_slide', target: 2 }] }),
    );
    expect(read.summary).toContain('Audience');
    expect(read.summary).toContain(
      original.slides[1].type === 'text' ? original.slides[1].points[0] : '',
    );
    await qa.request(
      'Make it less wordy.',
      turn({
        operations: [
          { type: 'revise_slide', target: 'current', instruction: 'Make it less wordy.' },
        ],
      }),
    );
    const shortened = deck(qa.controller);
    expect(shortened.slides[1]).toMatchObject({
      id: original.slides[1].id,
      points: [
        'Choose the proposed campaign audience and ask which needs to address.',
        'Describe audience concerns plainly so reviewers can check readers’ reasons to respond.',
      ],
    });
    expect(shortened.slides.filter((_, index) => index !== 1)).toEqual(
      original.slides.filter((_, index) => index !== 1),
    );
    const after = await exported(qa.controller);
    expect(after.filename).toBe(before.filename);
    expect(after.slides.filter((_, index) => index !== 1)).toEqual(
      before.slides.filter((_, index) => index !== 1),
    );
    await qa.request(
      'Make its text larger.',
      turn({ operations: [{ type: 'resize_text', target: 'current', direction: 'larger' }] }),
    );
    expect(deck(qa.controller).slides[1].textScale).toBeCloseTo(1.15);
    const resized = deck(qa.controller);
    await qa.request(
      'Use bright minimal.',
      turn({ operations: [{ type: 'set_theme', theme: 'light' }] }),
    );
    expect(deck(qa.controller)).toEqual({ ...resized, theme: 'light' });
    const ordered = deck(qa.controller);
    await qa.request(
      'Move slide four before slide two.',
      turn({ operations: [{ type: 'move_slide', target: 4, before: 2 }] }),
    );
    const moved = deck(qa.controller);
    expect(moved.slides.map((slide) => slide.id)).toEqual([
      ordered.slides[0].id,
      ordered.slides[3].id,
      ordered.slides[1].id,
      ordered.slides[2].id,
      ordered.slides[4].id,
      ordered.slides[5].id,
    ]);
    const stillAudience = await qa.request(
      'Read that slide again.',
      turn({ operations: [{ type: 'read_slide', target: 'current' }] }),
    );
    expect(stillAudience.summary).toContain('Audience');
    expect(stillAudience.summary).toContain('Slide 3');
    await qa.request('Add a summary at the end.', turn({ operations: [{ type: 'add_summary' }] }));
    expect(deck(qa.controller).slides).toHaveLength(7);
    expect(deck(qa.controller).slides.slice(0, 6)).toEqual(moved.slides);
    const summaryFile = await exported(qa.controller);
    expect(summaryFile.slides[6]).toContain('Campaign summary');
    await qa.request('Undo that change.', turn({ operations: [{ type: 'undo' }] }));
    expect(deck(qa.controller)).toEqual(moved);
    expect((await exported(qa.controller)).slides).toHaveLength(6);
    await expectWorkingRevision(qa.cfg, qa.controller, before);
  });

  it('saves and resumes full ordered state and history after backend restart without inference', async () => {
    const qa = await fixture();
    await qa.create();
    const original = deck(qa.controller);
    await qa.request(
      'Use clean blue.',
      turn({ operations: [{ type: 'set_theme', theme: 'blue' }] }),
    );
    const revised = deck(qa.controller);
    await qa.request('Save my presentation.', turn({ operations: [{ type: 'save' }] }));
    const savedId = qa.controller.snapshot().presentation?.project?.saved?.id;
    expect(savedId).toBeTruthy();
    const oldFilename = qa.controller.snapshot().presentation!.filename;
    await qa.controller.close();
    const restarted = await newController(qa.cfg);
    qa.fetch.mockClear();
    await qa.request(
      'Resume my last presentation.',
      turn({ operations: [{ type: 'resume' }] }),
      restarted,
    );
    expect(deck(restarted)).toEqual(revised);
    expect(restarted.snapshot().presentation?.project?.canUndo).toBe(true);
    expect(restarted.snapshot().presentation?.filename).toBe(oldFilename);
    await qa.request('Undo the theme change.', turn({ operations: [{ type: 'undo' }] }), restarted);
    expect(deck(restarted)).toEqual(original);
    expect(qa.fetch).not.toHaveBeenCalled();
    expect((await exported(restarted)).images.some((image) => image.equals(qa.firstImage))).toBe(
      true,
    );
  });

  it('restores committed working content and undo history when the file checkpoint was lost', async () => {
    const qa = await fixture();
    await qa.create();
    const original = deck(qa.controller);
    await qa.request('Use clean blue.', turn({ operations: [{ type: 'set_theme', theme: 'blue' }] }));
    const current = qa.controller.snapshot().presentation!;
    const bytes = await exported(qa.controller);
    const projectId = qa.controller.presentationSelectionIdentity()!.projectId;
    const working = new PresentationWorkingFiles(qa.cfg);
    const committed = await working.load(projectId);
    expect(committed?.session?.history).toHaveLength(1);
    await qa.controller.close();
    await unlink(path.join(qa.cfg.localDir, 'active-presentation.json'));
    qa.fetch.mockClear();
    const restarted = await newController(qa.cfg);
    expect(restarted.snapshot().presentation).toMatchObject({
      filename: current.filename, sha256: current.sha256, opened: false,
      project: { revision: current.project!.revision, orderedDeck: current.project!.orderedDeck, canUndo: true },
    });
    expect((await exported(restarted)).bytes.equals(bytes.bytes)).toBe(true);
    expect(restarted.presentationSelectionIdentity()?.projectId).toBe(projectId);
    await qa.request('Undo the recovered change.', turn({ operations: [{ type: 'undo' }] }), restarted);
    expect(deck(restarted)).toEqual(original);
    expect(restarted.snapshot().presentation?.filename).toBe(current.filename);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('keeps a later unrelated file checkpoint instead of replacing it with an older active project', async () => {
    const qa = await fixture();
    await qa.create();
    const current = await exported(qa.controller);
    const projectId = qa.controller.presentationSelectionIdentity()!.projectId;
    const committed = await new PresentationWorkingFiles(qa.cfg).load(projectId);
    await qa.controller.close();
    const filename = 'unrelated-lecture.pptx';
    await writePresentation({
      title: 'Unrelated lecture', subtitle: 'Reference material', slides: [
        { title: 'Introduction', points: ['Read the supplied references.', 'Identify questions for discussion.'] },
        { title: 'Discussion', points: ['Discuss the stated evidence.', 'Review what remains uncertain.'] },
      ],
    }, path.join(qa.root, filename));
    const checkpoint = path.join(qa.cfg.localDir, 'active-presentation.json');
    const unrelatedBytes = await readFile(path.join(qa.root, filename));
    await writeFile(checkpoint, JSON.stringify({ root: qa.root, presentation: {
      filename, title: 'Unrelated lecture', slideCount: 3,
      slideTitles: ['Unrelated lecture', 'Introduction', 'Discussion'],
      opened: false, sha256: sha256(unrelatedBytes),
    } }));
    const later = new Date(Date.parse(committed!.committedAt) + 1000);
    await utimes(checkpoint, later, later);
    qa.fetch.mockClear();
    const restarted = await newController(qa.cfg);
    expect(restarted.snapshot().presentation).toMatchObject({ filename, title: 'Unrelated lecture', sha256: sha256(unrelatedBytes) });
    expect(restarted.snapshot().presentation?.project).toBeUndefined();
    expect(restarted.presentationSelectionIdentity()).toBeUndefined();
    expect((await exported(restarted)).bytes.equals(unrelatedBytes)).toBe(true);
    expect((await readFile(committed!.working.path)).equals(current.bytes)).toBe(true);
    expect(qa.fetch).not.toHaveBeenCalled();
  });

  it('preserves the deck when larger text overflows and changes wording only after explicit shortening', async () => {
    const audiencePoints = [
      'Choose the intended audience who would benefit from the proposed campaign and review its needs with the marketing team.',
      'Prepare the campaign message with clear wording that helps the intended audience understand the proposed campaign purpose.',
      'Review the campaign material with the team before publishing and confirm that its wording matches the intended audience.',
      'Publish the approved campaign material through the chosen channels and review feedback with the responsible campaign team.',
    ];
    const revisedPoints = [
      'Choose the proposed audience; review its needs with marketing.',
      'Use wording that helps explain the proposed campaign purpose.',
      'Review audience fit with the team before publishing.',
      'Publish approved material through chosen channels; review feedback with the team.',
    ];
    const qa = await fixture({ audiencePoints, revisedPoints });
    await qa.create();
    const original = deck(qa.controller);
    const before = await exported(qa.controller);
    expect(original.slides[1]).toMatchObject({ type: 'text', points: audiencePoints });
    let failed = false;
    for (let index = 0; index < 3; index++) {
      const attemptDeck = deck(qa.controller);
      const attemptOutput = await exported(qa.controller);
      const projectId = qa.controller.presentationSelectionIdentity()!.projectId;
      const working = new PresentationWorkingFiles(qa.cfg);
      const attemptRecord = await working.load(projectId);
      try {
        await qa.request(
          `Make slide two larger, step ${index}.`,
          turn({ operations: [{ type: 'resize_text', target: 2, direction: 'larger' }] }),
        );
      } catch (error) {
        expect(error).toMatchObject({ code: 'layout_capacity' });
        expect((error as Error).message).toMatch(/unchanged.*shorten the text first/i);
        expect(deck(qa.controller)).toEqual(attemptDeck);
        expect((await exported(qa.controller)).bytes.equals(attemptOutput.bytes)).toBe(true);
        // No hidden revision, history entry, operation receipt or alternate file commit.
        expect(await working.load(projectId)).toEqual(attemptRecord);
        failed = true;
        break;
      }
      expect(deck(qa.controller).slides[1]).toMatchObject({ points: audiencePoints });
    }
    expect(failed).toBe(true);
    expect(qa.modelCalls.filter((call) => call.system.startsWith('Revise only'))).toHaveLength(0);
    expect(deck(qa.controller).slides.filter((_, index) => index !== 1)).toEqual(original.slides.filter((_, index) => index !== 1));

    await qa.request(
      'Shorten the wording on slide two, keeping its meaning.',
      turn({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Shorten the wording on slide two, keeping its meaning.', detailChange: 'shorten' }] }),
    );
    for (let index = 0; index < 3 && (deck(qa.controller).slides[1].textScale ?? 1) < 1.35; index++) {
      await qa.request(
        `Now make the shorter text larger, step ${index}.`,
        turn({ operations: [{ type: 'resize_text', target: 2, direction: 'larger' }] }),
      );
    }
    const updated = deck(qa.controller);
    expect(updated.slides[1]).toMatchObject({
      id: original.slides[1].id,
      type: 'text',
      textScale: 1.35,
      points: revisedPoints,
    });
    expect(updated.slides.filter((_, index) => index !== 1)).toEqual(
      original.slides.filter((_, index) => index !== 1),
    );
    const after = await exported(qa.controller);
    expect(after.slides[1]).toContain('sz="3240"');
    expect(after.slides[1]).toContain(revisedPoints[0]);
    expect(after.slides[1]).not.toContain(audiencePoints[0]);
    expect(after.slides.filter((_, index) => index !== 1)).toEqual(
      before.slides.filter((_, index) => index !== 1),
    );
    await expectWorkingRevision(qa.cfg, qa.controller, before);
    expect(qa.modelCalls.filter((call) => call.system.startsWith('Revise only'))).toHaveLength(1);
  });

  it('resolves the same picture across a multifile folder using the existing and most recently inserted source', async () => {
    const qa = await fixture();
    await qa.create();
    await writeFile(path.join(qa.root, 'different.png'), qa.secondImage);
    const original = deck(qa.controller);
    const before = await exported(qa.controller);
    await qa.request(
      'Use the same picture on slide two.',
      turn({
        fields: { folderPath: qa.root, sourceImage: 'same', open: false },
        operations: [{ type: 'insert_image', target: 2 }],
      }),
    );
    expect(deck(qa.controller).slides[1]).toMatchObject({ type: 'image', imageId: 1 });
    expect(await slidePictureBytes(await exported(qa.controller), 2)).toEqual(qa.firstImage);
    await qa.request(
      'Use a different picture on slide three.',
      turn({
        fields: { folderPath: qa.root, sourceImage: 'different', open: false },
        operations: [{ type: 'insert_image', target: 3 }],
      }),
    );
    expect(deck(qa.controller).slides[2]).toMatchObject({ type: 'image', imageId: 2 });
    await qa.request(
      'Use that same picture on slide four.',
      turn({
        fields: { folderPath: qa.root, sourceImage: 'same', open: false },
        operations: [{ type: 'insert_image', target: 4 }],
      }),
    );
    const updated = deck(qa.controller);
    expect(updated.slides[3]).toMatchObject({ type: 'image', imageId: 2 });
    expect(updated.allowImageReuse).toBe(true);
    expect(updated.slides.map((slide) => slide.id)).toEqual(
      original.slides.map((slide) => slide.id),
    );
    const after = await exported(qa.controller);
    expect(await slidePictureBytes(after, 1)).toEqual(qa.firstImage);
    expect(await slidePictureBytes(after, 2)).toEqual(qa.firstImage);
    expect(await slidePictureBytes(after, 3)).toEqual(qa.secondImage);
    expect(await slidePictureBytes(after, 4)).toEqual(qa.secondImage);
    expect(after.slides.filter((_, index) => [0, 4, 5].includes(index))).toEqual(
      before.slides.filter((_, index) => [0, 4, 5].includes(index)),
    );
    expect(await readFile(path.join(qa.root, 'campaign.png'))).toEqual(qa.firstImage);
    expect(await readFile(path.join(qa.root, 'different.png'))).toEqual(qa.secondImage);
  });

  it('persists an external image attachment and its undo while validating the original source after staging', async () => {
    const qa = await fixture();
    await qa.create();
    const original = deck(qa.controller);
    await qa.request(
      'Add a different image to the second slide.',
      turn({
        fields: { folderPath: qa.extra, sourceImage: 'different', open: false },
        operations: [{ type: 'insert_image', target: 2 }],
      }),
    );
    const attached = deck(qa.controller);
    expect(attached.slides[1]).toMatchObject({
      type: 'image',
      id: original.slides[1].id,
      imageId: 2,
    });
    expect(attached.slides.filter((_, index) => index !== 1)).toEqual(
      original.slides.filter((_, index) => index !== 1),
    );
    const pptx = await exported(qa.controller);
    expect(pptx.images.some((image) => image.equals(qa.firstImage))).toBe(true);
    expect(pptx.images.some((image) => image.equals(qa.secondImage))).toBe(true);
    await qa.request('Save the attached presentation.', turn({ operations: [{ type: 'save' }] }));
    await qa.controller.close();
    const restarted = await newController(qa.cfg);
    qa.fetch.mockClear();
    await qa.request(
      'Resume the attached presentation.',
      turn({ operations: [{ type: 'resume' }] }),
      restarted,
    );
    expect(deck(restarted)).toEqual(attached);
    expect(qa.fetch).not.toHaveBeenCalled();
    await qa.request(
      'Undo the extra picture.',
      turn({ operations: [{ type: 'undo' }] }),
      restarted,
    );
    expect(deck(restarted)).toEqual(original);
    await writeFile(
      path.join(qa.extra, 'different.png'),
      Buffer.concat([qa.secondImage, Buffer.from('changed')]),
    );
    const before = restarted.snapshot().presentation;
    await expect(
      qa.request(
        'Resume again after the source changed.',
        turn({ operations: [{ type: 'resume' }] }),
        restarted,
      ),
    ).rejects.toThrow(/original.*changed/i);
    expect(restarted.snapshot().presentation).toEqual(before);
  });

  it('retains a specifically named nonfirst creation image for subsequent same-picture reuse', async () => {
    const qa = await fixture();
    await writeFile(path.join(qa.root, 'different.png'), qa.secondImage);
    await qa.request(
      'Create six slides about Cyber Monday with different.png on the title slide.',
      turn({
        startsNewTask: true,
        fields: {
          topic: 'Cyber Monday campaign',
          totalSlides: 6,
          theme: 'dark',
          folderPath: qa.root,
          sourceImage: 'different.png',
          imageDestination: 1,
          open: false,
        },
        operations: [{ type: 'create' }, { type: 'insert_image', target: 1 }],
      }),
    );
    const original = deck(qa.controller);
    expect(original.slides[0]).toMatchObject({ type: 'cover', imageId: 2 });
    expect(original.slides[1]).toMatchObject({ type: 'image', imageId: 1 });
    const before = await exported(qa.controller);
    expect(await slidePictureBytes(before, 1)).toEqual(qa.secondImage);
    expect(await slidePictureBytes(before, 2)).toEqual(qa.firstImage);
    await qa.request(
      'Use the same picture on slide three.',
      turn({
        fields: { folderPath: qa.root, sourceImage: 'same', open: false },
        operations: [{ type: 'insert_image', target: 3 }],
      }),
    );
    const after = await exported(qa.controller);
    expect(deck(qa.controller).slides[2]).toMatchObject({ type: 'image', imageId: 2 });
    expect(await slidePictureBytes(after, 3)).toEqual(qa.secondImage);
    expect(after.slides.filter((_, index) => index !== 2)).toEqual(
      before.slides.filter((_, index) => index !== 2),
    );
    await expectWorkingRevision(qa.cfg, qa.controller, before);
  });

  it('creates, saves and resumes a six-slide text-only deck without synthetic image assets', async () => {
    const qa = await fixture();
    await qa.create(false);
    const original = deck(qa.controller);
    expect(qa.controller.snapshot().presentation?.project?.assets).toEqual([]);
    expect(original.slides.some((slide) => 'imageId' in slide)).toBe(false);
    const pptx = await exported(qa.controller);
    expect(pptx.slides).toHaveLength(6);
    expect(pptx.images).toEqual([]);
    await qa.request('Save the text deck.', turn({ operations: [{ type: 'save' }] }));
    await qa.controller.close();
    const restarted = await newController(qa.cfg);
    qa.fetch.mockClear();
    await qa.request(
      'Resume the text deck.',
      turn({ operations: [{ type: 'resume' }] }),
      restarted,
    );
    expect(deck(restarted)).toEqual(original);
    expect(qa.fetch).not.toHaveBeenCalled();
    expect((await exported(restarted)).images).toEqual([]);
  });

  it.each(['changed', 'deleted'])(
    'keeps the original brief hash binding after external-image staging and blocks a %s original on save and resume',
    async (change) => {
      const qa = await fixture();
      const briefPath = path.join(qa.root, 'brief.txt');
      const brief = Buffer.from(
        'Source brief: plan a community campaign and review it before publication.',
      );
      await writeFile(briefPath, brief);
      await qa.create();
      await qa.request(
        'Add an external picture on slide two.',
        turn({
          fields: { folderPath: qa.extra, sourceImage: 'different', open: false },
          operations: [{ type: 'insert_image', target: 2 }],
        }),
      );
      const original = deck(qa.controller);
      await qa.request(
        'Save the project with its brief.',
        turn({ operations: [{ type: 'save' }] }),
      );
      const id = qa.controller.snapshot().presentation!.project!.saved!.id;
      const persisted = await new PresentationStore(qa.cfg).load(id, signal());
      expect(persisted?.local?.root).not.toBe(qa.root);
      expect(persisted?.local?.originalBriefBinding).toEqual({
        path: briefPath,
        sha256: sha256(brief),
      });
      expect(persisted?.session.briefRef).toEqual({ filename: 'brief.txt', sha256: sha256(brief) });
      expect(persisted?.session).not.toHaveProperty('originalBriefBinding');
      expect(JSON.stringify(persisted?.session)).not.toContain(briefPath);
      expect(JSON.stringify(persisted?.session)).not.toContain(brief.toString());
      expect(await readFile(path.join(persisted!.local!.root, 'brief.txt'))).toEqual(brief);
      if (change === 'changed') await writeFile(briefPath, 'A changed source brief.');
      else await unlink(briefPath);
      const beforeSave = qa.controller.snapshot().presentation;
      await expect(
        qa.request(
          'Save after the original brief changed.',
          turn({ operations: [{ type: 'save' }] }),
        ),
      ).rejects.toThrow(/original presentation brief (?:changed|is unavailable)/i);
      expect(qa.controller.snapshot().presentation).toEqual(beforeSave);
      await qa.controller.close();
      const restarted = await newController(qa.cfg);
      const beforeResume = restarted.snapshot().presentation;
      await expect(
        qa.request(
          'Resume the project with its original brief.',
          turn({ operations: [{ type: 'resume' }] }),
          restarted,
        ),
      ).rejects.toThrow(/original presentation brief (?:changed|is unavailable)/i);
      expect(restarted.snapshot().presentation).toEqual(beforeResume);
      await writeFile(briefPath, brief);
      await qa.request(
        'Resume after restoring the original brief.',
        turn({ operations: [{ type: 'resume' }] }),
        restarted,
      );
      expect(deck(restarted)).toEqual(original);
      const restored = await exported(restarted);
      expect(await slidePictureBytes(restored, 1)).toEqual(qa.firstImage);
      expect(await slidePictureBytes(restored, 2)).toEqual(qa.secondImage);
    },
  );
});
