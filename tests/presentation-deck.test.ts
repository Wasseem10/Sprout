import { beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadImage } from '@napi-rs/canvas';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import {
  assertOrderedDeckFits,
  generateSummarySlide,
  planOrderedDeck,
  reviseOrderedSlide,
  orderedSlideBodyWordCount,
  writeOrderedDeck,
} from '../server/computer/presentation-deck';
import {
  orderedPresentationDeckSchema,
  legacyDeckProjection,
  toOrderedDeck,
  validateOrderedSources,
  type OrderedPresentationDeck,
} from '../shared/presentation-deck';
import type { DeckSources } from '../server/computer/presentation-project';
import { PresentationProjectError } from '../server/computer/presentation-project';

vi.mock('../server/computer/planner', () => ({ chat: vi.fn() }));
const chatMock = vi.mocked(chat);
const JSZip = createRequire(import.meta.url)('jszip');
const cfg = { ...config(), hfToken: 'test', cloudUrl: '' };
const signal = () => new AbortController().signal;
const processSlide = {
  id: 'process',
  type: 'process' as const,
  title: 'Proposed campaign process',
  stages: [
    { label: 'Prepare', detail: 'Confirm audience and message.' },
    { label: 'Publish', detail: 'Launch the campaign.' },
    { label: 'Review', detail: 'Review results before the next campaign.' },
  ],
};
function deck(): OrderedPresentationDeck {
  return {
    schemaVersion: 2,
    title: 'Cyber Monday',
    theme: 'dark',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      {
        id: 'cover',
        type: 'cover',
        title: 'Cyber Monday',
        subtitle: 'A proposed marketing campaign',
        imageId: 1,
      },
      {
        id: 'audience',
        type: 'text',
        title: 'Audience',
        points: ['Reach customers interested in the offer.', 'Make the terms easy to understand.'],
      },
      {
        id: 'message',
        type: 'text',
        title: 'Message',
        points: ['Explain what the product does.', 'Use a clear call to action.'],
      },
      {
        id: 'channels',
        type: 'text',
        title: 'Channels',
        points: [
          'Coordinate email and website messaging.',
          'Review the campaign on a mobile screen.',
        ],
      },
      {
        id: 'review',
        type: 'text',
        title: 'Review',
        points: [
          'Check the content before launch.',
          'Use verified results in shareholder reports.',
        ],
      },
      processSlide,
    ],
  };
}
function informativeDeck(): OrderedPresentationDeck {
  const input = deck();
  input.slides[0] = { ...input.slides[0], type: 'cover', subtitle: 'A proposed campaign that connects a clear customer offer with a practical publishing and review process.' };
  const content = [
    ['Identify the customer need before writing the offer, so the proposed campaign explains a useful benefit instead of relying on urgency alone.', 'Use a short audience description to choose relevant examples and remove claims that would confuse people encountering the product for the first time.'],
    ['Explain what the product does and state the offer conditions beside the main action, helping visitors decide whether it meets their needs.', 'Keep the proposed message consistent across the landing page and announcement so customers understand what happens after they choose to continue.'],
    ['Coordinate the email announcement with the website update, using matching language and a destination that delivers the information promised in the message.', 'Check the proposed campaign on a mobile screen and with keyboard navigation before sharing it, so the path remains usable across common devices.'],
    ['Ask a teammate to follow the complete visitor path before launch, checking whether links, offer conditions and the final action are clear.', 'After the campaign, use verified results to identify where customers stopped and decide which part of the message or experience needs another revision.'],
  ];
  for (let index = 1; index <= 4; index++) input.slides[index] = { id: input.slides[index].id, title: input.slides[index].title, type: 'text', points: content[index - 1] };
  input.slides[5] = { ...processSlide, stages: [
    { label: 'Prepare', detail: 'Confirm the audience and draft a message with clear offer conditions.' },
    { label: 'Publish', detail: 'Check the proposed campaign with a teammate before sharing the announcement.' },
    { label: 'Review', detail: 'Compare verified results with the planned customer path before choosing revisions.' },
  ] };
  return input;
}
async function sources(): Promise<DeckSources> {
  const bytes = await readFile(path.resolve('artifacts/workspace.png'));
  const image = await loadImage(bytes);
  return {
    root: 'test-only',
    brief: 'Proposed marketing campaign, without financial results.',
    briefName: null,
    assets: [
      {
        id: 1,
        filename: 'marketing.png',
        description: 'Synthetic test screenshot.',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        data: `data:image/png;base64,${bytes.toString('base64')}`,
        preview: '',
        width: image.width,
        height: image.height,
      },
    ],
  };
}
beforeEach(() => vi.clearAllMocks());

