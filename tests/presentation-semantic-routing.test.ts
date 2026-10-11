import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { PresentationWorkingFiles } from '../server/computer/presentation-working-file';
import * as pictureProject from '../server/computer/presentation-project';
import * as presentation from '../server/computer/presentation';
import * as orderedPresentation from '../server/computer/presentation-deck';
import * as interpreter from '../server/computer/presentation-intent';
import * as nativeApps from '../server/computer/native-apps';
import type {
  PresentationIntentContext,
  PresentationTurnIntent,
} from '../shared/presentation-intent';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import type { ComputerResult } from '../shared/computer';

const controllers: ComputerController[] = [];
const JSZip = createRequire(import.meta.url)('jszip');
const signal = () => new AbortController().signal;
const transcript = [
  'Can you create a, uh, PowerPoint about Black History Month in, um...',
  "No, don't do that, actually.",
  'Okay. Can you create a PowerPoint for me, uh, based on, um...',
  'Cyber Monday, and I want you to add in the first slide a picture from my, uh, marketing folder in desktop.',
];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const controller of controllers.splice(0)) await controller.close();
});

function turn(partial: Partial<PresentationTurnIntent>): PresentationTurnIntent {
  return {
    kind: 'request',
    domain: 'presentation',
    startsNewTask: false,
    awaitingContinuation: false,
    fields: {},
    operations: [],
    ...partial,
  };
}

async function finishContinuations(controller: ComputerController, input: ComputerResult) {
  let result = input;
  for (let count = 0; count < 5; count++) {
    const intent = result.desktopIntent;
    if (!intent || !('continueRequest' in intent) || !intent.continueRequest) return result;
    if (intent.kind === 'slide')
      controller.recordSelectedSlide(intent.filename!, Number(intent.slide), intent.identity);
    result = await controller.request(intent.continueRequest, signal());
  }
  throw new Error('The bounded desktop continuation did not finish.');
}

