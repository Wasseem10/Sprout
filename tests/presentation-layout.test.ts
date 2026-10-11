import { afterEach, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { chat } from '../server/computer/planner';
import { planPictureDeck, type DeckSources } from '../server/computer/presentation-project';
import { pictureDeckSchema, type PictureDeck } from '../shared/presentation-project';

vi.mock('../server/computer/planner', () => ({ chat: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const deck: PictureDeck = {
  title: 'How Hackathons Work',
  subtitle: 'A proposed guide for a first-time team',
  theme: 'dark',
  slides: [1, 2, 3].map((imageId) => ({
    title: `Hackathon stage ${imageId}`,
    imageId,
    points: ['Choose a real problem', 'Build and demonstrate the proposed solution'],
  })),
  diagram: {
    title: 'Proposed hackathon workflow',
    stages: [
      { label: 'Define', detail: 'Choose the problem and scope' },
      { label: 'Build', detail: 'Implement the working prototype' },
      { label: 'Demonstrate', detail: 'Explain and show the solution' },
    ],
  },
};
const cfg = { ...config(), hfToken: 'test', cloudUrl: '' };
const signal = () => new AbortController().signal;
const sources = (count = 3): DeckSources => ({
  root: 'fixture',
  brief: '',
  briefName: null,
  originalRequest: 'Create a presentation about hackathons using my Marketing folder.',
  assets: Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    filename: `image-${index + 1}.png`,
    description: `Illustration ${index + 1}`,
    sha256: 'fixture',
    data: 'fixture',
    preview: 'fixture',
    width: 1,
    height: 1,
  })),
});

it('assigns duplicate model image references to known content slots without changing content', async () => {
  const candidate = {
    ...deck,
    slides: deck.slides.map((slide) => ({ ...slide, imageId: 1 })),
  };
  expect(pictureDeckSchema.safeParse(candidate).success).toBe(false);
  vi.mocked(chat).mockResolvedValue(JSON.stringify(candidate));
  const result = await planPictureDeck(
    'Use a dark theme for my hackathon deck.',
    sources(),
    cfg,
    signal(),
  );
  expect(result).toEqual(deck);
  expect(chat).toHaveBeenCalledTimes(1);
  const prompt = vi.mocked(chat).mock.calls[0];
  expect(prompt[1]).toContain('Do NOT put the cover or final diagram in slides');
  expect(
    JSON.parse(prompt[2] as string).contentSlideSlots.map((slot: any) => slot.imageId),
  ).toEqual([1, 2, 3]);
});

it.each([undefined, 6, 99, '1', null])(
  'binds a single picture to its sole content slot when model metadata is %s',
  async (imageId) => {
    const candidate = { ...deck, slides: [{ ...deck.slides[0], imageId }] };
    vi.mocked(chat).mockResolvedValue(JSON.stringify(candidate));
    const result = await planPictureDeck(
      'Make a hackathon deck in clean blue.',
      sources(1),
      cfg,
      signal(),
    );
    expect(result.slides).toEqual([deck.slides[0]]);
    expect(result.title).toBe('How Hackathons Work');
    expect(result.theme).toBe('blue');
    expect(chat).toHaveBeenCalledTimes(1);
  },
);

it('preserves a deliberate image swap during later diagram and text revisions', async () => {
  const previous = { ...deck, slides: [deck.slides[1], deck.slides[0], deck.slides[2]] };
  const candidate = structuredClone(previous);
  candidate.slides.forEach((slide, index) => {
    slide.imageId = index + 1;
  });
  candidate.diagram.stages.push({ label: 'Review', detail: 'Review the finished prototype' });
  candidate.theme = 'light';
  vi.mocked(chat).mockResolvedValue(JSON.stringify(candidate));
  const result = await planPictureDeck(
    'Add a review stage to the final diagram.',
    sources(),
    cfg,
    signal(),
    previous,
  );
  expect(result.slides).toEqual(previous.slides);
  expect(result.theme).toBe('dark');
  expect(result.diagram.stages.at(-1)?.label).toBe('Review');
  expect(
    JSON.parse(vi.mocked(chat).mock.calls[0][2] as string).contentSlideSlots.map(
      (slot: any) => slot.imageId,
    ),
  ).toEqual([2, 1, 3]);
});

it.each([
  ['Design preference: Dark minimal. From folder "Marketing".', 'dark'],
  ['Change the theme to clean blue.', 'blue'],
  ['Use a white design.', 'light'],
  ['Bright minimal.', 'light'],
])(
  'locks the explicit choice %s even when the model chooses another theme',
  async (request, theme) => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({ ...deck, theme: 'light' }));
    const result = await planPictureDeck(request, sources(), cfg, signal(), deck);
    expect(result.theme).toBe(theme);
    expect(result.slides).toEqual(deck.slides);
  },
);