it('migrates a legacy project with stable slide IDs and preserves all original content', () => {
  const legacy = {
    title: 'Legacy deck',
    subtitle: 'Original subtitle',
    theme: 'blue' as const,
    slides: [
      {
        title: 'Original image',
        imageId: 1,
        points: ['Original first point', 'Original second point'],
      },
    ],
    diagram: { title: processSlide.title, stages: processSlide.stages },
  };
  expect(toOrderedDeck(legacy)).toEqual(toOrderedDeck(legacy));
  expect(toOrderedDeck(legacy).slides).toHaveLength(3);
  expect(legacyDeckProjection(toOrderedDeck(legacy))).toEqual(legacy);
});

it('validates three through ten slides independently of the image count', () => {
  for (let count = 3; count <= 10; count++) {
    const value = {
      ...deck(),
      slides: [
        deck().slides[0],
        ...Array.from({ length: count - 2 }, (_, i) => ({
          id: `text-${i}`,
          type: 'text',
          title: 'Campaign',
          points: ['Proposed campaign content.'],
        })),
        processSlide,
      ],
    };
    expect(orderedPresentationDeckSchema.parse(value).slides).toHaveLength(count);
    validateOrderedSources(value as OrderedPresentationDeck, [1]);
  }
  expect(
    orderedPresentationDeckSchema.safeParse({ ...deck(), slides: deck().slides.slice(0, 2) })
      .success,
  ).toBe(false);
});

it('rejects missing sources, duplicate stable IDs and unrequested image reuse', () => {
  expect(() => validateOrderedSources(deck(), [])).toThrow('not available');
  expect(
    orderedPresentationDeckSchema.safeParse({
      ...deck(),
      slides: [deck().slides[0], { ...deck().slides[1], id: 'cover' }, processSlide],
    }).success,
  ).toBe(false);
  const duplicate = {
    ...deck(),
    slides: [
      ...deck().slides.slice(0, 5),
      {
        id: 'image-again',
        type: 'image',
        title: 'Repeat',
        imageId: 1,
        caption: '',
        layout: 'large',
      },
    ],
  };
  expect(orderedPresentationDeckSchema.safeParse(duplicate).success).toBe(false);
  expect(
    orderedPresentationDeckSchema.safeParse({ ...duplicate, allowImageReuse: true }).success,
  ).toBe(true);
});

it('plans exactly six slots with the one source picture on slide one, independent of model IDs', async () => {
  chatMock.mockImplementationOnce(async (_cfg, _system, payload) => {
    const slots = JSON.parse(payload as string).slots;
    return JSON.stringify({
      ...informativeDeck(),
      slides: slots.map((slot: any, index: number) => ({
        ...informativeDeck().slides[index],
        id: 'wrong-model-id',
        ...(slot.type === 'text' ? { type: 'text' } : {}),
      })),
    });
  });
  const result = await planOrderedDeck(
    { topic: 'Cyber Monday', totalSlides: 6, imageDestination: 1, theme: 'dark' },
    await sources(),
    cfg,
    signal(),
  );
  expect(result.slides).toHaveLength(6);
  expect(result.slides[0]).toMatchObject({ type: 'cover', imageId: 1 });
  expect(result.slides.filter((slide) => 'imageId' in slide)).toHaveLength(1);
  expect(new Set(result.slides.map((slide) => slide.id)).size).toBe(6);
});

