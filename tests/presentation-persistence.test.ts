import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { config, type Config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import type { PictureDeck } from '../shared/presentation-project';
import { restoreDeckSources } from '../server/computer/presentation-project';
import type { PresentationSourceRef } from '../shared/presentation-session';
import { PresentationStore } from '../server/providers/presentationStore';

const JSZip = createRequire(import.meta.url)('jszip');
const controllers: ComputerController[] = [];
const directories: string[] = [];
const signal = () => new AbortController().signal;
const initialDeck: PictureDeck = {
  title: 'A Hackathon Guide',
  subtitle: 'A proposed guide for students creating their first project',
  theme: 'dark',
  slides: [1, 2, 3].map((imageId) => ({
    title: `Project step ${imageId}`,
    imageId,
    points: ['Choose a useful problem', 'Create and demonstrate a working solution'],
  })),
  diagram: {
    title: 'From idea to demonstration',
    stages: [
      { label: 'Discover', detail: 'Choose a problem with a real user' },
      { label: 'Build', detail: 'Create a focused prototype' },
      { label: 'Demonstrate', detail: 'Show the result clearly' },
    ],
  },
};

afterEach(async () => {
  for (const computer of controllers.splice(0)) await computer.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    expect(path.relative(tmpdir(), directory)).not.toMatch(/^\.\./);
    await rm(directory, { recursive: true, force: true });
  }
});

