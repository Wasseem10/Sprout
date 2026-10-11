import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ComputerController } from '../server/computer/controller';
import { config } from '../server/config';
import * as interpretation from '../server/computer/presentation-intent';
import * as planning from '../server/computer/presentation-deck';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationOperation, PresentationTurnIntent } from '../shared/presentation-intent';

const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => { for (const controller of controllers.splice(0)) await controller.close(); vi.restoreAllMocks(); });

async function fixture() {
  const initial: OrderedPresentationDeck = {
    schemaVersion: 2, title: 'Accessible communications', theme: 'blue', textScale: 1, allowImageReuse: false,
    slides: [
      { id: 'cover', type: 'cover', title: 'Accessible communications', subtitle: 'Help every participant understand the proposed plan.' },
      { id: 'audience', type: 'text', title: 'Audience', points: ['Ask participants what formats make information easier for them to understand.', 'Offer clear written information before the meeting so everyone has time to prepare.'] },
      { id: 'review', type: 'text', title: 'Review', points: ['Check the proposed materials with the audience before publishing them.'] },
    ],
  };
  const intents: PresentationTurnIntent[] = [];
  vi.spyOn(interpretation, 'interpretPresentationTurn').mockImplementation(async () => intents.shift()!);
  vi.spyOn(planning, 'planOrderedDeck').mockResolvedValue(structuredClone(initial));
  const revise = vi.spyOn(planning, 'reviseOrderedSlide').mockImplementation(async (deck, id) => ({
    ...structuredClone(deck), slides: deck.slides.map(slide => slide.id === id && slide.type === 'text' ? { ...slide, points: ['Ask participants which information formats they prefer.', 'Share clear materials before the meeting.'] } : structuredClone(slide)),
  }));
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-compound-'));
  const controller = new ComputerController({ ...config(), localDir, owner: 'compound-test', hfToken: 'test', cloudUrl: '', neonUrl: '', dbToken: '' });
  controllers.push(controller); await controller.init();
  vi.spyOn(controller as any, 'refreshPresentationFile').mockImplementation(async (...args: unknown[]) => {
    const promote = args[1] as () => Promise<void>;
    await promote(); return { promoted: true, opened: false, wasOpen: false, closed: 0, retainedModified: 0, warnings: [] };
  });
  const request = async (operations: PresentationOperation[], create = false) => {
    intents.push({ kind: 'request', domain: 'presentation', startsNewTask: create, awaitingContinuation: false,
      fields: { open: false, ...(create ? { topic: initial.title } : {}) }, operations });
    return controller.request('A distinct test request', signal());
  };
  await request([{ type: 'create' }], true);
  return { controller, request, revise };
}

it('stages text plus typography on one slide into one same-file revision and undo', async () => {
  const qa = await fixture();
  const before = qa.controller.snapshot().presentation!;
  const result = await qa.request([
    { type: 'revise_slide', target: 2, instruction: 'Shorten this explanation.', detailChange: 'shorten' },
    { type: 'resize_text', target: 2, direction: 'larger' },
  ]);
  const after = result.state.presentation!;
  expect(after.filename).toBe(before.filename);
  expect(after.project!.revision).toBe(2);
  expect(after.project!.orderedDeck!.slides[1]).toMatchObject({ id: 'audience', textScale: 1.15, points: ['Ask participants which information formats they prefer.', 'Share clear materials before the meeting.'] });
  expect(after.project!.orderedDeck!.slides.filter(slide => slide.id !== 'audience')).toEqual(before.project!.orderedDeck!.slides.filter(slide => slide.id !== 'audience'));
  expect(result.summary).toContain('one change');
  const undone = await qa.request([{ type: 'undo' }]);
  expect(undone.state.presentation!.project!.orderedDeck).toEqual(before.project!.orderedDeck);
  expect(undone.state.presentation!.project!.revision).toBe(3);
});

it('leaves the whole compound edit uncommitted if a later content step fails', async () => {
  const qa = await fixture();
  const before = qa.controller.snapshot().presentation!;
  const bytes = (await qa.controller.presentationExport()).bytes;
  qa.revise.mockRejectedValueOnce(new Error('Provider unavailable'));
  await expect(qa.request([
    { type: 'resize_text', target: 2, direction: 'smaller' },
    { type: 'revise_slide', target: 2, instruction: 'Rephrase this explanation.', detailChange: 'preserve' },
  ])).rejects.toThrow('Provider unavailable');
  expect(qa.controller.snapshot().presentation).toEqual(before);
  expect((await qa.controller.presentationExport()).bytes).toEqual(bytes);
});

it('retains independent commits for instructions on different slides', async () => {
  const qa = await fixture();
  const result = await qa.request([
    { type: 'revise_slide', target: 2, instruction: 'Shorten this explanation.', detailChange: 'shorten' },
    { type: 'resize_text', target: 3, direction: 'larger' },
  ]);
  expect(result.state.presentation!.project!.revision).toBe(3);
  expect(result.state.presentation!.project!.orderedDeck!.slides[1]).not.toHaveProperty('textScale');
  expect(result.state.presentation!.project!.orderedDeck!.slides[2].textScale).toBe(1.15);
});
