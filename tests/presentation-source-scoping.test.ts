import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import * as interpreter from '../server/computer/presentation-intent';
import * as planning from '../server/computer/presentation-deck';
import * as sources from '../server/computer/presentation-project';
import { mergePresentationDraft, type PresentationIntentContext, type PresentationTurnIntent } from '../shared/presentation-intent';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import type { ComputerResult } from '../shared/computer';

const JSZip = createRequire(import.meta.url)('jszip');
const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const turn = (partial: Partial<PresentationTurnIntent>): PresentationTurnIntent => ({
  kind: 'request', domain: 'presentation', startsNewTask: false, awaitingContinuation: false,
  fields: { open: false }, operations: [], ...partial,
});

async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-source-scope-'));
  const definitions = [
    { name: 'Marketing', location: 'desktop', directory: 'Desktop', file: 'first.png', color: '#245CCD' },
    { name: 'Brand', location: 'documents', directory: 'Documents', file: 'second.png', color: '#DF742F' },
    { name: 'Marketing', location: 'downloads', directory: 'Downloads', file: 'third.png', color: '#279D79' },
  ];
  const folders = await Promise.all(definitions.map(async (definition) => {
    const root = path.join(localDir, definition.directory, definition.name);
    await mkdir(root, { recursive: true });
    const canvas = createCanvas(240, 150);
    const context = canvas.getContext('2d');
    context.fillStyle = definition.color;
    context.fillRect(0, 0, 240, 150);
    const bytes = canvas.toBuffer('image/png');
    await writeFile(path.join(root, definition.file), bytes);
    return { ...definition, root, bytes };
  }));
  const folderLookups: string[] = [];
  vi.spyOn(sources, 'findPresentationFolder').mockImplementation(async (name, _selected, _roots, location) => {
    const folder = folders.find((folder) => name === folder.root || (name.toLowerCase() === folder.name.toLowerCase() && location === folder.location));
    if (!folder) throw new Error(`Unexpected synthetic source lookup: ${name}, ${location}`);
    folderLookups.push(folder.root);
    return folder.root;
  });
  const contexts: PresentationIntentContext[] = [];
  const intents: PresentationTurnIntent[] = [];
  vi.spyOn(interpreter, 'interpretPresentationTurn').mockImplementation(async (_text, context) => {
    contexts.push(structuredClone(context));
    const intent = intents.shift();
    if (!intent) throw new Error('No synthetic intent queued');
    return structuredClone(intent);
  });
  const initial: OrderedPresentationDeck = {
    schemaVersion: 2, title: 'Campaign', theme: 'blue', textScale: 1, allowImageReuse: false,
    slides: [
      { id: 'cover', type: 'cover', title: 'Campaign', subtitle: 'Proposed campaign' },
      { id: 'audience', type: 'text', title: 'Audience', points: ['Describe the audience.'] },
      { id: 'message', type: 'text', title: 'Message', points: ['Prepare the proposed message.'] },
    ],
  };
  vi.spyOn(planning, 'planOrderedDeck').mockResolvedValue(initial);
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (!Array.isArray(body.messages[1].content)) throw new Error('Unexpected language model call');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ description: 'Synthetic source image.' }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const controller = new ComputerController({ ...config(), localDir, host: '127.0.0.1', hfToken: 'test-no-network', neonUrl: '', cloudUrl: '', dbToken: '' });
  controllers.push(controller);
  await controller.init();
  const output = path.join(localDir, 'Output');
  await mkdir(output);
  await controller.authorizeFolder(output, await readFile(path.join(localDir, 'desktop-bridge-key'), 'utf8'));
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  const request = async (intent: PresentationTurnIntent) => {
    intents.push(intent);
    return controller.request('Synthetic structured task', signal());
  };
  await request(turn({ startsNewTask: true, fields: { topic: 'Campaign', totalSlides: 3, open: false }, operations: [{ type: 'create' }] }));
  return { controller, folders, folderLookups, contexts, request };
}

async function pictureOnSlide(bytes: Buffer, slide: number): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file(`ppt/slides/slide${slide}.xml`).async('string');
  const relationshipId = xml.match(/<a:blip[^>]+r:embed="([^"]+)"/)?.[1];
  const rels = await zip.file(`ppt/slides/_rels/slide${slide}.xml.rels`).async('string');
  const relationship = (rels.match(/<Relationship\s[^>]+\/>/g) as string[]).find((entry) => entry.includes(`Id="${relationshipId}"`));
  const target = relationship?.match(/Target="([^"]+)"/)?.[1];
  expect(target).toBeTruthy();
  return zip.file(path.posix.normalize(`ppt/slides/${target}`)).async('nodebuffer');
}

