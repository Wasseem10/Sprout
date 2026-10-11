import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { PresentationWorkingFiles } from '../server/computer/presentation-working-file';
import * as interpreter from '../server/computer/presentation-intent';
import * as planning from '../server/computer/presentation-deck';
import * as provider from '../server/computer/planner';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationIntentContext, PresentationTurnIntent } from '../shared/presentation-intent';

const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const turn = (partial: Partial<PresentationTurnIntent> = {}): PresentationTurnIntent => ({
  kind: 'request', domain: 'presentation', startsNewTask: false, awaitingContinuation: false,
  fields: { open: false }, operations: [], ...partial,
});
const points = [
  'Across 12 observations, dogs used tail, ear and body movements to signal feelings.',
  'Tail direction and speed can convey different emotional states and social intentions toward nearby people and animals. Consider the complete body posture alongside the tail instead of relying on an isolated movement.',
  'Forward ears indicate attention and interest in nearby activity, demonstrating awareness of changing surroundings. Follow where the dog directs its attention and note how that focus changes as the environment changes.',
];
const initial: OrderedPresentationDeck = {
  schemaVersion: 2, title: 'Understanding Pet Behavior', theme: 'blue', textScale: 1, allowImageReuse: false,
  slides: [
    { id: 'cover', type: 'cover', title: 'Understanding Pet Behavior', subtitle: 'Observe familiar animals in context.' },
    { id: 'signals', type: 'text', title: 'Communication Signals', textScale: 1.1, points: points.slice(0, 2) },
    { id: 'space', type: 'text', title: 'Respect Their Space', points: ['Let pets move away when they want a break.'] },
  ],
};
const deckOf = (controller: ComputerController) => structuredClone(controller.snapshot().presentation!.project!.orderedDeck!);

async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-capacity-conversation-'));
  const cfg = { ...config(), localDir, owner: 'capacity-conversation-test', host: '127.0.0.1', hfToken: 'test-no-network', cloudUrl: '', neonUrl: '', dbToken: '' };
  const contexts: PresentationIntentContext[] = [];
  const intents: PresentationTurnIntent[] = [];
  vi.spyOn(interpreter, 'interpretPresentationTurn').mockImplementation(async (_text, context) => {
    contexts.push(structuredClone(context));
    const intent = intents.shift();
    if (!intent) throw new Error('Missing synthetic semantic intent');
    return structuredClone(intent);
  });
  vi.spyOn(planning, 'planOrderedDeck').mockImplementation(async fields => ({
    ...structuredClone(initial), title: fields.topic!,
    slides: initial.slides.map((slide, index) => index ? structuredClone(slide) : { ...slide, title: fields.topic! }),
  }));
  const revise = vi.spyOn(planning, 'reviseOrderedSlide');
  const chat = vi.spyOn(provider, 'chat').mockResolvedValue(JSON.stringify({ afterPoint: 1, explanation: points[2] }));
  const summary = vi.spyOn(planning, 'generateSummarySlide').mockResolvedValue({
    id: 'summary', type: 'text', title: 'Summary', points: ['Read animal signals in context and respect each animal’s space.'],
  });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network is permitted in the isolated recovery test.'); }));
  const makeController = async () => {
    const controller = new ComputerController(cfg);
    controllers.push(controller);
    await controller.init();
    vi.spyOn(controller as any, 'launchOffice').mockResolvedValue(undefined);
    vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (...args: unknown[]) => {
      const promote = args[1] as () => Promise<unknown>;
      await promote();
      return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
    });
    return controller;
  };
  const controller = await makeController();
  let sequence = 0;
  const request = async (intent: PresentationTurnIntent, target = controller) => {
    intents.push(intent);
    return target.request(`Synthetic recovery task ${++sequence}`, signal());
  };
  const create = (title = initial.title) => request(turn({ startsNewTask: true, fields: { topic: title, totalSlides: 3, open: false }, operations: [{ type: 'create' }] }));
  const expand = () => request(turn({ operations: [{ type: 'revise_slide', target: 2, instruction: 'Explain these observations further.', detailChange: 'expand' }] }));
  const capture = async (target = controller) => {
    const record = await new PresentationWorkingFiles(cfg).active();
    if (!record) throw new Error('No actual working presentation record');
    const bytes = await readFile(record.working.path);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await Promise.all(deckOf(target).slides.map((_, index) => zip.file(`ppt/slides/slide${index + 1}.xml`)!.async('string')));
    return { record, bytes, xml, deck: deckOf(target), state: target.snapshot().presentation! };
  };
  await create();
  return { controller, cfg, makeController, request, create, expand, capture, contexts, revise, chat, summary };
}

