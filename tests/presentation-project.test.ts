import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import * as nativeApps from '../server/computer/native-apps';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import {
  findPresentationFolder,
  isPictureDeckRequest,
  spokenFolderName,
  unsupportedDeckValues,
} from '../server/computer/presentation-project';
import { pictureDeckSchema, type PictureDeck } from '../shared/presentation-project';
import { spokenComputerReply } from '../src/speechText';
import { buildApp } from '../server/app';
import { writePresentation } from '../server/computer/presentation';
import { createHash } from 'node:crypto';

const JSZip = createRequire(import.meta.url)('jszip');
const controllers: ComputerController[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const c of controllers.splice(0)) await c.close();
});
const signal = () => new AbortController().signal;
const deck: PictureDeck = {
  title: 'Q3 Marketing Direction',
  subtitle: 'A proposed plan for the next quarter',
  slides: [1, 2, 3].map((imageId) => ({
    title: `Marketing opportunity ${imageId}`,
    imageId,
    points: ['Proposed campaign direction', 'Measure outcomes before reporting results'],
  })),
  diagram: {
    title: 'Proposed customer journey',
    stages: [
      { label: 'Awareness', detail: 'Reach a relevant audience' },
      { label: 'Consideration', detail: 'Explain the product clearly' },
      { label: 'Conversion', detail: 'Make the next step easy' },
    ],
  },
};
async function setup() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-picture-'));
  const root = path.join(localDir, 'Q3 Demo');
  await mkdir(root);
  // Existing screenshot is only a test fixture, never presented as marketing assets.
  const png = await readFile(path.resolve('artifacts/workspace.png'));
  for (const i of [1, 2, 3]) await writeFile(path.join(root, `image-${i}.png`), png);
  // This suite preserves legacy picture-deck/source validation independently of semantic interpretation.
  const c = new ComputerController(
    {
      ...config(),
      host: '127.0.0.1',
      localDir,
      hfToken: 'test',
      cloudUrl: '',
    },
    { semanticPresentation: false },
  );
  controllers.push(c);
  await c.init();
  vi.spyOn(c as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(c as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  return { c, root, localDir };
}
function mockModels(edited = deck, initial = deck, plannerReply?: (request: string) => string) {
  const requests: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      const content = body.messages[1].content;
      const payload = Array.isArray(content)
        ? {
            description: `A dashboard screenshot for image ${content[0].text.match(/image (\d)/)[1]}`,
          }
        : plannerReply && body.messages[0].content.includes('computer tool planner')
          ? { action: null, clarification: plannerReply(JSON.parse(content).request) }
          : JSON.parse(content).previous
            ? edited
            : initial;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  return requests;
}
it('asks for a real image folder, then embeds all three images and editable diagram shapes with source notes', async () => {
  const { c, root } = await setup();
  const requests = mockModels();
  const ask = await c.request(
    'Hey Insight, I need a PowerPoint for shareholders using three images in my folder and a final diagram. Save only.',
    signal(),
  );
  expect(ask.clarification).toBe(true);
  expect(ask.summary).toContain('What is the folder called');
  expect(requests).toHaveLength(0);
  await writeFile(
    path.join(root, 'brief.txt'),
    'Fictional test company. Proposed campaign: improve onboarding.',
  );
  const result = await c.request(root, signal());
  expect(result.tool).toBe('presentationHelp');
  expect(result.state.presentation?.project).toMatchObject({
    revision: 1,
    folder: 'Q3 Demo',
    assets: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });
  expect(result.state.presentation?.opened).toBe(false);
  expect(requests).toHaveLength(4);
  expect(requests[3].messages[0].content).toContain('UNTRUSTED DATA');
  expect(JSON.parse(requests[3].messages[1].content).brief).toContain('Fictional test company');
  const zip = await JSZip.loadAsync((await c.presentationExport()).bytes);
  expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(
    5,
  );
  expect(Object.keys(zip.files).filter((n) => /^ppt\/media\/image/.test(n))).toHaveLength(3);
  const final = await zip.file('ppt/slides/slide5.xml').async('string');
  expect(final).toContain('Awareness');
  expect(final).toContain('Conversion');
  expect(final).not.toContain('<p:pic>');
  expect((final.match(/<a:tailEnd type="triangle"/g) ?? []).length).toBe(2);
  const slide2 = await zip.file('ppt/slides/slide2.xml').async('string');
  expect(slide2).toContain('descr="image-1.png. AI-generated description');
  expect(await zip.file('ppt/notesSlides/notesSlide2.xml').async('string')).toContain('SHA-256');
  expect(spokenComputerReply(result)).toContain('five slides');
});

it('retains the topic across folder selection and proceeds when the user repeats the creation request', async () => {
  const { c, root } = await setup();
  const calls = mockModels();
  const asked = await c.request(
    'I want a PowerPoint about hackathons using the image in my folder.',
    signal(),
  );
  expect(asked.clarification).toBe(true);
  const selected = await c.request(`Open folder "${root}"`, signal());
  expect(selected.desktopIntent).toMatchObject({ kind: 'openFolder', path: root });
  expect(selected.summary).not.toContain('What should the presentation be about');
  const style = await c.request('Can you make my PowerPoint using the folder images?', signal());
  expect(style.summary).toContain('How should it look');
  expect(style.state.folder?.name).toBe('Q3 Demo');
  const done = await c.request('Can you make my PowerPoint using the folder images?', signal());
  expect(done.state.presentation?.project?.assets).toHaveLength(3);
  const planning = JSON.parse(calls.at(-1).messages[1].content);
  expect(planning.request).toMatch(/about hackathons/i);
  expect(planning.request).toMatch(/clean blue/i);
});

it('keeps a requested folder name when a failed lookup is refined by Desktop location', async () => {
  const { c } = await setup();
  await expect(
    c.request(
      'Make a PowerPoint about hackathons using the image in my MissingQA74291 folder.',
      signal(),
    ),
  ).rejects.toThrow(/MissingQA74291/);
  await expect(c.request('The folder is on my desktop.', signal())).rejects.toThrow(
    /MissingQA74291/,
  );
});
it('reads a slide, swaps real image references without another model call, revises the native diagram, and restores an earlier deck', async () => {
  const { c, root } = await setup();
  const updated = structuredClone(deck);
  updated.diagram.stages.push({ label: 'Retention', detail: 'Support customers after purchase' });
  const requests = mockModels(updated);
  await c.request(
    `Create a proposed marketing presentation using images from folder "${root}". Save only.`,
    signal(),
  );
  // Full paths in a quoted folder phrase are supported independently of the folder picker.
  const spoken = await c.request('Read slide two', signal());
  expect(spoken.summary).toContain('Source: image-1.png');
  const swap = await c.request('Swap the images on slides two and three', signal());
  expect(swap.state.presentation?.project?.deck.slides.map((s) => s.imageId)).toEqual([2, 1, 3]);
  expect(requests).toHaveLength(4);
  const final = await c.request('Add a retention step to the final diagram', signal());
  expect(final.state.presentation?.project?.deck.diagram.stages.at(-1)?.label).toBe('Retention');
  expect(final.state.presentation?.project?.revision).toBe(3);
  const undo = await c.request('Undo the last slide change', signal());
  expect(undo.state.presentation?.project?.deck.slides.map((s) => s.imageId)).toEqual([2, 1, 3]);
  expect(undo.state.presentation?.project?.deck.diagram.stages).toHaveLength(3);
  const old = c.snapshot().presentation!;
  mockModels({ ...deck, slides: [{ ...deck.slides[0], title: '' }, ...deck.slides.slice(1)] });
  await expect(
    c.request('Change the slide title to a new marketing direction', signal()),
  ).rejects.toThrow('could not finish the slide layout');
  expect(c.snapshot().presentation?.sha256).toBe(old.sha256);
  await writeFile(path.join(root, old.filename), 'tampered');
  await expect(c.presentationExport()).rejects.toThrow('edited outside Insight');
});
it('finds a named local folder and asks for clarification when names are ambiguous', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'insight-find-'));
  const a = path.join(root, 'one'),
    b = path.join(root, 'two');
  await mkdir(path.join(a, 'Q3 Demo'), { recursive: true });
  await mkdir(path.join(b, 'Q3 Demo'), { recursive: true });
  expect(await findPresentationFolder('Q3 Demo', undefined, [a])).toBe(
    await import('node:fs/promises').then((fs) => fs.realpath(path.join(a, 'Q3 Demo'))),
  );
  expect(await findPresentationFolder('Q three demo', undefined, [a])).toBe(
    await import('node:fs/promises').then((fs) => fs.realpath(path.join(a, 'Q3 Demo'))),
  );
  await expect(findPresentationFolder('Q3 Demo', undefined, [a, b])).rejects.toThrow(
    'more than one',
  );
  expect(spokenFolderName('Use the three images in my Q3 Demo folder')).toBe('Q3 Demo');
  expect(isPictureDeckRequest('Create a PowerPoint using the three images in my folder')).toBe(
    true,
  );
  expect(isPictureDeckRequest('Create a PowerPoint about George Washington')).toBe(false);
  expect(
    pictureDeckSchema.safeParse({
      ...deck,
      slides: [deck.slides[0], deck.slides[0], deck.slides[0]],
    }).success,
  ).toBe(false);
});