describe('source scope and ordered execution invariants', () => {
  it('inserts distinct real source bytes for each explicit folder and location in one plan', async () => {
    const qa = await fixture();
    const result = await qa.request(turn({
      fields: { open: false, folderName: 'Marketing', folderLocation: 'desktop', sourceImage: 'first.png' },
      operations: [
        { type: 'insert_image', target: 1 },
        { type: 'insert_image', target: 2, folderName: 'Brand', folderLocation: 'documents' },
        { type: 'insert_image', target: 3, folderName: 'Marketing', folderLocation: 'downloads' },
      ],
    }));
    expect(result.state.presentation?.project?.revision).toBe(4);
    expect(qa.folderLookups).toEqual(qa.folders.map((folder) => folder.root));
    const exported = await qa.controller.presentationExport();
    for (const [index, folder] of qa.folders.entries()) {
      expect(await pictureOnSlide(exported.bytes, index + 1)).toEqual(folder.bytes);
      expect(await readFile(path.join(folder.root, folder.file))).toEqual(folder.bytes);
    }
  });

  it('keeps explicit folder opening steps independent across native continuations', async () => {
    const qa = await fixture();
    let result: ComputerResult = await qa.request(turn({
      fields: { folderName: 'Marketing', folderLocation: 'desktop', folderPath: qa.folders[0].root },
      operations: [
        { type: 'open_folder' },
        { type: 'open_folder', folderName: 'Brand', folderLocation: 'documents' },
        { type: 'open_folder', folderName: 'Marketing', folderLocation: 'downloads' },
      ],
    }));
    const opened: string[] = [];
    for (let count = 0; count < 3; count++) {
      expect(result.desktopIntent?.kind).toBe('openFolder');
      if (result.desktopIntent?.kind !== 'openFolder' || !result.desktopIntent.path) throw new Error('Missing folder action');
      opened.push(result.desktopIntent.path);
      if (!result.desktopIntent.continueRequest) break;
      result = await qa.controller.request(result.desktopIntent.continueRequest, signal());
    }
    expect(opened).toEqual(qa.folders.map((folder) => folder.root));
  });

  it('preserves every same-target step inside an incoming plan while correcting a pending step once', () => {
    const sequence = [
      { type: 'revise_slide' as const, target: 2, instruction: 'Shorten the wording.' },
      { type: 'revise_slide' as const, target: 2, instruction: 'Use the title Proposed campaign.' },
    ];
    const pending = mergePresentationDraft(null, turn({ operations: sequence }), 'Synthetic ordered plan', { id: 'plan', generation: 1 });
    expect(pending?.operations).toEqual(sequence);
    expect(mergePresentationDraft(null, turn({ kind: 'correction', operations: sequence }), 'Synthetic compound correction', { id: 'new', generation: 1 })?.operations).toEqual(sequence);
    const replacement = [{ ...sequence[0], target: 3 }];
    const corrected = mergePresentationDraft(pending, turn({ kind: 'correction', operations: replacement }), 'Correction', { id: 'unused', generation: 2 });
    expect(corrected?.operations).toEqual([replacement[0], sequence[1]]);
  });

  it('retains a failed edit as latest evidence after older successful navigation and accepts a fresh retry', async () => {
    const qa = await fixture();
    const filename = qa.controller.snapshot().presentation!.filename;
    const identity = qa.controller.presentationSelectionIdentity();
    qa.controller.recordSelectedSlide(filename, 2, identity);
    vi.spyOn(planning, 'reviseOrderedSlide').mockRejectedValue(new sources.PresentationProjectError('The slide could not be revised. Your deck is unchanged.'));
    await expect(qa.request(turn({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Shorten the wording.' }] }))).rejects.toThrow('could not be revised');
    await qa.request(turn({ kind: 'question', reply: 'That edit failed. The previous presentation is still saved.' }));
    expect(qa.contexts.at(-1)?.lastVerifiedResult?.summary).toMatch(/requested operation failed.*could not be revised/i);
    expect(qa.contexts.at(-1)?.lastVerifiedResult?.summary).not.toContain('PowerPoint verified');
    qa.controller.recordSelectedSlide(filename, 2, identity);
    await qa.request(turn({ kind: 'question', reply: 'PowerPoint verified slide two.' }));
    expect(qa.contexts.at(-1)?.lastVerifiedResult).toMatchObject({ navigation: { verified: true, slide: 2 } });
    qa.controller.recordPresentationNavigationFailure(filename, 'PowerPoint is busy.', 'last', identity);
    await qa.request(turn({ kind: 'question', reply: 'Selection was not confirmed.' }));
    expect(qa.contexts.at(-1)?.lastVerifiedResult).toMatchObject({ navigation: { verified: false, requestedSlide: 'last' } });
    expect(qa.contexts.at(-1)?.lastVerifiedResult?.navigation?.slide).toBeUndefined();
  });
});