it('repairs all thin generation slots together and carries the rejected candidate into the bounded repair', async () => {
  chatMock.mockImplementation(async (_cfg, _system, payload) => {
    const request = JSON.parse(payload as string);
    const candidate = request.correction ? informativeDeck() : deck();
    if (request.correction) {
      expect(request.correction).toMatch(/Slide 2 is too thin/);
      expect(request.correction).toMatch(/Slide 5 is too thin/);
      expect(request.previousAttempt).toContain('Reach customers');
    }
    return JSON.stringify({ ...candidate, slides: request.slots.map((slot: any, index: number) => ({ ...candidate.slides[index], ...slot })) });
  });
  const result = await planOrderedDeck({ topic: 'Cyber Monday', totalSlides: 6, imageDestination: 1 }, await sources(), cfg, signal());
  expect(result.slides.slice(1, 5).every((slide) => orderedSlideBodyWordCount(slide) >= 36)).toBe(true);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('rejects duplicate content across otherwise full slides', async () => {
  chatMock.mockImplementation(async (_cfg, _system, payload) => {
    const request = JSON.parse(payload as string);
    const candidate = informativeDeck();
    if (candidate.slides[1].type === 'text' && candidate.slides[2].type === 'text') candidate.slides[2].points = [...candidate.slides[1].points];
    return JSON.stringify({ ...candidate, slides: request.slots.map((slot: any, index: number) => ({ ...candidate.slides[index], ...slot })) });
  });
  await expect(planOrderedDeck({ topic: 'Cyber Monday', totalSlides: 6, imageDestination: 1 }, await sources(), cfg, signal())).rejects.toBeInstanceOf(PresentationProjectError);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('allows intentionally brief creation content independently of the visual theme', async () => {
  chatMock.mockImplementationOnce(async (_cfg, _system, payload) => {
    const request = JSON.parse(payload as string);
    expect(request.contentDensity).toBe('brief');
    const candidate = informativeDeck();
    for (const slide of candidate.slides) if (slide.type === 'text') slide.points = [slide.points[0]];
    return JSON.stringify({ ...candidate, slides: request.slots.map((slot: any, index: number) => ({ ...candidate.slides[index], ...slot })) });
  });
  const result = await planOrderedDeck({ topic: 'Cyber Monday', totalSlides: 6, imageDestination: 1, contentDensity: 'brief', theme: 'dark' }, await sources(), cfg, signal());
  expect(orderedSlideBodyWordCount(result.slides[1])).toBeLessThan(36);
  expect(result.theme).toBe('dark');
});

it('repairs a no-op expansion into substantive source-preserving explanation', async () => {
  const original = deck();
  const expanded = { afterPoint: 0, explanation: 'Explain the offer using familiar examples that help customers understand its practical purpose.' };
  chatMock.mockResolvedValueOnce(JSON.stringify({ afterPoint: 0, explanation: (original.slides[1] as { points: string[] }).points[0] })).mockResolvedValueOnce(JSON.stringify(expanded));
  const result = await reviseOrderedSlide(original, 'audience', 'Explain this more fully.', await sources(), cfg, signal(), { detailChange: 'expand' });
  expect(orderedSlideBodyWordCount(result.slides[1])).toBeGreaterThanOrEqual(orderedSlideBodyWordCount(original.slides[1]) + 8);
  expect(result.slides.filter((slide) => slide.id !== 'audience')).toEqual(original.slides.filter((slide) => slide.id !== 'audience'));
  const repair = JSON.parse(chatMock.mock.calls[1][2] as string);
  expect(repair.slide.points).toEqual((original.slides[1] as { points: string[] }).points);
  expect(repair.correction).toContain('repeats existing content');
  expect(repair.previousAttempt).toBeUndefined();
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it.each(['expand', 'shorten', 'preserve'] as const)('never reports an unchanged %s revision as success', async (detailChange) => {
  const original = informativeDeck();
  chatMock.mockResolvedValue(JSON.stringify(detailChange === 'expand'
    ? { afterPoint: 0, explanation: (original.slides[1] as { points: string[] }).points[0] }
    : original.slides[1]));
  await expect(reviseOrderedSlide(original, 'audience', 'Apply the requested revision.', await sources(), cfg, signal(), { detailChange })).rejects.toBeInstanceOf(PresentationProjectError);
  expect(original).toEqual(informativeDeck());
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('rejects an edit in the wrong detail direction even when its wording changed', async () => {
  const original = deck();
  chatMock.mockResolvedValue(JSON.stringify(informativeDeck().slides[1]));
  await expect(reviseOrderedSlide(original, 'audience', 'Reduce the detail.', await sources(), cfg, signal(), { detailChange: 'shorten' })).rejects.toBeInstanceOf(PresentationProjectError);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('shortens meaningfully while keeping factual numbers and other slides intact', async () => {
  const original = informativeDeck();
  original.slides[1] = { id: 'audience', type: 'text', title: 'Verified result', points: ['The verified campaign revenue was $500, which is the actual result available for this report.', 'The report should retain that verified value while explaining the proposed next step without making up additional results.'] };
  chatMock.mockResolvedValueOnce(JSON.stringify({ id: 'audience', type: 'text', title: 'Verified result', points: ['Verified campaign revenue was $500.', 'Explain the proposed next step without inventing additional results.'] }));
  const result = await reviseOrderedSlide(original, 'audience', 'Make this concise.', await sources(), cfg, signal(), { detailChange: 'shorten' });
  expect(orderedSlideBodyWordCount(result.slides[1])).toBeLessThanOrEqual(orderedSlideBodyWordCount(original.slides[1]) * 0.8);
  expect(JSON.stringify(result.slides[1])).toContain('$500');
  expect(result.slides.slice(2)).toEqual(original.slides.slice(2));
});

it('uses a bounded measured budget and repairs oversized copy without changing inherited font size or numbers', async () => {
  const original = informativeDeck();
  original.slides[1] = { id: 'audience', type: 'text', title: 'Verified campaign report', points: [
    'The verified campaign revenue was $500, which is the actual result available for this report.',
    'The report should retain that verified value while explaining the proposed next step without making up additional results.',
    'Review the customer journey before choosing a change so the proposal addresses a clear problem in the experience.',
  ] };
  const oversized = { afterPoint: 1, explanation: 'This paragraph repeats an explanation without useful changes. '.repeat(8) };
  chatMock.mockImplementation(async (_cfg, system, payload) => {
    const request = JSON.parse(payload as string);
    if (!request.correction) {
      expect(request.task).toMatch(/standalone explanation of \d+-\d+ words/);
      expect(request.allowedNumericalValues).toContain('$500');
    }
    expect(system).toContain('at most 240 characters');
    expect(request.copyBudget).toBeUndefined();
    expect(request.layoutBudget).toBeUndefined();
    if (request.correction) {
      expect(system).toContain('REPAIR MODE');
      expect(request.correction).toContain('bounded explanation sentence');
      expect(request.repairInstruction).toContain('Preserve the requested direction and original facts');
      expect(system).not.toContain('do not expand it');
      expect(request.failureCode).toBe('invalid_content');
      expect(request.request).toBe('Explain the result further.');
      return JSON.stringify({ afterPoint: 1, explanation: 'This distinction helps reviewers understand which statements describe evidence and which suggest future action.' });
    }
    return JSON.stringify(oversized);
  });
  const result = await reviseOrderedSlide(original, 'audience', 'Explain the result further.', await sources(), cfg, signal(), { detailChange: 'expand' });
  expect(orderedSlideBodyWordCount(result.slides[1])).toBeGreaterThan(orderedSlideBodyWordCount(original.slides[1]) + 7);
  expect(result.slides[1].textScale).toBeUndefined();
  expect(JSON.stringify(result.slides[1])).toContain('$500');
  expect(result.slides.filter(slide => slide.id !== 'audience')).toEqual(original.slides.filter(slide => slide.id !== 'audience'));
});

it('rejects numeric fabrication during expansion even when the extra wording fits', async () => {
  const original = deck();
  chatMock.mockResolvedValue(JSON.stringify({ afterPoint: 0, explanation: 'The campaign generated $900 in revenue through this audience engagement strategy.' }));
  await expect(reviseOrderedSlide(original, 'audience', 'Explain the audience further.', await sources(), cfg, signal(), { detailChange: 'expand' })).rejects.toThrow('preserving the slide facts');
  expect(original).toEqual(deck());
});

it('applies content-only output while retaining slide identity, inherited style and all other slides', async () => {
  const original = deck();
  const replacement = informativeDeck().slides[1];
  if (replacement.type !== 'text') throw new Error('Expected text fixture');
  chatMock.mockImplementationOnce(async (_cfg, system) => {
    expect(system).toContain('Return only JSON');
    expect(system).toContain('"points"');
    return JSON.stringify({ points: replacement.points });
  });
  const result = await reviseOrderedSlide(original, 'audience', 'Rephrase the content.', await sources(), cfg, signal(), { detailChange: 'preserve' });
  expect(result.slides[1]).toMatchObject({ id: 'audience', type: 'text', title: original.slides[1].title, points: replacement.points });
  expect(result.slides[1].textScale).toBeUndefined();
  expect(result.slides.filter(slide => slide.id !== 'audience')).toEqual(original.slides.filter(slide => slide.id !== 'audience'));
});

it('ignores repeated provider metadata without spending the repair attempt on application-owned fields', async () => {
  const original = deck();
  const replacement = informativeDeck().slides[1];
  chatMock.mockResolvedValueOnce(JSON.stringify({ ...replacement, id: 'invented', type: 'cover', imageId: 99, layout: 'default', textScale: 0.1 }));
  const result = await reviseOrderedSlide(original, 'audience', 'Rephrase the audience.', await sources(), cfg, signal(), { detailChange: 'preserve' });
  expect(result.slides[1]).toMatchObject({ id: 'audience', type: 'text' });
  expect(result.slides[1]).not.toHaveProperty('layout');
  expect(result.slides[1]).not.toHaveProperty('imageId');
  expect(result.slides[1].textScale).toBeUndefined();
  expect(chatMock).toHaveBeenCalledTimes(1);
});

it('preserves visual styling when a copy model tries to change layout, image side or title size', async () => {
  const original = deck();
  original.slides[0] = { id: 'cover', type: 'cover', title: 'Campaign', subtitle: 'A proposed marketing plan.' };
  original.slides[1] = { id: 'audience', type: 'image', title: 'Audience', imageId: 1,
    layout: 'split', imageSide: 'left', titleScale: 1.1, textScale: 0.95,
    imageDescription: 'The user corrected this description of the campaign image.',
    caption: 'A supplied campaign image.', points: ['Explain the offer clearly so readers can decide whether it is useful.'] };
  chatMock.mockImplementationOnce(async (_cfg, _system, payload) => {
    const request = JSON.parse(payload as string);
    expect(request.slide).not.toHaveProperty('imageSide');
    expect(request.slide).not.toHaveProperty('titleScale');
    expect(request.slide).not.toHaveProperty('imageDescription');
    return JSON.stringify({ title: 'Audience', caption: 'A supplied campaign image.',
      points: ['Describe the offer clearly so people can judge its usefulness.'],
      layout: 'large', imageSide: 'right', titleScale: 0.9, textScale: 0.1, imageId: 99, imageDescription: 'An invented replacement description.' });
  });
  const result = await reviseOrderedSlide(original, 'audience', 'Rephrase the explanation.', await sources(), cfg, signal(), { detailChange: 'preserve' });
  expect(result.slides[1]).toMatchObject({ type: 'image', imageId: 1, layout: 'split', imageSide: 'left', titleScale: 1.1, textScale: 0.95,
    imageDescription: 'The user corrected this description of the campaign image.' });
  expect(result.slides.filter(slide => slide.id !== 'audience')).toEqual(original.slides.filter(slide => slide.id !== 'audience'));
});

it('rejects oversized schema-invalid paragraphs without offering them as a validated capacity recovery', async () => {
  const original = informativeDeck();
  chatMock.mockResolvedValue(JSON.stringify({ afterPoint: 0, explanation: 'A very long explanatory paragraph repeats its details across the slide without leaving enough space. '.repeat(4) }));
  await expect(reviseOrderedSlide(original, 'audience', 'Add more explanation.', await sources(), cfg, signal(), { detailChange: 'expand' })).rejects.toMatchObject({ code: 'invalid_content', validatedCandidate: undefined });
  expect(original).toEqual(informativeDeck());
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('expands the visible cover subtitle without inventing text paragraphs', async () => {
  const original = deck();
  chatMock.mockImplementationOnce(async (_cfg, system) => {
    expect(system).toContain('subtitle only');
    return JSON.stringify({ ...original.slides[0], subtitle: 'A proposed marketing campaign that explains the customer offer and outlines a practical approach to publishing and review.' });
  });
  const result = await reviseOrderedSlide(original, 'cover', 'Explain the purpose a little more.', await sources(), cfg, signal(), { detailChange: 'expand' });
  expect(result.slides[0]).toMatchObject({ type: 'cover', imageId: 1 });
  expect(result.slides.slice(1)).toEqual(original.slides.slice(1));
});

it('does not count invisible added points as expansion in a large-picture layout', async () => {
  const original = deck();
  original.slides[0] = { id: 'cover', type: 'cover', title: 'Campaign', subtitle: 'Campaign overview' };
  original.slides[1] = { id: 'audience', type: 'image', title: 'Campaign image', imageId: 1, layout: 'large', caption: 'The campaign planning image.' };
  const hidden = informativeDeck().slides[1];
  chatMock.mockResolvedValue(JSON.stringify({ ...original.slides[1], points: hidden.type === 'text' ? hidden.points : [] }));
  await expect(reviseOrderedSlide(original, 'audience', 'Explain the picture further.', await sources(), cfg, signal(), { detailChange: 'expand' })).rejects.toThrow('unchanged');
  expect(orderedSlideBodyWordCount(original.slides[1])).toBe(4);
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('rejects hallucinated source numbers without silently changing the requested count', async () => {
  chatMock.mockImplementation(async (_cfg, _system, payload) => {
    const slots = JSON.parse(payload as string).slots;
    return JSON.stringify({
      ...deck(),
      slides: slots.map((slot: any, index: number) => ({
        ...deck().slides[index],
        ...slot,
        title: index === 1 ? 'Revenue increased 75%' : deck().slides[index].title,
      })),
    });
  });
  await expect(
    planOrderedDeck(
      { topic: 'Cyber Monday', totalSlides: 6, imageDestination: 1 },
      await sources(),
      cfg,
      signal(),
    ),
  ).rejects.toThrow('existing deck is unchanged');
  expect(chatMock).toHaveBeenCalledTimes(2);
});

it('exposes a safe typed planning failure without model schema or response details', async () => {
  chatMock.mockResolvedValue(JSON.stringify({ unsafeModelField: 'private raw provider reply' }));
  try {
    await planOrderedDeck(
      { topic: 'Cyber Monday', totalSlides: 6, imageDestination: 1 },
      await sources(),
      cfg,
      signal(),
    );
    throw new Error('Expected a planning failure');
  } catch (error) {
    expect(error).toBeInstanceOf(PresentationProjectError);
    expect((error as Error).message).toContain('existing deck is unchanged');
    expect((error as Error).message).not.toMatch(
      /unsafeModelField|provider reply|Return exactly|schema/i,
    );
  }
});

it('gives typed user-facing feedback for unavailable source images and layout overflow', async () => {
  await expect(
    planOrderedDeck(
      { topic: 'Cyber Monday', sourceImage: 'missing.jpg' },
      await sources(),
      cfg,
      signal(),
    ),
  ).rejects.toBeInstanceOf(PresentationProjectError);
  const crowded = deck();
  crowded.slides[0] = {
    id: 'cover',
    type: 'cover',
    imageId: 1,
    title:
      'This intentionally very long title cannot fit with the requested large text and source picture',
    subtitle: 'A subtitle',
    textScale: 1.35,
  };
  expect(() => assertOrderedDeckFits(crowded)).toThrow(PresentationProjectError);
});

it('a scoped edit changes only its stable slide and preserves its source image and factual numbers', async () => {
  const original = deck();
  original.slides[1] = {
    id: 'audience',
    type: 'text',
    title: 'Results',
    points: ['Verified revenue was $500.', 'The campaign reached existing customers.'],
  };
  chatMock.mockResolvedValueOnce(
    JSON.stringify({
      id: 'invented',
      type: 'text',
      title: 'Results',
      points: ['Revenue: $500.', 'Reached existing customers.'],
    }),
  );
  const edited = await reviseOrderedSlide(
    original,
    'audience',
    'Make it less wordy',
    await sources(),
    cfg,
    signal(),
  );
  expect(edited.slides[1].id).toBe('audience');
  expect(edited.slides[1]).not.toEqual(original.slides[1]);
  expect(edited.slides.filter((slide) => slide.id !== 'audience')).toEqual(
    original.slides.filter((slide) => slide.id !== 'audience'),
  );
});

it('fails a shorten operation that drops existing financial values instead of falsifying the result', async () => {
  const original = deck();
  original.slides[1] = {
    id: 'audience',
    type: 'text',
    title: 'Results',
    points: ['Verified revenue was $500.'],
  };
  chatMock.mockResolvedValue(
    JSON.stringify({
      id: 'audience',
      type: 'text',
      title: 'Results',
      points: ['Revenue improved.'],
    }),
  );
  await expect(
    reviseOrderedSlide(original, 'audience', 'Make it short', await sources(), cfg, signal()),
  ).rejects.toThrow('preserving the slide facts');
  expect(original.slides[1]).toMatchObject({ points: ['Verified revenue was $500.'] });
});

it('keeps process stage identities and order while shortening wording and preserves unrelated exported slides', async () => {
  const original = deck();
  const assets = await sources();
  chatMock.mockImplementationOnce(async (_cfg, _system, payload) => {
    const supplied = JSON.parse(payload as string).slide;
    expect(supplied.stages.map((stage: any) => stage.stageId)).toEqual([
      'stage-1',
      'stage-2',
      'stage-3',
    ]);
    return JSON.stringify({
      ...supplied,
      stages: [...supplied.stages].reverse().map((stage: any) => ({
        ...stage,
        detail:
          stage.stageId === 'stage-1'
            ? 'Confirm audience and message.'
            : stage.stageId === 'stage-2'
              ? 'Launch campaign.'
              : 'Review before the next campaign.',
      })),
    });
  });
  const edited = await reviseOrderedSlide(
    original,
    'process',
    'Make the diagram wording shorter.',
    assets,
    cfg,
    signal(),
  );
  const process = edited.slides[5];
  expect(process.type).toBe('process');
  if (process.type !== 'process') throw new Error('Expected process slide');
  expect(process.stages.map((stage) => stage.label)).toEqual(['Prepare', 'Publish', 'Review']);
  expect(process.stages[1].detail).toBe('Launch campaign.');
  expect(process.stages).toHaveLength(3);
  expect(edited.slides.slice(0, 5)).toEqual(original.slides.slice(0, 5));
  const output = await mkdtemp(path.join(tmpdir(), 'insight-process-revision-'));
  await writeOrderedDeck(original, assets, path.join(output, 'before.pptx'));
  await writeOrderedDeck(edited, assets, path.join(output, 'after.pptx'));
  const before = await JSZip.loadAsync(await readFile(path.join(output, 'before.pptx')));
  const after = await JSZip.loadAsync(await readFile(path.join(output, 'after.pptx')));
  for (let index = 1; index <= 5; index++) {
    const entry = `ppt/slides/slide${index}.xml`;
    expect(await after.file(entry).async('string')).toBe(await before.file(entry).async('string'));
  }
  const xml = await after.file('ppt/slides/slide6.xml').async('string');
  expect(xml.indexOf('<a:t>Prepare</a:t>')).toBeLessThan(xml.indexOf('<a:t>Publish</a:t>'));
  expect(xml.indexOf('<a:t>Publish</a:t>')).toBeLessThan(xml.indexOf('<a:t>Review</a:t>'));
  expect(xml).toContain('Launch campaign.');
});

it.each(['extra', 'missing', 'duplicate'])(
  'rejects a wording-only process revision with %s stages rather than silently changing structure',
  async (problem) => {
    const original = deck();
    chatMock.mockImplementation(async (_cfg, _system, payload) => {
      const supplied = JSON.parse(payload as string).slide;
      const stages = [...supplied.stages];
      if (problem === 'extra')
        stages.push({ stageId: 'unrequested', label: 'New', detail: 'Added step.' });
      if (problem === 'missing') stages.pop();
      if (problem === 'duplicate') stages[2] = stages[0];
      return JSON.stringify({ ...supplied, stages });
    });
    await expect(
      reviseOrderedSlide(
        original,
        'process',
        'Make the text shorter.',
        await sources(),
        cfg,
        signal(),
      ),
    ).rejects.toBeInstanceOf(PresentationProjectError);
    expect(original).toEqual(deck());
    expect(chatMock).toHaveBeenCalledTimes(2);
  },
);

it('supports explicitly requested process structure edits through the typed structure mode', async () => {
  const original = deck();
  chatMock.mockResolvedValueOnce(
    JSON.stringify({
      ...processSlide,
      stages: [
        processSlide.stages[0],
        { label: 'Approve', detail: 'Approve before launch.' },
        ...processSlide.stages.slice(1),
      ],
    }),
  );
  const edited = await reviseOrderedSlide(
    original,
    'process',
    'Add an approval step before publishing.',
    await sources(),
    cfg,
    signal(),
    { processEdit: 'structure' },
  );
  const process = edited.slides[5];
  expect(process.type).toBe('process');
  if (process.type !== 'process') throw new Error('Expected process slide');
  expect(process.stages.map((stage) => stage.label)).toEqual([
    'Prepare',
    'Approve',
    'Publish',
    'Review',
  ]);
  expect(edited.slides.slice(0, 5)).toEqual(original.slides.slice(0, 5));
});

it('creates a summary from existing slide text with a fresh stable ID', async () => {
  chatMock.mockResolvedValueOnce(
    JSON.stringify({
      title: 'Summary',
      points: ['Use a clear campaign message.', 'Review the content before launch.'],
    }),
  );
  const summary = await generateSummarySlide(deck(), cfg, signal());
  expect(summary.type).toBe('text');
  expect(deck().slides.some((slide) => slide.id === summary.id)).toBe(false);
});

it('detects overflow at larger text sizes without silently shrinking the font', () => {
  const crowded = deck();
  crowded.slides[0] = {
    id: 'cover',
    type: 'cover',
    imageId: 1,
    title:
      'This intentionally very long title cannot fit with the requested large text and source picture',
    subtitle: 'A subtitle',
    textScale: 1.35,
  };
  expect(() => assertOrderedDeckFits(crowded)).toThrow('Shorten');
});

it.each(['blue', 'light', 'dark'] as const)(
  'writes six editable %s slides with one exact picture and consistent readable body text',
  async (theme) => {
    const output = path.join(
      await mkdtemp(path.join(tmpdir(), 'insight-ordered-')),
      'six-slides.pptx',
    );
    const input = { ...deck(), theme };
    const assets = await sources();
    await writeOrderedDeck(input, assets, output);
    const zip = await JSZip.loadAsync(await readFile(output));
    const slideNames = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
    expect(slideNames).toHaveLength(6);
    const slides = await Promise.all(slideNames.map((name) => zip.file(name).async('string')));
    expect(slides[0]).toContain('<p:pic>');
    expect(slides.slice(1).join('')).not.toContain('<p:pic>');
    expect(slides[1]).toContain('Audience');
    expect(slides[1]).toContain('sz="2400"');
    expect(slides[5]).toContain('Proposed campaign process');
    const media = Object.keys(zip.files).filter((name) => /^ppt\/media\/.*\.png$/.test(name));
    expect(media).toHaveLength(1);
    expect(
      createHash('sha256')
        .update(await zip.file(media[0]).async('nodebuffer'))
        .digest('hex'),
    ).toBe(assets.assets[0].sha256);
  },
);

it('writes native editable chart values with an embedded workbook and provenance in notes', async () => {
  const output = path.join(await mkdtemp(path.join(tmpdir(), 'insight-chart-')), 'chart.pptx');
  const input = deck();
  input.slides[3] = {
    id: 'verified-chart',
    type: 'chart',
    title: 'Verified sales',
    chart: {
      labels: ['Q2', 'Q3'],
      series: [{ name: 'Sales', values: [100, 150] }],
      unit: 'USD',
      provenance: {
        datasetId: 'fixture-data',
        revision: 2,
        verifiedAt: '2026-10-11T04:00:00.000Z',
        provider: 'databricks',
        queryRef: 'fixture-query',
        summary: 'Q2 $100; Q3 $150.',
      },
    },
  };
  await writeOrderedDeck(input, await sources(), output);
  const zip = await JSZip.loadAsync(await readFile(output));
  const manifest = await zip.file('[Content_Types].xml').async('string');
  for (const match of manifest.matchAll(/<Override\b[^>]*PartName="([^"]+)"/g))
    expect(
      zip.file(match[1].replace(/^\//, '')),
      `missing content-type part ${match[1]}`,
    ).not.toBeNull();
  const chartName = Object.keys(zip.files).find((name) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(name),
  )!;
  const xml = await zip.file(chartName).async('string');
  expect(xml).toContain('<c:v>100</c:v>');
  expect(xml).toContain('<c:v>150</c:v>');
  const workbook = Object.keys(zip.files).find((name) => /^ppt\/embeddings\/.*\.xlsx$/.test(name));
  expect(workbook).toBeTruthy();
  const xlsx = await JSZip.loadAsync(await zip.file(workbook).async('nodebuffer'));
  expect(await xlsx.file('xl/worksheets/sheet1.xml').async('string')).toContain('<v>150</v>');
  expect(await zip.file('ppt/notesSlides/notesSlide4.xml').async('string')).toContain(
    'fixture-data',
  );
});