it('does not treat a topic about dark matter as a theme correction', async () => {
  const previous = { ...deck, theme: 'blue' as const };
  vi.mocked(chat).mockResolvedValue(JSON.stringify({ ...deck, theme: 'dark' }));
  const result = await planPictureDeck(
    'Change the title to Learning About Dark Matter.',
    sources(),
    cfg,
    signal(),
    previous,
  );
  expect(result.theme).toBe('blue');
});

it('changes only the theme locally without rewriting content, diagram or swapped pictures', async () => {
  const previous = { ...deck, slides: [deck.slides[1], deck.slides[0], deck.slides[2]] };
  const result = await planPictureDeck(
    'Change the theme to clean blue; keep my content, diagram and pictures.',
    sources(),
    cfg,
    signal(),
    previous,
  );
  expect(result).toEqual({ ...previous, theme: 'blue' });
  expect(result).not.toBe(previous);
  expect(chat).not.toHaveBeenCalled();
});

it('still plans requested content edits alongside an explicit theme correction', async () => {
  const edited = structuredClone(deck);
  edited.diagram.stages.push({ label: 'Review', detail: 'Review the working prototype' });
  vi.mocked(chat).mockResolvedValue(JSON.stringify(edited));
  const result = await planPictureDeck(
    'Change the theme to clean blue and add a review stage to the diagram.',
    sources(),
    cfg,
    signal(),
    deck,
  );
  expect(result.theme).toBe('blue');
  expect(result.diagram.stages).toHaveLength(4);
  expect(chat).toHaveBeenCalledTimes(1);
});

it('repairs cover/diagram entries in the content array with the actual response and retained topic', async () => {
  const wrongCount = { ...deck, slides: deck.slides.map((slide) => ({ ...slide, imageId: 1 })) };
  const corrected = { ...deck, slides: [deck.slides[0]] };
  vi.mocked(chat)
    .mockResolvedValueOnce(JSON.stringify(wrongCount))
    .mockResolvedValueOnce(JSON.stringify(corrected));
  const request = 'Create a dark hackathon presentation using my one picture.';
  const result = await planPictureDeck(request, sources(1), cfg, signal());
  expect(result).toEqual(corrected);
  const retry = vi.mocked(chat).mock.calls[1];
  expect(retry[1]).toContain('exactly 1 image content slides, but contained 3');
  expect(JSON.parse(retry[2] as string)).toMatchObject({
    request,
    originalUserInstructions: sources(1).originalRequest,
    responseToCorrect: wrongCount,
  });
});

it.each([0, 2])(
  'rejects persistent %s-slide responses for one picture without adding or discarding content',
  async (count) => {
    vi.mocked(chat).mockResolvedValue(
      JSON.stringify({ ...deck, slides: deck.slides.slice(0, count) }),
    );
    await expect(
      planPictureDeck('Use my one picture for a hackathon deck.', sources(1), cfg, signal()),
    ).rejects.toThrow('could not finish the slide layout');
    expect(chat).toHaveBeenCalledTimes(2);
  },
);

it('keeps text/layout validation strict after correcting image metadata', async () => {
  const candidate = {
    ...deck,
    slides: deck.slides.map((slide) => ({ ...slide, imageId: 99, points: [] })),
  };
  vi.mocked(chat).mockResolvedValue(JSON.stringify(candidate));
  await expect(
    planPictureDeck('Create a hackathon deck.', sources(), cfg, signal()),
  ).rejects.toThrow('Your existing deck is unchanged');
  expect(vi.mocked(chat).mock.calls[1][1]).toContain('slides.0.points');
});

it('rejects unsupported financial claims even when image references can be repaired', async () => {
  const candidate = structuredClone(deck);
  candidate.slides.forEach((slide) => {
    slide.imageId = 99;
  });
  candidate.slides[0].points[0] = 'Our hackathon achieved 92% success';
  vi.mocked(chat).mockResolvedValue(JSON.stringify(candidate));
  await expect(
    planPictureDeck('Create a hackathon deck.', sources(), cfg, signal()),
  ).rejects.toThrow('Unsupported factual values');
});
