import { beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import { reviewPresentationCopy } from '../server/computer/presentation-copy-review';
import {
  assertOrderedDeckFits,
  orderedSlideBodyWordCount,
  presentationRevisionBudget,
  PresentationRevisionError,
  reviseOrderedSlide,
  writeOrderedDeck,
} from '../server/computer/presentation-deck';
import type { OrderedPresentationDeck, OrderedPresentationSlide } from '../shared/presentation-deck';
import type { DeckSources } from '../server/computer/presentation-project';

vi.mock('../server/computer/planner', () => ({ chat: vi.fn() }));
vi.mock('../server/computer/presentation-copy-review', () => ({ reviewPresentationCopy: vi.fn() }));
const chatMock = vi.mocked(chat);
const reviewMock = vi.mocked(reviewPresentationCopy);
const cfg = { ...config(), hfToken: 'test', cloudUrl: '' };
const sources: DeckSources = { root: 'isolated-revision-test', brief: 'Explain the supplied pet observations.', briefName: null, assets: [] };
const signal = () => new AbortController().signal;
const crowded: OrderedPresentationSlide = {
  id: 'signals', type: 'text', title: 'Dog Communication Signals',
  points: [
    'Dogs wag their tails to express excitement or friendliness toward people or other animals, with the direction and speed of the wag indicating specific emotional states and social intentions.',
    'When dogs point their ears forward, it shows they are attentive and interested in something around them, demonstrating their acute awareness and engagement with their environment and surrounding stimuli.',
    'A relaxed dog will have a loose body posture and may have an open mouth, indicating calmness and contentment rather than tension or stress in their current situation.',
  ],
};
const concise: OrderedPresentationSlide = {
  id: 'signals', type: 'text', title: 'Dog Communication Signals',
  points: [
    'Dogs wag their tails to show excitement or friendliness toward people or other animals.',
    'Ears held forward show attention to something nearby.',
    'Loose posture and an open mouth may show calm rather than stress.',
  ],
};
function deck(slide: OrderedPresentationSlide = crowded): OrderedPresentationDeck {
  return {
    schemaVersion: 2, title: 'Understanding Pet Behavior', theme: 'blue', textScale: 1, allowImageReuse: false,
    slides: [
      { id: 'cover', type: 'cover', title: 'Understanding Pet Behavior', subtitle: 'Learning to observe familiar pets.' },
      structuredClone(slide),
      { id: 'ending', type: 'text', title: 'Respect Their Space', points: ['Give a pet room to move away when it wants a break.'] },
    ],
  };
}
beforeEach(() => { chatMock.mockReset(); reviewMock.mockReset().mockResolvedValue({ passed: true, issues: [] }); });

it('keeps a saturated layout estimate honest instead of lifting capacity to its requested growth minimum', () => {
  const original = deck();
  original.textScale = 1.02;
  expect(() => assertOrderedDeckFits(original)).not.toThrow();
  const budget = presentationRevisionBudget(crowded, original.textScale);
  expect(orderedSlideBodyWordCount(crowded)).toBe(86);
  expect(budget.requestedMinimumBodyWords).toBe(98);
  expect(budget.estimatedCapacityWords).toBeLessThan(98);
  expect(budget.spaceLimited).toBe(true);
  expect(budget.minimumBodyWords).toBeUndefined();
  expect(budget.targetMaximumBodyWords).toBeUndefined();
  expect(budget.measuredBodyHeight).toBeLessThanOrEqual(budget.availableBodyHeight + 0.04);
});

it('adds a measured explanation on the first call while preserving every original sentence', async () => {
  const original = deck(concise);
  original.textScale = 1.02;
  const explanation = 'Their surroundings help observers understand what those signals mean.';
  chatMock.mockImplementationOnce(async (_cfg, system, payload, _signal, _model, _json, _tokens, contract) => {
    const request = JSON.parse(payload as string);
    expect(request.task).toContain('Return only the addition');
    expect(request.task).not.toMatch(/in \d+ words total/);
    expect(request.allowedNumericalValues).toEqual([]);
    expect(contract?.name).toBe('PresentationAddition');
    expect(system).not.toContain('REPAIR MODE');
    expect(system).toContain('retains every original sentence');
    expect(request.copyBudget).toBeUndefined();
    expect(request.layoutBudget).toBeUndefined();
    return JSON.stringify({ afterPoint: 1, explanation });
  });
  const revised = await reviseOrderedSlide(original, 'signals', 'Add useful context.', sources, cfg, signal(), { detailChange: 'expand' });
  expect(orderedSlideBodyWordCount(revised.slides[1])).toBe(orderedSlideBodyWordCount(concise) + 9);
  for (const point of (concise as Extract<OrderedPresentationSlide, { type: 'text' }>).points)
    expect(JSON.stringify(revised.slides[1])).toContain(point);
  expect(() => assertOrderedDeckFits(revised)).not.toThrow();
  expect(revised.textScale).toBe(1.02);
  expect(revised.slides[0]).toEqual(original.slides[0]);
  expect(revised.slides[2]).toEqual(original.slides[2]);
  expect(chatMock).toHaveBeenCalledTimes(1);
});

it('repairs a shorter expansion by elaborating, never by issuing overflow or shrink instructions', async () => {
  const original = deck(concise);
  const before = structuredClone(original);
  chatMock.mockResolvedValueOnce(JSON.stringify({ afterPoint: 0, explanation: 'Observe the setting.' }));
  chatMock.mockImplementationOnce(async (_cfg, system, payload) => {
    const request = JSON.parse(payload as string);
    expect(request.failureCode).toBe('no_meaningful_change');
    expect(request.repairInstruction).toContain('Elaborate the ORIGINAL ideas');
    expect(system).not.toMatch(/COMPRESS|candidate is too long|do not expand it/);
    expect(request.correction).not.toContain('exceeds');
    return JSON.stringify({ afterPoint: 1, explanation: 'Following the direction of attention helps observers notice which nearby changes may matter to the dog.' });
  });
  const revised = await reviseOrderedSlide(original, 'signals', 'Explain this more.', sources, cfg, signal(), { detailChange: 'expand' });
  expect(JSON.stringify(revised.slides[1])).toContain('Following the direction of attention');
  for (const point of (concise as Extract<OrderedPresentationSlide, {type:'text'}>).points)
    expect(JSON.stringify(revised.slides[1])).toContain(point);
  expect(revised.slides[0]).toEqual(original.slides[0]);
  expect(revised.slides[2]).toEqual(original.slides[2]);
  expect(original).toEqual(before);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('returns measured capacity recovery after one repair and preserves the original deck and exported file', async () => {
  const original = deck(crowded);
  const before = structuredClone(original);
  const output = path.join(await mkdtemp(path.join(tmpdir(), 'insight-capacity-')), 'original.pptx');
  await writeOrderedDeck(original, sources, output);
  const originalBytes = await readFile(output);
  // Individual paragraphs obey the schema, but their measured total height exceeds the slide.
  const oversized = { afterPoint: 1, explanation: 'Following the direction of attention helps observers notice which nearby changes may matter to the dog and interpret its signals with that context.' };
  chatMock.mockResolvedValue(JSON.stringify(oversized));
  let failure: unknown;
  try { await reviseOrderedSlide(original, 'signals', 'Explain these ideas further.', sources, cfg, signal(), { detailChange: 'expand' }); }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(PresentationRevisionError);
  expect(failure).toMatchObject({ code: 'layout_capacity', slideId: 'signals', direction: 'expand', attempts: 2, changed: false,
    measurements: { beforeBodyWords: orderedSlideBodyWordCount(crowded), candidateFits: false } });
  expect((failure as PresentationRevisionError).measurements.candidateBodyWords).toBeGreaterThan(100);
  const repair = JSON.parse(chatMock.mock.calls[1][2] as string);
  expect(repair.failureCode).toBe('layout_capacity');
  expect(repair.repairInstruction).toContain('app preserves every original sentence');
  expect(repair.correction).toContain('measured width or height');
  expect(repair.correction).not.toContain('Shorten this slide');
  expect(chatMock).toHaveBeenCalledTimes(2);
  expect(original).toEqual(before);
  expect(await readFile(output)).toEqual(originalBytes);
});

it('reports insufficient growth separately from layout failure when the returned text already fits', async () => {
  const original = deck();
  chatMock.mockResolvedValueOnce(JSON.stringify(concise)).mockResolvedValueOnce(JSON.stringify({ afterPoint: 0, explanation: 'Observe the setting.' }));
  let failure: unknown;
  try { await reviseOrderedSlide(original, 'signals', 'Explain further.', sources, cfg, signal(), { detailChange: 'expand' }); }
  catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'no_meaningful_change', changed: false,
    measurements: { beforeBodyWords: 86, candidateBodyWords: 89, candidateFits: true } });
  expect((failure as Error).message).not.toContain('could not fit');
  expect(chatMock).toHaveBeenCalledTimes(2);
  expect(original.slides[1]).toEqual(crowded);
});

it('does not repair invented factual numbers as an overflow or silently accept the new fact', async () => {
  const original = deck({ ...concise, type: 'text', points: ['The shelter recorded 12 dog arrivals and provided a quiet rest area for each dog.'] });
  chatMock.mockResolvedValue(JSON.stringify({ afterPoint: 0, explanation: 'The shelter recorded 15 dog arrivals and gave each dog space to settle.' }));
  await expect(reviseOrderedSlide(original, 'signals', 'Add useful explanation.', sources, cfg, signal(), { detailChange: 'expand' })).rejects.toMatchObject({ code: 'invalid_content', changed: false });
  const repair = JSON.parse(chatMock.mock.calls[1][2] as string);
  expect(repair.failureCode).toBe('invalid_content');
  expect(repair.correction).toContain('Do not invent numeric claims');
  expect(repair.allowedNumericalValues).toEqual(['12']);
  expect(repair.repairInstruction).not.toContain('overflowed');
  expect(JSON.stringify(original.slides[1])).toContain('12 dog');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('aborts after a delayed first candidate without repairing or changing the deck', async () => {
  const original = deck(concise);
  const before = structuredClone(original);
  const controller = new AbortController();
  chatMock.mockImplementationOnce(async () => { controller.abort(); return JSON.stringify({ afterPoint: 0, explanation: 'Their surroundings help observers understand what those signals mean.' }); });
  await expect(reviseOrderedSlide(original, 'signals', 'Explain this more.', sources, cfg, controller.signal, { detailChange: 'expand' })).rejects.toMatchObject({ name: 'AbortError' });
  expect(chatMock).toHaveBeenCalledTimes(1);
  expect(original).toEqual(before);
});

it('exports a fitting repaired expansion at the original font size while preserving every unrelated slide', async () => {
  const original = deck(concise);
  chatMock.mockResolvedValueOnce(JSON.stringify(concise)).mockResolvedValueOnce(JSON.stringify({ afterPoint: 1, explanation: 'Following the direction of attention helps observers notice which nearby changes may matter to the dog.' }));
  const revised = await reviseOrderedSlide(original, 'signals', 'Add more context.', sources, cfg, signal(), { detailChange: 'expand' });
  const folder = await mkdtemp(path.join(tmpdir(), 'insight-direction-'));
  const oldPath = path.join(folder, 'before.pptx'), newPath = path.join(folder, 'after.pptx');
  await writeOrderedDeck(original, sources, oldPath);
  await writeOrderedDeck(revised, sources, newPath);
  const oldZip = await JSZip.loadAsync(await readFile(oldPath)), newZip = await JSZip.loadAsync(await readFile(newPath));
  for (const slide of [1, 3]) expect(await newZip.file(`ppt/slides/slide${slide}.xml`)!.async('string')).toBe(await oldZip.file(`ppt/slides/slide${slide}.xml`)!.async('string'));
  const editedXml = await newZip.file('ppt/slides/slide2.xml')!.async('string');
  expect(editedXml).toContain('Following the direction of attention');
  expect(editedXml).toContain('sz="2400"');
  expect(editedXml).not.toContain('sz="2160"');
  expect(revised.textScale).toBe(original.textScale);
  expect(revised.slides[1].textScale).toBeUndefined();
});

it('accepts a complete source-preserving explanation instead of requiring a percentage rewrite', async () => {
  const original = deck(concise);
  const explanation = 'Their surroundings help observers understand what those signals mean.';
  chatMock.mockResolvedValueOnce(JSON.stringify(concise))
    .mockResolvedValueOnce(JSON.stringify({ afterPoint: 1, explanation }));
  const revised = await reviseOrderedSlide(original, 'signals', 'Explain the setting too.', sources, cfg, signal(), { detailChange: 'expand' });
  expect(JSON.stringify(revised.slides[1])).toContain(explanation);
  for (const point of (concise as Extract<OrderedPresentationSlide, {type:'text'}>).points)
    expect(JSON.stringify(revised.slides[1])).toContain(point);
  expect(revised.slides.filter(slide => slide.id !== 'signals')).toEqual(original.slides.filter(slide => slide.id !== 'signals'));
  expect(() => assertOrderedDeckFits(revised)).not.toThrow();
});

it.each(['proposed', 'planned', 'hypothetical', 'unverified', 'unconfirmed', 'unmeasured'])('does not erase %s status to meet a shortening target', async term => {
  const original = deck({ id: 'signals', type: 'text', title: 'Community plan', points: [
    `The ${term} community garden project invites residents to discuss which benefits and activities would meet their needs before choosing a public message.`,
  ] });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Community plan', points: ['Discuss residents’ needs before choosing a public message for the community garden project.'] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Shorten the explanation.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('source-status words');
  expect(JSON.stringify(original.slides[1])).toContain(term);
});

it('rejects an invented factual number in an additive repair', async () => {
  const original = deck(concise), before = structuredClone(original);
  chatMock.mockResolvedValueOnce(JSON.stringify(concise))
    .mockResolvedValueOnce(JSON.stringify({ afterPoint: 0, explanation: 'Observers recorded 47 distinct signals during their extended study of the dogs.' }));
  await expect(reviseOrderedSlide(original, 'signals', 'Add an explanation.', sources, cfg, signal(), { detailChange: 'expand' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(original).toEqual(before);
});

it('uses the second bounded addition attempt to repair numeric fabrication and retains the source verbatim', async () => {
  const original = deck(concise), before = structuredClone(original);
  chatMock.mockImplementationOnce(async (_cfg, _system, payload, _signal, _model, _json, _tokens, contract) => {
    expect(contract?.name).toBe('PresentationAddition');
    expect(JSON.parse(payload as string).allowedNumericalValues).toEqual([]);
    return JSON.stringify({ afterPoint: 1, explanation: 'The dog can detect sounds at 47 metres during this observation.' });
  }).mockImplementationOnce(async (_cfg, system, payload, _signal, _model, _json, _tokens, contract) => {
    const request = JSON.parse(payload as string);
    expect(system).toContain('REPAIR MODE');
    expect(contract?.name).toBe('PresentationAddition');
    expect(request.failureCode).toBe('invalid_content');
    expect(request.correction).toContain('Do not invent numeric claims');
    return JSON.stringify({ afterPoint: 1, explanation: 'Their surroundings help observers understand what those signals mean.' });
  });
  const revised = await reviseOrderedSlide(original, 'signals', 'Add context.', sources, cfg, signal(), { detailChange: 'expand' });
  for (const point of (concise as Extract<OrderedPresentationSlide, { type: 'text' }>).points)
    expect(JSON.stringify(revised.slides[1])).toContain(point);
  expect(JSON.stringify(revised)).not.toContain('47');
  expect(original).toEqual(before);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('shortens wordier paragraphs while keeping a compact protected paragraph unchanged', async () => {
  const compactPoint = 'Keep the proposed budget at 12 dollars.';
  const original = deck({ id: 'signals', type: 'text', title: 'Community plan', points: [
    'The team should ask residents about their needs before choosing language for the invitation, so its practical benefits are explained using words residents understand.',
    compactPoint,
  ] });
  chatMock.mockImplementationOnce(async (_cfg, system, payload) => {
    const request = JSON.parse(payload as string);
    expect(system).toContain('Preserve every supplied point exactly once');
    expect(system).toContain('An already concise paragraph may remain unchanged');
    expect(request.paragraphs.map((paragraph: { pointId: string }) => paragraph.pointId)).toEqual(['point-1', 'point-2']);
    for (const paragraph of request.paragraphs) expect(paragraph).not.toHaveProperty('maximumWords');
    expect(request.paragraphs[1]).toMatchObject({ preserveSourceStatusWords: ['proposed'], preserveNumericalValues: ['12'] });
    return JSON.stringify({ title: 'Community plan', points: [
      'Ask residents about their needs to explain invitation benefits in familiar language.',
      compactPoint,
    ] });
  });
  const revised = await reviseOrderedSlide(original, 'signals', 'Tighten the wording.', sources, cfg, signal(), { detailChange: 'shorten' });
  expect(revised.slides[1]).toMatchObject({ points: [expect.any(String), compactPoint] });
  expect(orderedSlideBodyWordCount(revised.slides[1])).toBeLessThanOrEqual(Math.floor(orderedSlideBodyWordCount(original.slides[1]) * 0.8));
  expect(revised.slides.filter(slide => slide.id !== 'signals')).toEqual(original.slides.filter(slide => slide.id !== 'signals'));
  expect(chatMock).toHaveBeenCalledTimes(1);
});

const ordinarySource = [
  'Ask local residents what they want from a shared garden before choosing the invitation language. Their answers help the team describe practical benefits in words that feel familiar.',
  'Keep the proposed audience description beside the campaign brief so reviewers can check whether each message speaks to the same people.',
];
const modestConcision = [
  'Ask residents what they want from a shared garden before choosing invitation language. Their answers help the team describe practical benefits in familiar words.',
  ordinarySource[1],
];

it('accepts useful ordinary concision below twenty percent and reports actual body counts', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Audience Needs', points: ordinarySource });
  chatMock.mockImplementationOnce(async (_cfg, system, payload, _signal, _model, _json, _tokens, _contract, purpose) => {
    const request = JSON.parse(payload as string);
    expect(system).toContain('no mandatory percentage reduction');
    expect(request).not.toHaveProperty('explicitUserLengthConstraints');
    expect(request.maximumTotalWords).toBe(48);
    expect(purpose).toEqual({ purpose: 'writing' });
    return JSON.stringify({ title: 'Audience Needs', points: modestConcision });
  });
  const result = await reviseOrderedSlide(original, 'signals', 'Tighten this slide.', sources, cfg, signal(), { detailChange: 'shorten' });
  expect(orderedSlideBodyWordCount(original.slides[1])).toBe(49);
  expect(orderedSlideBodyWordCount(result.slides[1])).toBe(45);
  expect(result.slides.filter(slide => slide.id !== 'signals')).toEqual(original.slides.filter(slide => slide.id !== 'signals'));
  expect(reviewMock).not.toHaveBeenCalled();
});

it.each([{ maximumWords: 44 }, { reductionPercent: 10 }, { maximumWords: 46, reductionPercent: 10 }])('honors explicit shortening constraints %j even when ordinary concision would succeed', async constraints => {
  const original = deck({ id: 'signals', type: 'text', title: 'Audience Needs', points: ordinarySource });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Audience Needs', points: modestConcision }));
  await expect(reviseOrderedSlide(original, 'signals', 'Apply the specified length limit.', sources, cfg, signal(), { detailChange: 'shorten', ...constraints }))
    .rejects.toMatchObject({ code: 'no_meaningful_change', changed: false });
  const first = JSON.parse(chatMock.mock.calls[0][2] as string), repair = JSON.parse(chatMock.mock.calls[1][2] as string);
  expect(first.explicitUserLengthConstraints).toEqual(constraints);
  expect(first.maximumTotalWords).toBe(44);
  expect(repair.repair.validationFailures.join(' ')).toContain("user's explicit length constraint requires at most 44");
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('rejects title-only shortening and reports a repeated editor failure without blaming the request', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Audience Needs', points: ordinarySource });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'A different title', points: ordinarySource }));
  const error = await reviseOrderedSlide(original, 'signals', 'Tighten this slide.', sources, cfg, signal(), { detailChange: 'shorten' }).catch(error => error);
  expect(error).toMatchObject({ code: 'no_meaningful_change', changed: false });
  expect(error.cause.message).toContain('editing model repeated its rejected candidate');
  expect(error.message).toContain('The editor could not produce');
  expect(error.message).not.toContain('Tell me');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('reviews each valid candidate against its original source and repairs only the reported loss', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Evidence', points: [
    'The team has not measured outcomes, so invitations must not promise benefits that have not been verified.',
  ] });
  chatMock.mockResolvedValueOnce(JSON.stringify({ title: 'Evidence', points: ['Invitations promise benefits.'] }))
    .mockResolvedValueOnce(JSON.stringify({ title: 'Evidence', points: ['Do not promise benefits while outcomes remain unmeasured.'] }));
  reviewMock.mockResolvedValueOnce({ passed: false, issues: [{ kind: 'negation_change', description: 'The prohibition on promising benefits became permission.', sourceQuote: 'must not promise benefits', candidateQuote: 'Invitations promise benefits.' }] })
    .mockResolvedValueOnce({ passed: true, issues: [] });
  const result = await reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, { ...cfg, hfWritingReviewEnabled: true }, signal(), { detailChange: 'shorten' });
  expect(result.slides[1]).toMatchObject({ points: ['Do not promise benefits while outcomes remain unmeasured.'] });
  expect(reviewMock).toHaveBeenCalledTimes(2);
  for (const [input] of reviewMock.mock.calls) expect(input.original).toEqual(original.slides[1]);
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('negation_change');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('fails closed when optional quality review is unavailable and never publishes unreviewed copy', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Audience Needs', points: ordinarySource });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Audience Needs', points: modestConcision }));
  reviewMock.mockRejectedValue(new Error('Quality provider unavailable.'));
  const before = structuredClone(original);
  await expect(reviseOrderedSlide(original, 'signals', 'Tighten this slide.', sources, { ...cfg, hfWritingReviewEnabled: true }, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(original).toEqual(before);
  expect(chatMock).toHaveBeenCalledTimes(2);
  // The repair repeated exactly, so it cannot consume another review or commit.
  expect(reviewMock).toHaveBeenCalledTimes(1);
});

it('rejects oversized review evidence before inference instead of silently dropping source qualifications', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Audience Needs', points: ordinarySource });
  const before = structuredClone(original);
  await expect(reviseOrderedSlide(original, 'signals', 'Tighten this slide.', { ...sources, brief: 'a'.repeat(16001) }, { ...cfg, hfWritingReviewEnabled: true }, signal(), { detailChange: 'shorten' }))
    .rejects.toThrow('source notes are too long for a complete revision review');
  expect(original).toEqual(before);
  expect(chatMock).not.toHaveBeenCalled();
  expect(reviewMock).not.toHaveBeenCalled();
});

it('rejects moving a proposal qualifier to a different point even when the slide retains the word', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Community plan', points: [
    'The proposed garden invites residents to discuss useful activities before choosing a message.',
    'The confirmed workshop welcomes local residents to discuss useful activities before choosing a message.',
  ] });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Community plan', points: [
    'The garden invites residents.', 'The proposed workshop welcomes residents.',
  ] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('source paragraph 1');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('rejects swapping factual numbers between points even when the slide retains both numbers', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Community budget', points: [
    'The garden budget contains 12 dollars to pay for supplies needed for the activity.',
    'The workshop budget contains 24 dollars to pay for supplies needed for the activity.',
  ] });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Community budget', points: [
    'The garden supplies budget is 24 dollars.', 'The workshop supplies budget is 12 dollars.',
  ] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('factual number in source paragraph 1');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it.each(['can', 'may', 'might', 'could'])('does not replace %s possibility with an unconditional claim', async term => {
  const original = deck({ id: 'signals', type: 'text', title: 'Weather conditions', points: [
    `Weather conditions ${term} change the rate at which water evaporates from an exposed surface.`,
  ] });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Weather conditions', points: ['Weather conditions change evaporation rates.'] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain(`source-status words ${term}`);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('does not strengthen partial causation to an unconditional cause', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Precipitation', points: [
    'Temperature along the path to the ground helps determine whether precipitation arrives as rain or snow.',
  ] });
  chatMock.mockResolvedValue(JSON.stringify({ title: 'Precipitation', points: ['Path temperature determines rain or snow.'] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('source-status words helps');
});

it('distinguishes noun can and month May from auxiliary qualification markers', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Recycling workshop', points: [
    'Put empty cans inside a can container until the recycling collection arrives.',
    'The May workshop asks participants to discuss ideas before they agree on the project plan.',
  ] });
  chatMock.mockImplementationOnce(async (_cfg, _system, payload) => {
    const request = JSON.parse(payload as string);
    expect(request.paragraphs.every((point: { preserveSourceStatusWords: string[] }) => point.preserveSourceStatusWords.length === 0)).toBe(true);
    return JSON.stringify({ title: 'Recycling workshop', points: [
      'Keep empty cans in a container until recycling collection.',
      'Discuss ideas at the May workshop before agreeing the plan.',
    ] });
  });
  const result = await reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' });
  expect(result.slides[1]).toMatchObject({ points: ['Keep empty cans in a container until recycling collection.', 'Discuss ideas at the May workshop before agreeing the plan.'] });
  expect(chatMock).toHaveBeenCalledTimes(1);
});

