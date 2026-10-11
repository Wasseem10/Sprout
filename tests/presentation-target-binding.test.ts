import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { ComputerController } from '../server/computer/controller';
import { config } from '../server/config';
import * as interpretation from '../server/computer/presentation-intent';
import * as planning from '../server/computer/presentation-deck';
import * as sources from '../server/computer/presentation-project';
import * as nativeApps from '../server/computer/native-apps';
import type { ComputerResult } from '../shared/computer';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationIntentContext, PresentationTurnIntent } from '../shared/presentation-intent';

const JSZip = createRequire(import.meta.url)('jszip');
const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const turn = (values: Partial<PresentationTurnIntent>): PresentationTurnIntent => ({
  kind: 'request', domain: 'presentation', startsNewTask: false, awaitingContinuation: false,
  fields: { open: false }, operations: [], ...values,
});
const currentDeck = (controller: ComputerController) => structuredClone(controller.snapshot().presentation!.project!.orderedDeck!);

async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-target-binding-'));
  const folder = path.join(localDir, 'Desktop', 'Marketing');
  await mkdir(folder, { recursive: true });
  const canvas = createCanvas(240, 150);
  const context = canvas.getContext('2d');
  context.fillStyle = '#245ccd'; context.fillRect(0, 0, 240, 150);
  const image = canvas.toBuffer('image/png');
  await writeFile(path.join(folder, 'campaign.png'), image);
  const initial: OrderedPresentationDeck = {
    schemaVersion: 2, title: 'Community campaign', theme: 'blue', textScale: 1, allowImageReuse: false,
    slides: [
      { id: 'cover', type: 'cover', title: 'Community campaign', subtitle: 'A proposed accessible campaign for the community' },
      { id: 'audience', type: 'text', title: 'Audience needs', points: ['Ask community members which needs matter to them.', 'Keep the approved audience description with the campaign brief.'] },
      { id: 'message', type: 'text', title: 'Campaign message', points: ['Explain the proposed offer in familiar language.', 'Check each claim against the supplied campaign material.'] },
      { id: 'review', type: 'text', title: 'Review process', points: ['Ask the campaign owner to review the material.', 'Check links and accessibility before sharing the final draft.'] },
    ],
  };
  const contexts: PresentationIntentContext[] = [];
  const intents: PresentationTurnIntent[] = [];
  vi.spyOn(interpretation, 'interpretPresentationTurn').mockImplementation(async (_text, context) => {
    contexts.push(structuredClone(context));
    const value = intents.shift();
    if (!value) throw new Error('Missing synthetic semantic intent');
    return structuredClone(value);
  });
  vi.spyOn(planning, 'planOrderedDeck').mockImplementation(async (fields) => ({
    ...structuredClone(initial), title: fields.topic!, slides: initial.slides.map((slide, index) => index ? structuredClone(slide) : { ...slide, title: fields.topic! }),
  }));
  const revise = vi.spyOn(planning, 'reviseOrderedSlide').mockImplementation(async (deck, id) => ({
    ...structuredClone(deck), slides: deck.slides.map((slide) => slide.id === id && slide.type === 'text'
      ? { ...slide, points: ['Review the proposed audience needs with community members.'] }
      : structuredClone(slide)),
  }));
  vi.spyOn(sources, 'findPresentationFolder').mockImplementation(async (name) => {
    if (name !== folder && name.toLowerCase() !== 'marketing') throw new Error('Unexpected fixture folder');
    return folder;
  });
  vi.spyOn(nativeApps, 'openNativeApp').mockResolvedValue({ app: 'fileExplorer', name: 'File Explorer', mode: 'launched' });
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (!Array.isArray(body.messages[1].content)) throw new Error('Unexpected provider call outside the mocked semantic/planning seams');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ description: 'A synthetic blue campaign picture.' }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const controller = new ComputerController({ ...config(), localDir, owner: 'target-binding-test', host: '127.0.0.1', hfToken: 'test-no-network', cloudUrl: '', neonUrl: '', dbToken: '' });
  controllers.push(controller);
  await controller.init();
  vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (_input: unknown, promote: any) => {
    await promote();
    return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  let sequence = 0;
  const request = async (intent: PresentationTurnIntent) => {
    intents.push(intent);
    return controller.request(`Synthetic presentation task ${++sequence}`, signal());
  };
  const create = async (topic = 'Community campaign') => request(turn({ startsNewTask: true, fields: { topic, totalSlides: 4, open: false }, operations: [{ type: 'create' }] }));
  await create();
  return { controller, request, create, contexts, folder, image, revise };
}

function continuation(result: ComputerResult) {
  expect(result.desktopIntent?.kind).toBe('openFolder');
  const action = result.desktopIntent;
  if (!action || action.kind !== 'openFolder' || !action.continueRequest) throw new Error('Expected a native folder continuation');
  return action.continueRequest;
}