async function setup(options: { existing?: boolean; ambiguous?: boolean } = {}) {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-semantic-routing-'));
  const output = path.join(localDir, 'Work');
  const marketing = path.join(localDir, 'Desktop', 'Marketing');
  await mkdir(output);
  await mkdir(marketing, { recursive: true });
  const canvas = createCanvas(240, 140);
  canvas.getContext('2d').fillRect(0, 0, 240, 140);
  await writeFile(path.join(marketing, 'campaign.png'), canvas.toBuffer('image/png'));
  const cfg = {
    ...config(),
    localDir,
    host: '127.0.0.1',
    hfToken: 'test-no-network',
    neonUrl: '',
    cloudUrl: '',
    dbToken: '',
  };
  const controller = new ComputerController(cfg); // Exercise the application's default provider-enabled semantic route.
  controllers.push(controller);
  await controller.init();
  await controller.authorizeFolder(
    output,
    await readFile(path.join(localDir, 'desktop-bridge-key'), 'utf8'),
  );
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  vi.spyOn(nativeApps, 'openNativeApp').mockResolvedValue({
    app: 'fileExplorer',
    name: 'File Explorer',
    mode: 'launched',
  });
  const generateGeneric = vi
    .spyOn(presentation, 'generatePresentationOutline')
    .mockRejectedValue(
      new Error('Semantic presentation turns must not fall back to generic string routing.'),
    );
  const folder = vi
    .spyOn(pictureProject, 'findPresentationFolder')
    .mockImplementation(async (name, _selected, _roots, location) => {
      if (name.toLowerCase() !== 'marketing' && name !== marketing)
        throw new Error(`Unexpected folder lookup: ${name}`);
      if (options.ambiguous && location !== 'desktop')
        throw new pictureProject.PresentationProjectError(
          'I found more than one Marketing folder. Is it on your Desktop, in Documents, or in Downloads?',
        );
      return marketing;
    });
  const contexts: { request: string; context: PresentationIntentContext }[] = [];
  const interpretations = new Map<string, PresentationTurnIntent>();
  const interpret = vi
    .spyOn(interpreter, 'interpretPresentationTurn')
    .mockImplementation(async (request, context) => {
      contexts.push({ request, context: structuredClone(context) });
      const answer = interpretations.get(request);
      if (!answer) throw new Error(`No synthetic interpretation registered for ${request}`);
      return answer;
    });
  const deck: OrderedPresentationDeck = {
    schemaVersion: 2,
    title: 'Cyber Monday',
    theme: 'blue',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      {
        id: 'cover',
        type: 'cover',
        title: 'Cyber Monday',
        subtitle: 'Proposed campaign',
        imageId: 1,
      },
      {
        id: 'campaign',
        type: 'text',
        title: 'Proposed campaign',
        points: ['Reach the intended audience.', 'Evaluate the proposed campaign.'],
      },
      {
        id: 'process',
        type: 'process',
        title: 'Proposed process',
        stages: [
          { label: 'Plan', detail: 'Choose the proposed audience.' },
          { label: 'Launch', detail: 'Publish the approved campaign.' },
          { label: 'Review', detail: 'Measure observed results.' },
        ],
      },
    ],
  };
  const planning = vi
    .spyOn(orderedPresentation, 'planOrderedDeck')
    .mockImplementation(async (fields) => ({
      ...structuredClone(deck),
      theme: fields.theme ?? 'blue',
    }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (!Array.isArray(body.messages[1].content))
        throw new Error('Unexpected inference outside the typed interpreter seam.');
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ description: 'Synthetic QA campaign image.' }) },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  if (options.existing) {
    const filename = 'synthetic-existing.pptx';
    await presentation.writePresentation(
      {
        title: 'Existing campaign',
        subtitle: 'Synthetic fixture',
        slides: [
          { title: 'Audience', points: ['Keep this audience text.'] },
          { title: 'Proposal', points: ['Keep this proposal text.'] },
          { title: 'Conclusion', points: ['Keep this conclusion text.'] },
        ],
      },
      path.join(output, filename),
    );
    const bytes = await readFile(path.join(output, filename));
    controller.state.presentation = {
      filename,
      title: 'Existing campaign',
      slideCount: 4,
      slideTitles: ['Existing campaign', 'Audience', 'Proposal', 'Conclusion'],
      sha256: createHash('sha256').update(bytes).digest('hex'),
      opened: false,
    };
  }
  return {
    cfg,
    controller,
    output,
    marketing,
    folder,
    interpret,
    interpretations,
    contexts,
    planning,
    generateGeneric,
  };
}

