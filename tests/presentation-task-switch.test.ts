import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { writePresentation } from '../server/computer/presentation';
import * as pictureProject from '../server/computer/presentation-project';
import * as nativeApps from '../server/computer/native-apps';

const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const controller of controllers.splice(0)) await controller.close();
});

const outline = {
  title: 'Black History Month',
  subtitle: 'A proposed classroom presentation',
  slides: [
    {
      title: 'Introduce the topic',
      points: ['Choose the focus of the discussion', 'Use supplied classroom materials'],
    },
    {
      title: 'Discuss and reflect',
      points: [
        'Invite questions about the supplied material',
        'Review the presentation before sharing',
      ],
    },
  ],
};

async function setup() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-task-switch-'));
  const output = path.join(localDir, 'Work');
  const marketing = path.join(localDir, 'Desktop', 'Marketing');
  await mkdir(output);
  await mkdir(marketing, { recursive: true });
  const canvas = createCanvas(100, 70);
  canvas.getContext('2d').fillRect(0, 0, 100, 70);
  await writeFile(path.join(marketing, 'campaign.png'), canvas.toBuffer('image/png'));
  const cfg = {
    ...config(),
    localDir,
    hfToken: 'mock-no-network',
    cloudUrl: '',
    neonUrl: '',
    dbToken: '',
  };
  // Keep the legacy parser compatibility contract; typed conversations have their own integration suite.
  const controller = new ComputerController(cfg, { semanticPresentation: false });
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
  const filename = 'existing-generated-deck.pptx';
  const file = path.join(output, filename);
  await writePresentation({ ...outline, title: 'Existing presentation' }, file);
  controller.state.presentation = {
    filename,
    title: 'Existing presentation',
    slideCount: 3,
    slideTitles: ['Existing presentation', 'Introduce the topic', 'Discuss and reflect'],
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
    opened: true,
  };
  controller.recordSelectedSlide(filename, 3);
  const finder = vi
    .spyOn(pictureProject, 'findPresentationFolder')
    .mockImplementation(async (name, _selected, _roots, location) => {
      expect(name.toLowerCase()).toBe('marketing');
      if (location !== 'desktop')
        throw new pictureProject.PresentationProjectError(
          'I found more than one Marketing folder. Is it on your Desktop, in Documents, or in Downloads?',
        );
      return marketing;
    });
  const requests: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      const system = body.messages[0].content as string;
      const content = body.messages[1].content;
      let result: unknown;
      if (system.includes('computer tool planner')) {
        const request = JSON.parse(content).request;
        result = /\b(?:create|make)\b/i.test(request)
          ? {
              action: { tool: 'createPresentation', request, slides: 3, open: false },
              clarification: null,
            }
          : {
              action: null,
              clarification:
                'Do you want a separate Black History Month presentation, or a picture in your current presentation?',
            };
      } else if (system.includes('PowerPoint outline')) {
        const slideCount = Number(system.match(/editable (\d+)-slide/)?.[1] ?? 3);
        result = {
          ...outline,
          slides: Array.from({ length: slideCount - 1 }, (_unused, index) => ({
            ...outline.slides[index % outline.slides.length],
            title: `${outline.slides[index % outline.slides.length].title} ${index + 1}`,
          })),
        };
      } else if (Array.isArray(content))
        result = { description: 'A synthetic illustration for testing only.' };
      else throw new Error('Unexpected model route: ' + system.slice(0, 70));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  return { controller, finder, requests, marketing, filename };
}

const previousRequests = [
  'Open my Marketing folder.',
  'Add the image in my Marketing folder to the last slide.',
  'Create a marketing presentation using the images in my Marketing folder.',
];

it.each(previousRequests)(
  'a new explicit topic clears the old folder task after %s',
  async (previousRequest) => {
    const qa = await setup();
    await expect(qa.controller.request(previousRequest, signal())).rejects.toThrow(
      'more than one Marketing',
    );
    qa.finder.mockClear();
    const result = await qa.controller.request(
      'Create a Black History Month presentation. Save only.',
      signal(),
    );
    expect(result.state.presentation?.title).toBe('Black History Month');
    expect(qa.finder).not.toHaveBeenCalled();
    expect((qa.controller as any).pendingImageInsert).toBeNull();
    expect((qa.controller as any).pendingFolderRequest).toBe(false);
    expect((qa.controller as any).pendingPictureRequest).toBeNull();
    expect((qa.controller as any).pendingPictureDesign).toBeNull();
    expect((qa.controller as any).pendingFolderName).toBeNull();
    expect((qa.controller as any).presentationGoal).toMatch(/Black History Month/);
  },
);