async function exported(controller: ComputerController) {
  const result = await controller.presentationExport();
  const zip = await JSZip.loadAsync(result.bytes);
  const xml: string[] = [];
  for (let slide = 1; slide <= controller.snapshot().presentation!.slideCount; slide++) xml.push(await zip.file(`ppt/slides/slide${slide}.xml`).async('string'));
  const images: Buffer[] = await Promise.all(Object.keys(zip.files).filter((file) => file.startsWith('ppt/media/') && !zip.files[file].dir).map((file) => zip.file(file).async('nodebuffer')));
  return { ...result, xml, images };
}

describe('stable presentation target binding through interaction', () => {
  it.each([2, 'current'] as const)('keeps target %s through folder opening while verified selection changes', async (target) => {
    const qa = await fixture();
    const before = await exported(qa.controller);
    const identity = qa.controller.presentationSelectionIdentity();
    const filename = qa.controller.snapshot().presentation!.filename;
    qa.controller.recordSelectedSlide(filename, 2, identity);
    const pending = await qa.request(turn({ fields: { folderPath: qa.folder, open: true }, operations: [{ type: 'insert_image', target }] }));
    const token = continuation(pending);
    qa.controller.recordSelectedSlide(filename, 3, identity);
    await qa.request(turn({ kind: 'question', reply: 'The picture request is waiting for the folder.' }));
    expect(qa.contexts.at(-1)).toMatchObject({
      lastRequestedTarget: {
        projectId: identity!.projectId, slideId: 'audience', index: 2,
        title: 'Audience needs', operationType: 'insert_image',
      },
      activePresentation: { verifiedSelectedSlide: 3 },
    });
    await qa.controller.request(token, signal());
    expect(currentDeck(qa.controller).slides[1]).toMatchObject({ id: 'audience', type: 'image', imageId: 1 });
    expect(currentDeck(qa.controller).slides[2]).toMatchObject({ id: 'message', type: 'text' });
    const after = await exported(qa.controller);
    expect(after.xml[1]).not.toBe(before.xml[1]);
    expect(after.xml.filter((_, index) => index !== 1)).toEqual(before.xml.filter((_, index) => index !== 1));
    expect(after.images.some((bytes) => bytes.equals(qa.image))).toBe(true);
  });

  it('passes explicit numeric limits with the stable target and no interpreter word-count estimate', async () => {
    const qa = await fixture();
    await qa.request(turn({ operations: [{ type: 'read_slide', target: 2 }] }));
    await qa.request(turn({ operations: [{ type: 'move_slide', target: 4, before: 2 }] }));
    await qa.request(turn({ operations: [{ type: 'revise_slide', target: 'current', instruction: 'Shorten by 25 percent to at most 40 words.', detailChange: 'shorten', maximumWords: 40, reductionPercent: 25, lengthConstraintQuote: 'by 25 percent to at most 40 words' }] }));
    expect(qa.revise.mock.calls.at(-1)?.[1]).toBe('audience');
    expect(qa.revise.mock.calls.at(-1)?.[6]).toEqual({ processEdit: undefined, detailChange: 'shorten', maximumWords: 40, reductionPercent: 25 });
  });

  it('keeps the reviewed slide as the follow-up target after its position changes', async () => {
    const qa = await fixture();
    const read = await qa.request(turn({ operations: [{ type: 'read_slide', target: 2 }] }));
    expect(read.summary).toContain('Audience needs');
    await qa.request(turn({ operations: [{ type: 'move_slide', target: 4, before: 2 }] }));
    expect(currentDeck(qa.controller).slides.map((slide) => slide.id)).toEqual(['cover', 'review', 'audience', 'message']);
    const before = await exported(qa.controller);
    const reread = await qa.request(turn({ operations: [{ type: 'read_slide', target: 'current' }] }));
    expect(reread.summary).toContain('Slide 3');
    expect(reread.summary).toContain('Audience needs');
    await qa.request(turn({ operations: [{ type: 'revise_slide', target: 'current', instruction: 'Shorten the reviewed explanation.', detailChange: 'shorten' }] }));
    const after = await exported(qa.controller);
    expect(qa.revise.mock.calls.at(-1)?.[1]).toBe('audience');
    expect(after.xml[2]).not.toBe(before.xml[2]);
    expect(after.xml.filter((_, index) => index !== 2)).toEqual(before.xml.filter((_, index) => index !== 2));
  });

  it.each([3, 2])('edits the queued navigation target only when PowerPoint verifies it (reported slide %s)', async (reportedSlide) => {
    const qa = await fixture();
    await qa.request(turn({ operations: [{ type: 'read_slide', target: 2 }] }));
    const before = await exported(qa.controller);
    const pending = await qa.request(turn({ operations: [
      { type: 'navigate_slide', target: 3 },
      { type: 'revise_slide', target: 'current', instruction: 'Shorten the selected explanation.', detailChange: 'shorten' },
    ] }));
    const action = pending.desktopIntent;
    expect(action?.kind).toBe('slide');
    if (action?.kind !== 'slide' || !action.continueRequest || !action.filename)
      throw new Error('Expected a navigation continuation');
    expect(action.slide).toBe(3);
    expect(qa.revise).not.toHaveBeenCalled();
    qa.controller.recordSelectedSlide(action.filename, reportedSlide, action.identity);
    const result = await qa.controller.request(action.continueRequest, signal());
    const after = await exported(qa.controller);
    if (reportedSlide === 3) {
      expect(qa.revise.mock.calls.map((call) => call[1])).toEqual(['message']);
      expect(after.xml[2]).not.toBe(before.xml[2]);
      expect(after.xml.filter((_, index) => index !== 2)).toEqual(before.xml.filter((_, index) => index !== 2));
    } else {
      expect(qa.revise).not.toHaveBeenCalled();
      expect(result.clarification).toBe(true);
      expect(after.bytes.equals(before.bytes)).toBe(true);
    }
  });

  it('changes a pending target through correction and invalidates the old native continuation', async () => {
    const qa = await fixture();
    const before = await exported(qa.controller);
    const pending = await qa.request(turn({ fields: { folderPath: qa.folder, open: true }, operations: [{ type: 'insert_image', target: 2 }] }));
    const oldToken = continuation(pending);
    await qa.request(turn({ kind: 'correction', fields: { imageDestination: 3, open: false }, operations: [] }));
    expect(currentDeck(qa.controller).slides[1]).toMatchObject({ id: 'audience', type: 'text' });
    expect(currentDeck(qa.controller).slides[2]).toMatchObject({ id: 'message', type: 'image', imageId: 1 });
    const corrected = await exported(qa.controller);
    expect(corrected.xml.filter((_, index) => index !== 2)).toEqual(before.xml.filter((_, index) => index !== 2));
    const stale = await qa.controller.request(oldToken, signal());
    expect(stale.clarification).toBe(true);
    expect(stale.summary).toMatch(/replaced/);
    expect((await exported(qa.controller)).bytes.equals(corrected.bytes)).toBe(true);
  });

  it('retries a failed edit on its original target after native selection changes', async () => {
    const qa = await fixture();
    const before = await exported(qa.controller);
    const filename = qa.controller.snapshot().presentation!.filename;
    const identity = qa.controller.presentationSelectionIdentity();
    qa.controller.recordSelectedSlide(filename, 2, identity);
    qa.revise.mockRejectedValueOnce(new sources.PresentationProjectError('The provider could not complete this edit.'));
    await expect(qa.request(turn({ operations: [{ type: 'revise_slide', target: 'current', instruction: 'Shorten the explanation.', detailChange: 'shorten' }] }))).rejects.toThrow('could not complete');
    qa.controller.recordSelectedSlide(filename, 3, identity);
    await qa.request(turn({ retryFailedTask: true }));
    expect(qa.revise.mock.calls.map((call) => call[1])).toEqual(['audience', 'audience']);
    const after = await exported(qa.controller);
    expect(after.xml[1]).not.toBe(before.xml[1]);
    expect(after.xml.filter((_, index) => index !== 1)).toEqual(before.xml.filter((_, index) => index !== 1));
  });

  it('refuses failed work from a previous project without changing the replacement project', async () => {
    const qa = await fixture();
    qa.revise.mockRejectedValueOnce(new sources.PresentationProjectError('The provider could not complete this edit.'));
    await expect(qa.request(turn({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Shorten the explanation.' }] }))).rejects.toThrow('could not complete');
    const originalProject = qa.controller.presentationSelectionIdentity()!.projectId;
    await qa.create('Another community project');
    const replacement = await exported(qa.controller);
    expect(qa.controller.presentationSelectionIdentity()!.projectId).not.toBe(originalProject);
    const result = await qa.request(turn({ retryFailedTask: true }));
    expect(result.clarification).toBe(true);
    expect(qa.revise).toHaveBeenCalledTimes(1);
    expect((await exported(qa.controller)).bytes.equals(replacement.bytes)).toBe(true);
  });

  it('rejects an old folder continuation after a different project becomes active', async () => {
    const qa = await fixture();
    const originalProject = qa.controller.presentationSelectionIdentity()!.projectId;
    const pending = await qa.request(turn({ fields: { folderPath: qa.folder, open: true }, operations: [{ type: 'insert_image', target: 2 }] }));
    const token = continuation(pending);
    await qa.create('Another community project');
    const replacement = await exported(qa.controller);
    const identity = qa.controller.presentationSelectionIdentity()!;
    expect(identity.projectId).not.toBe(originalProject);
    const result = await qa.controller.request(token, signal());
    expect(result.clarification).toBe(true);
    expect(result.summary).toMatch(/replaced/);
    expect(qa.controller.presentationSelectionIdentity()).toEqual(identity);
    expect((await exported(qa.controller)).bytes.equals(replacement.bytes)).toBe(true);
    expect(currentDeck(qa.controller).slides.every((slide) => !('imageId' in slide))).toBe(true);
  });
});