describe('capacity recovery through the controller conversation and actual working file', () => {
  it('offers without writing, retains the choice through a question, then commits and undoes one exact change in the same file', async () => {
    const qa = await fixture(), before = await qa.capture();
    const offer = await qa.expand();
    expect(offer).toMatchObject({ clarification: true, recovery: { category: 'layout_capacity', slideId: 'signals', choices: ['split', 'keep'], baseRevision: 1 } });
    expect((await qa.capture()).record).toEqual(before.record);
    expect((await qa.capture()).bytes).toEqual(before.bytes);
    expect(qa.chat).toHaveBeenCalledTimes(2);
    await qa.request(turn({ kind: 'question', reply: 'The continuation keeps every complete point at its current text size.' }));
    expect(qa.contexts.at(-1)).toMatchObject({ draft: null, pendingRecovery: offer.recovery });
    expect(qa.contexts.at(-1)?.lastFailedTask?.operations[0].type).toBe('revise_slide');
    const accepted = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'split' }] }));
    expect(accepted.clarification).not.toBe(true);
    const after = await qa.capture();
    expect(after.state.filename).toBe(before.state.filename);
    expect(after.record.working.path).toBe(before.record.working.path);
    expect(after.record.revision).toBe(2);
    expect(after.record.session?.history).toHaveLength(1);
    if (after.record.session?.schemaVersion !== 3) throw new Error('Expected an authoritative visual session');
    expect(after.record.session.history[0].orderedDeck).toEqual(before.deck);
    expect(after.deck.slides[1].id).toBe('signals');
    expect(after.deck.slides[2].id).not.toBe('signals');
    expect(after.deck.slides.slice(1, 3).flatMap(slide => slide.type === 'text' ? slide.points : [])).toEqual(points);
    expect(after.deck.slides.slice(1, 3).map(slide => slide.textScale)).toEqual([1.1, 1.1]);
    expect(after.deck.slides[0]).toEqual(before.deck.slides[0]);
    expect(after.deck.slides[3]).toEqual(before.deck.slides[2]);
    for (const point of points) expect(after.xml.slice(1, 3).filter(xml => xml.includes(point))).toHaveLength(1);
    expect(qa.revise).toHaveBeenCalledTimes(1);
    expect(qa.chat).toHaveBeenCalledTimes(2);
    await qa.request(turn({ operations: [{ type: 'undo' }] }));
    const undone = await qa.capture();
    expect(undone.deck).toEqual(before.deck);
    expect(undone.xml).toEqual(before.xml);
    expect(undone.record.session?.history).toHaveLength(0);
    expect(undone.record.working.path).toBe(before.record.working.path);
    expect(undone.record.revision).toBe(3);
  });

  it('keeps the existing slide without a new history entry and clears the offer', async () => {
    const qa = await fixture(), before = await qa.capture();
    await qa.expand();
    const result = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'keep' }] }));
    expect(result.summary).toContain('unchanged');
    expect((await qa.capture()).record).toEqual(before.record);
    expect((await qa.capture()).bytes).toEqual(before.bytes);
    const stale = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'split' }] }));
    expect(stale.clarification).toBe(true);
    expect(stale.summary).toContain('no pending layout choice');
    expect(qa.revise).toHaveBeenCalledTimes(1);
    await qa.request(turn({ operations: [{ type: 'add_summary' }] }));
    expect(qa.summary).toHaveBeenCalledTimes(1);
    expect(deckOf(qa.controller).slides).toHaveLength(4);
    expect(deckOf(qa.controller).slides.slice(0, 3)).toEqual(before.deck.slides);
  });

  it.each(['summary', 'correction'] as const)('a fresh %s cannot revive the failed expansion or its pending tail', async choice => {
    const qa = await fixture(), before = await qa.capture();
    const offer = await qa.request(turn({ operations: [
      { type: 'revise_slide', target: 2, instruction: 'Expand these observations.', detailChange: 'expand' },
      { type: 'add_summary' },
    ] }));
    expect(offer.recovery?.choices).toContain('split');
    expect(qa.summary).not.toHaveBeenCalled();
    if (choice === 'summary') {
      await qa.request(turn({ retryFailedTask: true, operations: [{ type: 'add_summary' }] }));
      expect(qa.summary).toHaveBeenCalledTimes(1);
      expect(deckOf(qa.controller).slides).toHaveLength(4);
      expect(deckOf(qa.controller).slides.slice(0, 3)).toEqual(before.deck.slides);
    } else {
      qa.chat.mockResolvedValue(JSON.stringify({ title: 'Communication Signals', points: [
        'Across 12 observations, dogs signaled feelings with body movements.',
        'Tail direction and speed can signal emotional states and social intentions; interpret these alongside body posture.',
      ] }));
      await qa.request(turn({ kind: 'correction', operations: [{ type: 'revise_slide', target: 2, instruction: 'Shorten this instead.', detailChange: 'shorten' }] }));
      expect(deckOf(qa.controller).slides).toHaveLength(3);
      expect(qa.revise.mock.calls.at(-1)?.[6]).toMatchObject({ detailChange: 'shorten' });
      expect(qa.summary).not.toHaveBeenCalled();
    }
    expect((await qa.capture()).record.revision).toBe(2);
    const later = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'split' }] }));
    expect(later.clarification).toBe(true);
    expect(later.summary).toContain('no pending layout choice');
    expect((await qa.capture()).record.revision).toBe(2);
  });

  it('refuses the old offer after a different saved project is resumed directly', async () => {
    const qa = await fixture();
    const savedA = await qa.controller.savePresentation(signal());
    const idA = savedA.state.presentation!.project!.saved!.id;
    await qa.create('Another animal presentation');
    const savedB = await qa.controller.savePresentation(signal());
    const idB = savedB.state.presentation!.project!.saved!.id;
    await qa.controller.resumePresentation(idA, signal(), { open: false });
    await qa.expand();
    await qa.controller.resumePresentation(idB, signal(), { open: false });
    const beforeChoice = await qa.capture();
    const result = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'split' }] }));
    expect(result.clarification).toBe(true);
    expect(result.summary).toMatch(/changed since|no pending/);
    expect((await qa.capture()).record).toEqual(beforeChoice.record);
    expect((await qa.capture()).bytes).toEqual(beforeChoice.bytes);
    expect(qa.revise).toHaveBeenCalledTimes(1);
  });

  it('refuses a stale offer after a newer revision is recovered from the local working record', async () => {
    const qa = await fixture();
    const saved = await qa.controller.savePresentation(signal());
    const id = saved.state.presentation!.project!.saved!.id;
    await qa.expand();
    const other = await qa.makeController();
    expect(other.snapshot().presentation?.project?.revision).toBe(1);
    await qa.request(turn({ operations: [{ type: 'set_theme', theme: 'dark' }] }), other);
    await qa.controller.resumePresentation(id, signal(), { open: false });
    const beforeChoice = await qa.capture();
    expect(beforeChoice.record.revision).toBe(2);
    const result = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'split' }] }));
    expect(result.clarification).toBe(true);
    expect(result.summary).toMatch(/changed since|no pending/);
    expect((await qa.capture()).record).toEqual(beforeChoice.record);
    expect((await qa.capture()).bytes).toEqual(beforeChoice.bytes);
    expect(deckOf(qa.controller).theme).toBe('dark');
    expect(qa.revise).toHaveBeenCalledTimes(1);
  });

  it('cancellation removes the recovery offer and never writes the prepared continuation', async () => {
    const qa = await fixture(), before = await qa.capture();
    await qa.expand();
    await qa.request(turn({ kind: 'cancellation' }));
    const result = await qa.request(turn({ operations: [{ type: 'recover_layout', choice: 'split' }] }));
    expect(result.clarification).toBe(true);
    expect(result.summary).toContain('no pending layout choice');
    expect((await qa.capture()).record).toEqual(before.record);
    expect((await qa.capture()).bytes).toEqual(before.bytes);
  });

  it('interrupts an in-flight edit and starts a fresh summary without replaying the abandoned edit', async () => {
    const qa = await fixture(), before = await qa.capture();
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    qa.chat.mockImplementationOnce(async (_cfg, _system, _request, activeSignal) => {
      await delayed;
      activeSignal.throwIfAborted();
      return JSON.stringify({ title: 'Communication Signals', points });
    });
    const running = qa.expand();
    const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(qa.chat).toHaveBeenCalledTimes(1));
    const interrupted = qa.controller.interrupt();
    release();
    await interrupted;
    await rejected;
    expect((await qa.capture()).bytes).toEqual(before.bytes);
    await qa.request(turn({ operations: [{ type: 'add_summary' }] }));
    expect(qa.contexts.at(-1)).toMatchObject({ draft: null, lastFailedTask: { operations: [{ type: 'revise_slide' }] } });
    expect(qa.revise).toHaveBeenCalledTimes(1);
    expect(qa.summary).toHaveBeenCalledTimes(1);
    const after = await qa.capture();
    expect(after.record.revision).toBe(2);
    expect(after.deck.slides.slice(0, 3)).toEqual(before.deck.slides);
  });

  it('rejects a waiting folder continuation after another controller advances that project', async () => {
    const qa = await fixture();
    const saved = await qa.controller.savePresentation(signal());
    const id = saved.state.presentation!.project!.saved!.id;
    const folder = path.join(qa.cfg.localDir, 'Pictures');
    await mkdir(folder);
    await writeFile(path.join(folder, 'picture.png'), await readFile(path.resolve('artifacts/workspace.png')));
    const insert = vi.spyOn(qa.controller as any, 'insertOrderedImage');
    const pending = await qa.request(turn({ fields: { folderPath: folder, open: true }, operations: [{ type: 'insert_image', target: 2 }] }));
    expect(pending.desktopIntent?.kind).toBe('openFolder');
    const token = pending.desktopIntent?.kind === 'openFolder' ? pending.desktopIntent.continueRequest : undefined;
    expect(token).toBeTruthy();
    const other = await qa.makeController();
    await qa.request(turn({ operations: [{ type: 'set_theme', theme: 'dark' }] }), other);
    await qa.controller.resumePresentation(id, signal(), { open: false });
    const beforeContinuation = await qa.capture();
    expect(beforeContinuation.record.revision).toBe(2);
    await expect(qa.controller.request(token!, signal())).rejects.toMatchObject({ code: 'stale_revision' });
    expect(insert).not.toHaveBeenCalled();
    expect((await qa.capture()).record).toEqual(beforeContinuation.record);
    expect((await qa.capture()).bytes).toEqual(beforeContinuation.bytes);
    await qa.request(turn({ operations: [{ type: 'add_summary' }] }));
    expect(qa.contexts.at(-1)?.draft).toBeNull();
    expect(qa.summary).toHaveBeenCalledTimes(1);
    expect(deckOf(qa.controller).slides[1]).toEqual(beforeContinuation.deck.slides[1]);
  });

  it('invalidates an interrupted interpreter before it can create an executable draft', async () => {
    const qa = await fixture(), before = await qa.capture();
    const interpret = vi.mocked(interpreter.interpretPresentationTurn);
    const implementation = interpret.getMockImplementation()!;
    let started!: () => void, release!: () => void;
    const entering = new Promise<void>(resolve => { started = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    interpret.mockImplementationOnce(async (...args) => { started(); await delayed; return implementation(...args); });
    const running = qa.expand();
    const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await entering;
    const interrupted = qa.controller.interrupt();
    release();
    await interrupted;
    await rejected;
    expect((await qa.capture()).bytes).toEqual(before.bytes);
    await qa.request(turn({ operations: [{ type: 'add_summary' }] }));
    expect(qa.contexts.at(-1)?.draft).toBeNull();
    expect(qa.revise).not.toHaveBeenCalled();
    expect(qa.chat).not.toHaveBeenCalled();
    expect(qa.summary).toHaveBeenCalledTimes(1);
  });

  it('keeps an already committed prefix when interruption abandons a later edit', async () => {
    const qa = await fixture();
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    qa.chat.mockImplementationOnce(async (_cfg, _system, _request, activeSignal) => {
      await delayed;
      activeSignal.throwIfAborted();
      return JSON.stringify({ title: 'Communication Signals', points });
    });
    const running = qa.request(turn({ operations: [
      { type: 'set_theme', theme: 'dark' },
      { type: 'revise_slide', target: 2, instruction: 'Explain these observations further.', detailChange: 'expand' },
    ] }));
    const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(qa.chat).toHaveBeenCalledTimes(1));
    const committed = await qa.capture();
    expect(committed.record.revision).toBe(2);
    expect(committed.deck.theme).toBe('dark');
    const interrupted = qa.controller.interrupt();
    release();
    await interrupted;
    await rejected;
    expect((await qa.capture()).bytes).toEqual(committed.bytes);
    await qa.request(turn({ operations: [{ type: 'add_summary' }] }));
    expect(qa.contexts.at(-1)?.lastFailedTask?.operations.map(operation => operation.type)).toEqual(['revise_slide']);
    expect(qa.contexts.at(-1)?.lastVerifiedResult?.summary).toContain('Saved');
    expect(qa.revise).toHaveBeenCalledTimes(1);
    expect((await qa.capture()).record.revision).toBe(3);
    expect(deckOf(qa.controller).slides.slice(0, 3)).toEqual(committed.deck.slides);
    expect(deckOf(qa.controller).theme).toBe('dark');
  });

  it('advances a reviewed anchor only through its own saved change before the next current-slide operation', async () => {
    const qa = await fixture();
    const result = await qa.request(turn({ operations: [
      { type: 'read_slide', target: 2 },
      { type: 'set_theme', theme: 'dark' },
      { type: 'read_slide', target: 'current' },
      { type: 'resize_text', target: 3, direction: 'larger' },
      { type: 'read_slide', target: 'current' },
    ] }));
    expect(result.taskStatus).not.toBe('failed');
    expect(result.summary).toContain('Slide 2.');
    expect(result.summary).toContain('Slide 3.');
    expect(result.changes).toHaveLength(2);
    expect((await qa.capture()).record.revision).toBe(3);
    expect(deckOf(qa.controller).slides[2].textScale).toBe(1.15);
    expect(qa.revise).not.toHaveBeenCalled();
  });

  it('does not execute a dependent edit from a navigation continuation without a verified native result', async () => {
    const qa = await fixture(), before = await qa.capture();
    const result = await qa.request(turn({ operations: [
      { type: 'navigate_slide', target: 2 },
      { type: 'revise_slide', target: 'current', instruction: 'Explain these observations further.', detailChange: 'expand' },
    ] }));
    const token = result.desktopIntent?.kind === 'slide' ? result.desktopIntent.continueRequest : undefined;
    expect(token).toBeTruthy();
    await expect(qa.controller.request(token!, signal())).rejects.toMatchObject({ code: 'navigation_unverified' });
    expect(qa.revise).not.toHaveBeenCalled();
    expect((await qa.capture()).record).toEqual(before.record);
    expect((await qa.capture()).bytes).toEqual(before.bytes);
    await qa.request(turn({ operations: [{ type: 'add_summary' }] }));
    expect(qa.contexts.at(-1)?.draft).toBeNull();
    expect(qa.summary).toHaveBeenCalledTimes(1);
  });

  it('marks only the exact final revision verified when a compound request edits then saves', async () => {
    const qa = await fixture();
    const result = await qa.request(turn({ operations: [
      { type: 'set_theme', theme: 'dark' },
      { type: 'resize_text', target: 3, direction: 'larger' },
      { type: 'save' },
    ] }));
    const current = await qa.capture();
    expect(result.changes).toHaveLength(2);
    expect(result.changes![0]).toMatchObject({ committedRevision: 2, cloud: { status: 'not_saved' } });
    expect(result.changes![1]).toMatchObject({ committedRevision: 3, cloud: { status: 'verified', provider: 'local' } });
    expect(result.changes![1].outputSha256).toBe(current.record.working.sha256);
    expect(result.changes![1].cloud.savedAt).toBe(result.persistence!.savedAt);
    expect(result.persistence).toMatchObject({ projectId: current.record.projectId, revision: 3, sha256: current.record.working.sha256, provider: 'local', verified: true });
    const restored = await qa.makeController();
    expect(deckOf(restored)).toEqual(current.deck);
    expect(restored.snapshot().presentation!.sha256).toBe(current.record.working.sha256);
  });
});