it('a make request replaces a pending image insertion without requiring the word new', async () => {
  const qa = await setup();
  await expect(qa.controller.request(previousRequests[1], signal())).rejects.toThrow(
    'more than one Marketing',
  );
  qa.finder.mockClear();
  const result = await qa.controller.request(
    'Make me a presentation for Black History Month. Save only.',
    signal(),
  );
  expect(result.state.presentation?.title).toBe('Black History Month');
  expect(qa.finder).not.toHaveBeenCalled();
  expect((qa.controller as any).pendingImageInsert).toBeNull();
});

it('an explicit new topic replaces a resolved image-deck task waiting for a visual style', async () => {
  const qa = await setup();
  // This is the valid intermediate state after resolving an image folder and
  // asking the optional style question, before creating its first revision.
  (qa.controller as any).pendingPictureDesign = {
    goal: 'Create a marketing presentation using the images in my Marketing folder.',
    root: qa.marketing,
  };
  (qa.controller as any).presentationGoal = 'Create a marketing presentation.';
  const result = await qa.controller.request(
    'Create a Black History Month presentation. Save only.',
    signal(),
  );
  expect(result.state.presentation?.title).toBe('Black History Month');
  expect(qa.finder).not.toHaveBeenCalled();
  expect((qa.controller as any).pendingPictureDesign).toBeNull();
  expect((qa.controller as any).presentationGoal).toMatch(/Black History Month/);
  const outlineRequest = qa.requests.find((body) =>
    body.messages[0].content.includes('PowerPoint outline'),
  );
  expect(outlineRequest.messages[1].content).toContain('Black History Month');
  expect(outlineRequest.messages[1].content).not.toMatch(/Marketing|Design preference/i);
});

it.each(previousRequests)(
  'a topic question never becomes a folder name or repeats an ambiguous lookup after %s',
  async (previousRequest) => {
    const qa = await setup();
    await expect(qa.controller.request(previousRequest, signal())).rejects.toThrow(
      'more than one Marketing',
    );
    qa.finder.mockClear();
    const result = await qa.controller.request('For Black History Month?', signal());
    expect(qa.finder).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/Black History Month/i);
    expect(result.summary).not.toMatch(/more than one Marketing|could not find/i);
  },
);

it('remembers a resolved Desktop Marketing folder for a later presentation task', async () => {
  const qa = await setup();
  await expect(qa.controller.request(previousRequests[1], signal())).rejects.toThrow(
    'more than one Marketing',
  );
  const source = await qa.controller.request('It is on Desktop.', signal());
  expect(source.desktopIntent).toMatchObject({
    kind: 'openFolder',
    imageSource: true,
    path: qa.marketing,
  });
  const intent = source.desktopIntent;
  if (intent?.kind !== 'openFolder' || !intent.continueRequest)
    throw new Error('Missing insertion continuation');
  const inserted = await qa.controller.request(intent.continueRequest, signal());
  expect(inserted.summary).toMatch(/I added campaign\.png/i);
  // Saving an image is distinct from verifying which slide PowerPoint selected.
  expect(inserted.state.presentation?.selectedSlide).toBeUndefined();
  await qa.controller.request('Create a Black History Month presentation. Save only.', signal());
  qa.finder.mockClear();
  const followup = await qa.controller.request(
    'Add the image in my Marketing folder to the last slide.',
    signal(),
  );
  expect(followup.desktopIntent).toMatchObject({
    kind: 'openFolder',
    imageSource: true,
    path: qa.marketing,
  });
  for (const call of qa.finder.mock.calls) expect(call[3]).toBe('desktop');
});

it('records a native navigation failure without pretending the written file was lost or selected', async () => {
  const qa = await setup();
  const before = qa.controller.snapshot().presentation!;
  const result = (qa.controller as any).recordPresentationNavigationFailure(
    qa.filename,
    'PowerPoint did not expose a selectable thumbnail.',
    2,
  );
  expect(result.presentation).toMatchObject({
    filename: before.filename,
    sha256: before.sha256,
    desktopNavigation: {
      status: 'failed',
      message: 'PowerPoint did not expose a selectable thumbnail.',
      requestedSlide: 2,
    },
  });
  expect(result.presentation?.selectedSlide).toBeUndefined();
  expect((qa.controller as any).conversation.at(-1).outcome).toContain('go to slide 2');
  const selected = qa.controller.recordSelectedSlide(qa.filename, 2);
  expect(selected.presentation).toMatchObject({
    selectedSlide: 2,
    desktopNavigation: { status: 'verified', slide: 2 },
  });
});