it('preserves swapped images and diagram across a local theme change and its undo', async () => {
  const { c, root } = await setup();
  const calls = mockModels();
  await c.request(`Create a presentation using images from folder "${root}". Save only.`, signal());
  const swapped = await c.request('Swap the images on slides two and three', signal());
  const before = structuredClone(swapped.state.presentation!.project!.deck);
  const changed = await c.request('Change the presentation theme to dark. Save only.', signal());
  expect(changed.state.presentation?.project?.deck).toEqual({ ...before, theme: 'dark' });
  expect(changed.state.presentation?.project?.revision).toBe(3);
  expect(calls).toHaveLength(4);
  const restored = await c.request('Undo the last slide change. Save only.', signal());
  expect(restored.state.presentation?.project?.deck).toEqual(before);
  expect(restored.state.presentation?.project?.revision).toBe(4);
  expect(calls).toHaveLength(4);
});
it('rejects unprovided screenshot amounts and allows explicitly supplied business values', async () => {
  const bad = structuredClone(deck);
  bad.slides[0].points[0] = 'Revenue reached $134,000 with 52.2% growth';
  expect(unsupportedDeckValues(bad, 'A marketing plan for Q3')).toEqual(['$134,000', '52.2%']);
  expect(unsupportedDeckValues(bad, 'Revenue reached $134000 with 52.2% growth')).toEqual([]);
  const { c, root } = await setup();
  mockModels(bad, bad);
  await expect(
    c.request(
      `Create a marketing presentation using images from folder "${root}". Save only.`,
      signal(),
    ),
  ).rejects.toThrow('Unsupported factual values');
  expect(c.snapshot().presentation).toBeFalsy();
});
it('retries a failed image inspection once and refuses to create a deck if vision stays unavailable', async () => {
  const { c, root } = await setup();
  let inspections = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      inspections++;
      return new Response('{}', { status: 503 });
    }),
  );
  await expect(
    c.request(
      `Create a marketing presentation with three images from folder "${root}". Save only.`,
      signal(),
    ),
  ).rejects.toThrow('could not inspect the pictures');
  expect(inspections).toBe(6);
  expect(c.snapshot().presentation).toBeFalsy();
  expect(
    (await import('node:fs/promises').then((fs) => fs.readdir(root))).some((n) =>
      n.endsWith('.pptx'),
    ),
  ).toBe(false);
});
it('returns an actionable folder error through the authenticated local API', async () => {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-picture-api-'));
  const root = path.join(localDir, 'Empty Q3 Folder');
  await mkdir(root);
  const app = await buildApp({
    ...config(),
    localDir,
    host: '127.0.0.1',
    passphrase: '',
    hfToken: '',
    cloudUrl: '',
    neonUrl: '',
  });
  try {
    const session = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
    const cookie = String(session.headers['set-cookie']).split(';')[0];
    const response = await app.inject({
      method: 'POST',
      url: '/api/computer/request',
      headers: { cookie },
      payload: {
        request: `Create a PowerPoint using three images from folder "${root}". Save only.`,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('did not find a PNG or JPG');
  } finally {
    await app.close();
  }
});

it('adds a JPG/PNG follow-up to the existing presentation without restarting design or inference', async () => {
  const { c, root } = await setup();
  await unlink(path.join(root, 'image-2.png'));
  await unlink(path.join(root, 'image-3.png'));
  vi.spyOn(nativeApps, 'openNativeApp').mockResolvedValue({
    app: 'fileExplorer',
    name: 'File Explorer',
    mode: 'launched',
  });
  await c.action({ tool: 'openFolder', name: root }, signal());
  await writePresentation(
    {
      title: 'Q3 Marketing Plan',
      subtitle: 'A proposed next-quarter plan',
      slides: [1, 2, 3].map((i) => ({
        title: `Marketing opportunity ${i}`,
        points: ['Keep the original editable content', 'Measure outcomes before reporting results'],
      })),
    },
    path.join(root, 'existing.pptx'),
  );
  const originalBytes = await readFile(path.join(root, 'existing.pptx'));
  c.state.presentation = {
    filename: 'existing.pptx',
    title: 'Q3 Marketing Plan',
    slideCount: 4,
    slideTitles: ['Q3 Marketing Plan'],
    opened: true,
    sha256: createHash('sha256').update(originalBytes).digest('hex'),
  };
  const oneImage = { ...deck, theme: 'blue' as const, slides: [deck.slides[0]] };
  const requests = mockModels(oneImage, oneImage);
  const design = await c.request('Can you use that image, that JPG?', signal());
  expect(design.summary).toContain('Which slide');
  expect(design.summary).not.toContain('Focused');
  expect(requests).toHaveLength(0);
  const source = await c.request('The last slide', signal());
  expect(source.desktopIntent?.kind).toBe('openFolder');
  if (source.desktopIntent?.kind !== 'openFolder' || !source.desktopIntent.continueRequest)
    throw new Error('Missing image insertion continuation');
  const created = await c.request(source.desktopIntent.continueRequest, signal());
  expect(created.state.presentation?.title).toBe('Q3 Marketing Plan');
  expect(created.state.presentation?.slideCount).toBe(4);
  expect(created.state.presentation?.imageEdits?.at(-1)?.slide).toBe(4);
  expect(requests).toHaveLength(0);
  const zip = await JSZip.loadAsync((await c.presentationExport()).bytes);
  expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(
    4,
  );
  expect(await zip.file('ppt/slides/slide4.xml').async('string')).toContain('4 / 4');
  expect(await readFile(path.join(root, 'existing.pptx'))).toEqual(originalBytes);
});

it('answers unrelated questions while a design is pending, then creates the original presentation after yes', async () => {
  const { c, root } = await setup();
  await unlink(path.join(root, 'image-2.png'));
  await unlink(path.join(root, 'image-3.png'));
  vi.spyOn(nativeApps, 'openNativeApp').mockResolvedValue({
    app: 'fileExplorer',
    name: 'File Explorer',
    mode: 'launched',
  });
  await c.action({ tool: 'openFolder', name: root }, signal());
  const oneImage = { ...deck, theme: 'blue' as const, slides: [deck.slides[0]] };
  const calls = mockModels(oneImage, oneImage, (question) => `Answer to ${question}`);
  const asked = await c.request(
    'Create a PowerPoint about hackathons using the picture in my folder.',
    signal(),
  );
  expect(asked.summary).toContain('How should it look');
  const original = structuredClone((c as any).pendingPictureDesign);
  for (const question of [
    'What would look good for shareholders?',
    'What do you recommend?',
    'Which style would you suggest?',
    'Would you recommend a dark theme?',
  ]) {
    const advice = await c.request(question, signal());
    expect(advice.summary).toContain('clean blue');
    expect((c as any).pendingPictureDesign).toEqual(original);
  }
  expect(calls).toHaveLength(0);
  for (const question of [
    'How many slides will you make?',
    'Which model helps you design my slides?',
    'What can you do with my computer?',
    'What are our sponsor products?',
  ]) {
    const answer = await c.request(question, signal());
    expect(answer.summary).toBe(`Answer to ${question}`);
    expect(answer.summary).not.toContain('clean blue');
    expect((c as any).pendingPictureDesign).toEqual(original);
    expect(answer.state.presentation).toBeFalsy();
  }
  const capabilities = await c.request('What can you do?', signal());
  expect(capabilities.summary).toContain('open apps');
  expect((c as any).pendingPictureDesign).toEqual(original);
  const done = await c.request('Yes', signal());
  expect(done.state.presentation?.project?.assets).toHaveLength(1);
  expect(done.state.presentation?.slideCount).toBe(3);
  const planning = JSON.parse(calls.at(-1).messages[1].content);
  expect(planning.request).toMatch(/about hackathons/i);
  expect(planning.request).toMatch(/clean blue/i);
});

it('switches away from a pending folder question when asked to use the screen', async () => {
  const { c } = await setup();
  const question = await c.request('Open my folder', signal());
  expect(question.clarification).toBe(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: { tool: 'describeScreen' },
                    clarification: null,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  );
  const screen = await c.request('And use my screen.', signal());
  expect(screen.desktopIntent).toEqual({ kind: 'describe' });
  expect(screen.summary).not.toContain('could not find');
  expect((c as any).conversation.at(-1).request).toBe('And use my screen.');
});