it('rejects truncated shortening even if its word count satisfies the requested reduction', async () => {
  const original = deck(concise);
  chatMock.mockResolvedValue(JSON.stringify({ title: concise.title, points: ['Dogs signal feelings', 'Ears signal attention.', 'Posture may show calm.'] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Shorten the explanation.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('never cut off words or clauses');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('accepts a complete short sentence without applying the expansion minimum', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Preparation', points: ['It is important to read the brief carefully before you start.'] });
  chatMock.mockResolvedValueOnce(JSON.stringify({ title: 'Preparation', points: ['Read the brief before starting.'] }));
  const revised = await reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' });
  expect(revised.slides[1]).toMatchObject({ points: ['Read the brief before starting.'] });
});

it('does not force sentence punctuation onto intentionally fragment-based source points', async () => {
  const original = deck({ id: 'signals', type: 'text', title: 'Preparation', points: ['Review the customer needs and the message'] });
  chatMock.mockResolvedValueOnce(JSON.stringify({ title: 'Preparation', points: ['Review customer needs and message'] }));
  const revised = await reviseOrderedSlide(original, 'signals', 'Make this concise.', sources, cfg, signal(), { detailChange: 'shorten' });
  expect(revised.slides[1]).toMatchObject({ points: ['Review customer needs and message'] });
});

it('rejects dropping an entire source point even when the output meets the total word limit', async () => {
  const original = deck(concise), before = structuredClone(original);
  chatMock.mockResolvedValue(JSON.stringify({ title: concise.title, points: ['Dogs use movement to show feelings.'] }));
  await expect(reviseOrderedSlide(original, 'signals', 'Shorten the explanation.', sources, cfg, signal(), { detailChange: 'shorten' }))
    .rejects.toMatchObject({ code: 'invalid_content', changed: false });
  expect(JSON.parse(chatMock.mock.calls[1][2] as string).repair.validationFailures.join(' ')).toContain('Preserve every source paragraph');
  expect(original).toEqual(before);
});