describe('model-directed presentation turn routing', () => {
  it('creates a real summary revision after a failed expansion without replaying the failed edit', async () => {
    const qa = await setup();
    const create = 'Create Cyber Monday using Marketing on Desktop. Save only.';
    qa.interpretations.set(create, turn({
      startsNewTask: true,
      fields: { topic: 'Cyber Monday', folderName: 'Marketing', folderLocation: 'desktop', imageDestination: 1, open: false },
      operations: [{ type: 'create' }, { type: 'insert_image', target: 1 }],
    }));
    await finishContinuations(qa.controller, await qa.controller.request(create, signal()));
    const before = qa.controller.snapshot().presentation!;
    const original = await qa.controller.presentationExport();
    const revise = vi.spyOn(orderedPresentation, 'reviseOrderedSlide').mockRejectedValue(new Error('The explanation could not fit while preserving facts.'));
    const summary = vi.spyOn(orderedPresentation, 'generateSummarySlide').mockResolvedValue({
      id: 'summary-after-failure', type: 'text', title: 'Campaign summary',
      points: ['Choose the intended audience.', 'Review the proposal before release.'],
    });
    const expand = 'Explain slide two in more detail.';
    qa.interpretations.set(expand, turn({ fields: { open: false }, operations: [{ type: 'revise_slide', target: 2, instruction: expand, detailChange: 'expand' }] }));
    await expect(qa.controller.request(expand, signal())).rejects.toThrow('could not fit');
    expect(qa.controller.snapshot().presentation).toEqual(before);
    const next = 'Create a summary slide.';
    qa.interpretations.set(next, turn({ fields: { open: false }, operations: [{ type: 'add_summary' }] }));
    const result = await qa.controller.request(next, signal());
    expect(revise).toHaveBeenCalledTimes(1);
    expect(summary).toHaveBeenCalledTimes(1);
    expect(result.state.presentation?.slideCount).toBe(before.slideCount + 1);
    expect(result.state.presentation?.project?.orderedDeck?.slides.slice(0, -1)).toEqual(before.project?.orderedDeck?.slides);
    expect(result.state.presentation?.project?.orderedDeck?.slides.at(-1)?.title).toBe('Campaign summary');
    expect(qa.contexts.at(-1)?.context.draft).toBeNull();
    expect(qa.contexts.at(-1)?.context.lastFailedTask?.operations[0].type).toBe('revise_slide');
    const current = await qa.controller.presentationExport();
    expect(current.filename).toBe(before.filename);
    expect(current.bytes.equals(original.bytes)).toBe(false);
    const projectId = qa.controller.presentationSelectionIdentity()!.projectId;
    const workingFiles = new PresentationWorkingFiles(qa.cfg);
    const working = await workingFiles.load(projectId);
    expect(working?.working.sha256).toBe(result.state.presentation?.sha256);
    expect((await readFile(working!.working.path)).equals(current.bytes)).toBe(true);
    const archived = path.join(workingFiles.directory(projectId), `previous-${before.sha256}.pptx`);
    expect((await readFile(archived)).equals(original.bytes)).toBe(true);
  });

  it('retains an incomplete topic and cancels it before a later Cyber Monday continuation', async () => {
    const qa = await setup();
    qa.interpretations.set(
      transcript[0],
      turn({
        startsNewTask: true,
        awaitingContinuation: true,
        fields: { topic: 'Black History Month' },
        operations: [{ type: 'create' }],
        reply: 'Go ahead, I’m listening.',
      }),
    );
    qa.interpretations.set(transcript[1], turn({ kind: 'cancellation' }));
    qa.interpretations.set(
      transcript[2],
      turn({ startsNewTask: true, awaitingContinuation: true, operations: [{ type: 'create' }] }),
    );
    qa.interpretations.set(
      transcript[3],
      turn({
        kind: 'continuation',
        fields: {
          topic: 'Cyber Monday',
          folderName: 'Marketing',
          folderLocation: 'desktop',
          imageDestination: 1,
        },
        operations: [{ type: 'create' }, { type: 'insert_image', target: 1 }],
      }),
    );
    const incomplete = await qa.controller.request(transcript[0], signal());
    expect(incomplete.state.presentation).toBeFalsy();
    expect(await readdir(qa.output)).toEqual([]);
    const cancelled = await qa.controller.request(transcript[1], signal());
    expect(cancelled.summary).toMatch(/stopp|cancel/i);
    const waiting = await qa.controller.request(transcript[2], signal());
    expect(waiting.summary).toMatch(/about|topic/i);
    expect(waiting.state.presentation).toBeFalsy();
    const created = await finishContinuations(
      qa.controller,
      await qa.controller.request(transcript[3], signal()),
    );
    const topicContext = qa.contexts.find((entry) => entry.request === transcript[3])!.context;
    expect(topicContext.draft?.fields.topic).toBeUndefined();
    expect(topicContext.draft?.transcripts).toContain(transcript[2]);
    expect(
      qa.folder.mock.calls.some(
        ([name, , , location]) => name === 'Marketing' && location === 'desktop',
      ),
    ).toBe(true);
    expect(qa.generateGeneric).not.toHaveBeenCalled();
    const planned = JSON.stringify(qa.planning.mock.calls.map(([fields]) => fields));
    expect(planned).not.toContain('Black History Month');
    expect(planned).toContain('Cyber Monday');
    expect(created.state.presentation?.title).toBe('Cyber Monday');
  });

  it('keeps the pending topic through a question and lets a correction change only the theme', async () => {
    const qa = await setup();
    const initial = 'Make a Cyber Monday deck with my folder pictures.';
    const question = 'What are you making for me?';
    const correction = 'No, use dark blue instead.';
    const source = 'Marketing on Desktop.';
    qa.interpretations.set(
      initial,
      turn({
        startsNewTask: true,
        fields: { topic: 'Cyber Monday' },
        operations: [{ type: 'create' }, { type: 'insert_image', target: 1 }],
      }),
    );
    qa.interpretations.set(
      question,
      turn({ kind: 'question', reply: 'A Cyber Monday presentation using your pictures.' }),
    );
    qa.interpretations.set(correction, turn({ kind: 'correction', fields: { theme: 'dark' } }));
    qa.interpretations.set(
      source,
      turn({
        kind: 'continuation',
        fields: { folderName: 'Marketing', folderLocation: 'desktop' },
      }),
    );
    await qa.controller.request(initial, signal());
    const reply = await qa.controller.request(question, signal());
    expect(reply.summary).toContain('Cyber Monday');
    expect(qa.planning).not.toHaveBeenCalled();
    await qa.controller.request(correction, signal());
    await finishContinuations(qa.controller, await qa.controller.request(source, signal()));
    const sourceContext = qa.contexts.find((entry) => entry.request === source)!.context;
    expect(sourceContext.draft?.fields).toMatchObject({ topic: 'Cyber Monday', theme: 'dark' });
    expect(sourceContext.draft?.operations.some((op) => op.type === 'create')).toBe(true);
    expect(sourceContext.draft?.transcripts).toContain(correction);
    expect(qa.generateGeneric).not.toHaveBeenCalled();
  });

  it('retains folder name and image destination when answering an ambiguity with only a location', async () => {
    const qa = await setup({ existing: true, ambiguous: true });
    const request = 'Please put a Marketing image on slide two.';
    const answer = 'It is on my desktop.';
    qa.interpretations.set(
      request,
      turn({
        fields: { folderName: 'Marketing', imageDestination: 2 },
        operations: [{ type: 'insert_image', target: 2 }],
      }),
    );
    qa.interpretations.set(
      answer,
      turn({ kind: 'continuation', fields: { folderLocation: 'desktop' } }),
    );
    const ask = await qa.controller.request(request, signal());
    expect(ask.summary).toMatch(/Desktop.*Documents.*Downloads/i);
    const resolved = await qa.controller.request(answer, signal());
    expect(resolved.summary).not.toMatch(/more than one/i);
    expect(qa.folder.mock.calls[0][0]).toBe('Marketing');
    expect(qa.folder.mock.calls[0][3]).toBeUndefined();
    expect(
      qa.folder.mock.calls
        .slice(1)
        .every(
          ([name, , , location]) =>
            ['Marketing', qa.marketing].includes(name) && location === 'desktop',
        ),
    ).toBe(true);
    const prior = qa.contexts.find((entry) => entry.request === answer)!.context.draft;
    expect(prior?.fields).toMatchObject({ folderName: 'Marketing', imageDestination: 2 });
    expect(prior?.pendingQuestion?.field).toBe('folderLocation');
  });

  it('gives the interpreter native failure evidence and suppresses unsupported success claims', async () => {
    const qa = await setup({ existing: true });
    const existing = qa.controller.state.presentation!;
    const identity = qa.controller.presentationSelectionIdentity();
    qa.controller.recordSelectedSlide(existing.filename, 2, identity);
    qa.controller.recordPresentationNavigationFailure(
      existing.filename,
      'Synthetic PowerPoint dialog blocked navigation.',
      undefined,
      identity,
    );
    const request = 'Did you finish selecting the slide?';
    qa.interpretations.set(
      request,
      turn({ kind: 'question', reply: 'I successfully selected slide two.' }),
    );
    const result = await qa.controller.request(request, signal());
    const context = qa.contexts.at(-1)!.context;
    expect(context.activePresentation?.verifiedSelectedSlide).toBeUndefined();
    expect(JSON.stringify(context)).toMatch(/couldn.t confirm|failed|blocked/i);
    expect(result.summary).toMatch(/couldn.t confirm|not.*verif/i);
    expect(result.summary).not.toContain('successfully selected');
    expect(result.state.presentation?.filename).toBe(existing.filename);
    expect(qa.planning).not.toHaveBeenCalled();
  });

  it('cancels a queued image insertion and rejects its old desktop continuation without writing', async () => {
    const qa = await setup({ existing: true });
    const existing = qa.controller.state.presentation!;
    const request = 'Place a picture from Marketing on Desktop on slide one.';
    qa.interpretations.set(
      request,
      turn({
        fields: { folderName: 'Marketing', folderLocation: 'desktop', imageDestination: 1 },
        operations: [{ type: 'insert_image', target: 1 }],
      }),
    );
    const prepared = await qa.controller.request(request, signal());
    expect(prepared.desktopIntent?.kind).toBe('openFolder');
    const token =
      prepared.desktopIntent?.kind === 'openFolder'
        ? prepared.desktopIntent.continueRequest
        : undefined;
    expect(token).toBeTruthy();
    const cancel = "No, don't do that, actually.";
    qa.interpretations.set(cancel, turn({ kind: 'cancellation' }));
    const stopped = await qa.controller.request(cancel, signal());
    expect(stopped.summary).toMatch(/cancel|stopp/i);
    const stale = await qa.controller.request(token!, signal());
    expect(stale.summary).toMatch(/replaced|cancelled|no longer/i);
    expect(stale.state.presentation?.filename).toBe(existing.filename);
    expect(stale.state.presentation?.sha256).toBe(existing.sha256);
    expect(await readdir(qa.output)).toEqual([existing.filename]);
  });

  it('uses a correction target for the pending edit and completes the actual file before claiming an image was added', async () => {
    const qa = await setup({ existing: true });
    const request = 'Use the Marketing picture on my Desktop on slide one.';
    const correction = 'No, put it on the second slide instead.';
    qa.interpretations.set(
      request,
      turn({
        fields: { folderName: 'Marketing', folderLocation: 'desktop', imageDestination: 1 },
        operations: [{ type: 'insert_image', target: 1 }],
      }),
    );
    qa.interpretations.set(
      correction,
      turn({ kind: 'correction', fields: { imageDestination: 2 } }),
    );
    const prepared = await qa.controller.request(request, signal());
    expect(prepared.state.presentation?.imageEdits).toBeUndefined();
    const corrected = await qa.controller.request(correction, signal());
    expect(corrected.desktopIntent?.kind).toBe('openFolder');
    const token =
      corrected.desktopIntent?.kind === 'openFolder'
        ? corrected.desktopIntent.continueRequest
        : undefined;
    expect(token).toBeTruthy();
    const completed = await qa.controller.request(token!, signal());
    expect(completed.state.presentation?.imageEdits).toEqual([
      expect.objectContaining({ slide: 2, filename: 'campaign.png' }),
    ]);
    expect(completed.summary).toMatch(/added.*slide 2/i);
    expect(qa.generateGeneric).not.toHaveBeenCalled();
    expect(qa.planning).not.toHaveBeenCalled();
    const context = qa.contexts.find((entry) => entry.request === correction)!.context;
    expect(context.draft?.fields).toMatchObject({ folderName: 'Marketing', imageDestination: 1 });
    expect(context.lastVerifiedResult?.summary ?? '').not.toMatch(/added|replaced/);
  });

  it('executes an ordered create, insert, read request across native continuations and keeps actual revision evidence', async () => {
    const qa = await setup();
    const request =
      'Create my Cyber Monday presentation using Marketing on Desktop on slide one, then read it.';
    qa.interpretations.set(
      request,
      turn({
        startsNewTask: true,
        fields: {
          topic: 'Cyber Monday',
          folderName: 'Marketing',
          folderLocation: 'desktop',
          imageDestination: 1,
        },
        operations: [
          { type: 'create' },
          { type: 'insert_image', target: 1 },
          { type: 'read_slide', target: 1 },
        ],
      }),
    );
    let result = await qa.controller.request(request, signal());
    expect(result.state.presentation).toBeFalsy();
    expect(result.state.presentation?.imageEdits).toBeUndefined();
    let continuations = 0;
    while (
      result.desktopIntent &&
      'continueRequest' in result.desktopIntent &&
      result.desktopIntent.continueRequest
    ) {
      const intent = result.desktopIntent;
      if (intent.kind === 'slide')
        qa.controller.recordSelectedSlide(intent.filename!, Number(intent.slide), intent.identity);
      result = await qa.controller.request(intent.continueRequest!, signal());
      expect(++continuations).toBeLessThanOrEqual(3);
    }
    expect(continuations).toBeGreaterThan(0);
    expect(result.state.presentation?.project?.orderedDeck?.slides[0]).toMatchObject({
      type: 'cover',
      imageId: 1,
    });
    expect(result.summary).toContain('Slide 1');
    expect(result.summary).toContain('Cyber Monday');
    const exported = await qa.controller.presentationExport();
    const zip = await JSZip.loadAsync(exported.bytes);
    expect(await zip.file('ppt/slides/slide1.xml').async('string')).toContain('<p:pic>');
    const media = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => name.startsWith('ppt/media/') && !zip.files[name].dir)
        .map((name) => zip.file(name).async('nodebuffer')),
    );
    const originalImage = await readFile(path.join(qa.marketing, 'campaign.png'));
    expect(media.some((bytes: Buffer) => bytes.equals(originalImage))).toBe(true);
    expect(createHash('sha256').update(exported.bytes).digest('hex')).toBe(
      result.state.presentation?.sha256,
    );
    const question = 'What did you finish?';
    qa.interpretations.set(
      question,
      turn({
        kind: 'question',
        reply: 'I created the presentation, inserted your image, and read slide one.',
      }),
    );
    await qa.controller.request(question, signal());
    const context = qa.contexts.at(-1)!.context;
    expect(context.draft).toBeNull();
    expect(context.lastVerifiedResult?.filename).toBe(result.state.presentation?.filename);
    expect(context.lastVerifiedResult?.summary).toMatch(/slide 1/i);
    expect(context.activePresentation?.reviewedSlide).toBe(1);
    expect(qa.planning).toHaveBeenCalledTimes(1);
    expect(qa.generateGeneric).not.toHaveBeenCalled();
  });

  it('handles an explicit whole-task cancellation without inference even when the provider is unavailable', async () => {
    const qa = await setup({ existing: true });
    const request = 'Create a replacement deck based on, um...';
    qa.interpretations.set(
      request,
      turn({ startsNewTask: true, awaitingContinuation: true, operations: [{ type: 'create' }] }),
    );
    await qa.controller.request(request, signal());
    const before = qa.controller.snapshot().presentation;
    qa.interpret.mockRestore();
    const network = vi.fn(async () => {
      throw new Error('Provider is unavailable during stop.');
    });
    vi.stubGlobal('fetch', network);
    const cancelled = await qa.controller.request("No, don't do that, actually.", signal());
    expect(cancelled.summary).toMatch(/cancel|stopp/i);
    expect(cancelled.state.presentation).toEqual(before);
    expect(network).not.toHaveBeenCalled();
    expect(qa.planning).not.toHaveBeenCalled();
    expect(qa.generateGeneric).not.toHaveBeenCalled();
  });

  it('keeps distinct explicit targets in an ordered pair of image insertions', async () => {
    const qa = await setup({ existing: true });
    const request = 'Put the Marketing picture on slide one and use the same picture on slide two.';
    qa.interpretations.set(
      request,
      turn({
        fields: {
          folderName: 'Marketing',
          folderLocation: 'desktop',
          imageDestination: 1,
          sourceImage: 'same',
        },
        operations: [
          { type: 'insert_image', target: 1 },
          { type: 'insert_image', target: 2, sourceImage: 'same' },
        ],
      }),
    );
    let result = await qa.controller.request(request, signal());
    let continuations = 0;
    while (
      result.desktopIntent &&
      'continueRequest' in result.desktopIntent &&
      result.desktopIntent.continueRequest
    ) {
      const intent = result.desktopIntent;
      if (intent.kind === 'slide')
        qa.controller.recordSelectedSlide(intent.filename!, Number(intent.slide), intent.identity);
      result = await qa.controller.request(intent.continueRequest!, signal());
      expect(++continuations).toBeLessThanOrEqual(5);
    }
    expect(result.state.presentation?.imageEdits?.map((edit) => edit.slide)).toEqual([1, 2]);
    expect(result.state.presentation?.imageEdits?.map((edit) => edit.filename)).toEqual([
      'campaign.png',
      'campaign.png',
    ]);
    expect(result.state.presentation?.slideTitles).toEqual([
      'Existing campaign',
      'Audience',
      'Proposal',
      'Conclusion',
    ]);
    expect(qa.planning).not.toHaveBeenCalled();
    expect(qa.generateGeneric).not.toHaveBeenCalled();
  });
});