async function newComputer(cfg: Config) {
  // Isolate the v1 persisted-project contract through the legacy compatibility entry point.
  const computer = new ComputerController(cfg, { semanticPresentation: false });
  controllers.push(computer);
  await computer.init();
  vi.spyOn(computer as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(computer as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  return computer;
}
async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-persistence-'));
  directories.push(localDir);
  const root = path.join(localDir, 'Marketing');
  await mkdir(root);
  const originals: Buffer[] = [];
  for (const [index, color] of ['#1464dd', '#ee8b24', '#9b37c9'].entries()) {
    const canvas = createCanvas(64, 48);
    canvas.getContext('2d').fillStyle = color;
    canvas.getContext('2d').fillRect(0, 0, 64, 48);
    const bytes = canvas.toBuffer('image/png');
    originals.push(bytes);
    await writeFile(path.join(root, `picture-${index + 1}.png`), bytes);
  }
  await writeFile(
    path.join(root, 'brief.txt'),
    'A fictional student project. This deck explains how to build and demonstrate a hackathon prototype.',
  );
  const cfg = {
    ...config(),
    localDir,
    host: '127.0.0.1',
    hfToken: 'test-inference-key',
    cloudUrl: '',
    cloudPassphrase: '',
    neonUrl: '',
  };
  const computer = await newComputer(cfg);
  return { computer, root, cfg, originals };
}
function models() {
  const revised = structuredClone(initialDeck);
  revised.diagram.stages.push({
    label: 'Reflect',
    detail: 'Use feedback to decide what to improve',
  });
  const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const content = body.messages[1].content;
    const response = Array.isArray(content)
      ? {
          description: `A colored illustration for picture ${content[0].text.match(/image (\d)/)[1]}`,
        }
      : JSON.parse(content).previous
        ? revised
        : initialDeck;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
async function create(computer: ComputerController, root: string) {
  return computer.request(
    `Create a dark PowerPoint about hackathons using the pictures from folder "${root}". Save only.`,
    signal(),
  );
}
const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sourceRefs = (originals: Buffer[]): PresentationSourceRef[] =>
  originals.map((bytes, index) => ({
    id: index + 1,
    filename: `picture-${index + 1}.png`,
    description: `A saved colored illustration for image ${index + 1}`,
    sha256: checksum(bytes),
    width: 64,
    height: 48,
  }));
async function imageChecksums(bytes: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const images: string[] = Object.keys(zip.files).filter((name) =>
    /^ppt\/media\/image.*\.(?:png|jpeg|jpg)$/i.test(name),
  );
  return Promise.all(
    images.map(async (name) => checksum(await zip.file(name).async('nodebuffer'))),
  );
}

it('resumes the saved image deck after a restart with its exact pictures and reversible edits', async () => {
  const { computer, root, cfg, originals } = await fixture();
  const fetchMock = models();
  await create(computer, root);
  await computer.request('Swap the images on slides two and three', signal());
  await computer.request('Add a reflect step to the final diagram', signal());
  const beforeSave = computer.snapshot().presentation!;
  expect(beforeSave.project?.revision).toBe(3);
  expect(beforeSave.project?.deck.slides.map((slide) => slide.imageId)).toEqual([2, 1, 3]);
  const saved = await computer.request('Save my presentation', signal());
  expect(saved.summary).toMatch(/saved/i);
  const callsAfterSave = fetchMock.mock.calls.length;
  await computer.close();
  const restored = await newComputer(cfg);
  const resumed = await restored.request('Resume my last presentation. Save only.', signal());
  expect(resumed.state.presentation?.project?.deck).toEqual(beforeSave.project?.deck);
  expect(resumed.state.presentation?.project?.revision).toBe(3);
  expect(resumed.state.presentation?.project?.assets).toEqual(beforeSave.project?.assets);
  expect(resumed.state.presentation?.opened).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(callsAfterSave);
  const embedded = await imageChecksums((await restored.presentationExport()).bytes);
  expect(embedded.sort()).toEqual(originals.map(checksum).sort());
  const readback = await restored.request('Read the last slide diagram', signal());
  expect(readback.summary).toMatch(/reflect/i);
  const undo = await restored.request('Undo the last slide change', signal());
  expect(undo.state.presentation?.project?.revision).toBe(4);
  expect(undo.state.presentation?.project?.deck.slides.map((slide) => slide.imageId)).toEqual([
    2, 1, 3,
  ]);
  expect(undo.state.presentation?.project?.deck.diagram.stages.map((stage) => stage.label)).toEqual(
    ['Discover', 'Build', 'Demonstrate'],
  );
  expect(undo.state.presentation?.project?.deck.theme).toBe('dark');
  expect(fetchMock).toHaveBeenCalledTimes(callsAfterSave);
});

it('lists saved presentation titles by voice and does not call a model for persistence', async () => {
  const { computer, root, cfg } = await fixture();
  const fetchMock = models();
  await create(computer, root);
  await computer.request('Save my presentation', signal());
  const calls = fetchMock.mock.calls.length;
  const fresh = await newComputer(cfg);
  const listed = await fresh.request('List my saved presentations', signal());
  expect(listed.summary).toContain(initialDeck.title);
  expect(listed.summary.length).toBeLessThan(3000);
  const savedProjects = await fresh.savedPresentations(signal());
  expect(savedProjects.projects.length).toBeGreaterThan(0);
  expect(savedProjects.projects.length).toBeLessThanOrEqual(20);
  expect(savedProjects.projects[0]).toMatchObject({ title: initialDeck.title });
  const resumed = await fresh.resumePresentation(savedProjects.projects[0].id, signal(), {
    open: false,
  });
  expect(resumed.state.presentation?.title).toBe(initialDeck.title);
  expect(resumed.state.presentation?.opened).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});

it('rejects source-image drift before replacing a working deck or reading changed images with AI', async () => {
  const { computer, root, cfg, originals } = await fixture();
  const fetchMock = models();
  await create(computer, root);
  await computer.request('Save my presentation', signal());
  const fresh = await newComputer(cfg);
  await create(fresh, root);
  const current = fresh.snapshot();
  const calls = fetchMock.mock.calls.length;
  // Both files are valid PNGs; a successful decoder must not hide content drift.
  await writeFile(path.join(root, 'picture-1.png'), originals[1]);
  await expect(fresh.request('Resume my last presentation. Save only.', signal())).rejects.toThrow(
    /source|picture|image|changed/i,
  );
  expect(fresh.snapshot()).toEqual(current);
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});

it('rejects canceled persistence operations without replacing the active deck', async () => {
  const { computer, root } = await fixture();
  const fetchMock = models();
  await create(computer, root);
  await computer.request('Save my presentation', signal());
  const current = computer.snapshot();
  const calls = fetchMock.mock.calls.length;
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    computer.request('Resume my last presentation. Save only.', canceled.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(computer.request('Save my presentation', canceled.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(computer.snapshot()).toEqual(current);
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});

it('propagates an interruption during a pending project load without writing a new deck or replacing state', async () => {
  const { computer, root } = await fixture();
  const fetchMock = models();
  await create(computer, root);
  await computer.request('Save my presentation', signal());
  const saved = await computer.savedPresentations(signal());
  const current = computer.snapshot(),
    files = await readdir(root),
    calls = fetchMock.mock.calls.length;
  let started!: () => void;
  const loading = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.spyOn(PresentationStore.prototype, 'load').mockImplementation(
    (_id, loadSignal) =>
      new Promise<never>((_resolve, reject) => {
        started();
        loadSignal.addEventListener(
          'abort',
          () => reject(new DOMException('Interrupted', 'AbortError')),
          { once: true },
        );
      }),
  );
  const parent = new AbortController();
  const pending = computer.resumePresentation(saved.projects[0].id, parent.signal, { open: false });
  await loading;
  parent.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(computer.snapshot()).toEqual(current);
  expect(await readdir(root)).toEqual(files);
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});

it('rejects hosted presentation persistence before reading sources or opening desktop applications', async () => {
  const { cfg } = await fixture();
  const fetchMock = models();
  const hosted = await newComputer({ ...cfg, host: '0.0.0.0' });
  await expect(hosted.request('Resume my last presentation. Save only.', signal())).rejects.toThrow(
    /local desktop/i,
  );
  await expect(hosted.request('Save my presentation', signal())).rejects.toThrow(/local desktop/i);
  await expect(hosted.savedPresentations(signal())).rejects.toThrow(/local desktop/i);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('restores exact saved source IDs, captions and brief hashes while ignoring newly added pictures without inference', async () => {
  const { root, originals } = await fixture();
  const fetchMock = vi.fn(() => {
    throw new Error('Restore must not call a model.');
  });
  vi.stubGlobal('fetch', fetchMock);
  const refs = sourceRefs(originals);
  const briefRef = {
    filename: 'brief.txt',
    sha256: checksum(await readFile(path.join(root, 'brief.txt'))),
  };
  await writeFile(path.join(root, 'picture-0.png'), originals[0]);
  const restored = await restoreDeckSources(root, [refs[2], refs[0], refs[1]], briefRef, signal());
  expect(restored.assets.map((asset) => asset.id)).toEqual([3, 1, 2]);
  expect(restored.assets.map((asset) => asset.description)).toEqual(
    [refs[2], refs[0], refs[1]].map((ref) => ref.description),
  );
  for (const asset of restored.assets)
    expect(checksum(Buffer.from(asset.data.split(',')[1], 'base64'))).toBe(
      refs.find((ref) => ref.id === asset.id)!.sha256,
    );
  expect(restored.briefSha256).toBe(briefRef.sha256);
  expect(restored.brief).toContain('hackathon prototype');
  await writeFile(path.join(root, 'brief.txt'), 'Changed brief with different instructions.');
  await expect(restoreDeckSources(root, refs, briefRef, signal())).rejects.toThrow(
    /brief changed/i,
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects malformed source references, changed dimensions and canceled restores before trusting disk content', async () => {
  const { root, originals } = await fixture();
  const refs = sourceRefs(originals);
  await expect(
    restoreDeckSources(root, [{ ...refs[0], filename: '..\\picture-1.png' }], undefined, signal()),
  ).rejects.toThrow(/source references/i);
  await expect(restoreDeckSources(root, [refs[0], refs[0]], undefined, signal())).rejects.toThrow(
    /source references/i,
  );
  await expect(
    restoreDeckSources(root, [{ ...refs[0], width: 65 }], undefined, signal()),
  ).rejects.toThrow(/dimensions/i);
  const canceled = new AbortController();
  canceled.abort();
  await expect(restoreDeckSources(root, refs, undefined, canceled.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
