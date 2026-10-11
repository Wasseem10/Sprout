import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { computerPlan } from '../server/computer/planner';
import type { ComputerState } from '../shared/computer';

afterEach(() => vi.unstubAllGlobals());

it('gives conversational follow-ups current calculations and exports without raw source rows', async () => {
  const cfg = {
    ...config(),
    hfToken: '',
    cloudUrl: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-context-')),
  };
  const controller = new ComputerController(cfg);
  await controller.init();
  try {
    await controller.importStudio(
      'operations.csv',
      await readFile('data/operations-synthetic.csv'),
      new AbortController().signal,
    );
    await controller.request('Wait, compare only the same locations', new AbortController().signal);
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: null,
                    clarification: 'The same-location comparison is 11.9% growth.',
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await computerPlan(
      'Can you remind me what we found?',
      controller.snapshot(),
      { ...cfg, hfToken: 'test-token' },
      new AbortController().signal,
      [{ request: 'Wait, compare only the same locations', outcome: 'Same locations compared.' }],
    );
    expect(result.action).toBeNull();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const context = JSON.parse(body.messages[1].content).context;
    expect(context.studio.result).toMatchObject({
      previousTotal: 126000,
      currentTotal: 141000,
      includedRows: 30,
      excludedLocations: 2,
    });
    expect(context.studio.baseline).toMatchObject({ previousTotal: 134000, currentTotal: 204000 });
    expect(context.studio).not.toHaveProperty('dataset');
    expect(body.messages[0].content).toContain(
      'Only call it Databricks-verified when the current result provider is databricks',
    );
  } finally {
    await controller.close();
  }
});

it.each([
  'It looks like you have successfully added the image and navigated to the last slide.',
  'I’ve navigated to the last slide. Would you like me to make changes?',
  'You are now on slide 3, where your picture is visible.',
  'The presentation is open on slide three, ready for review.',
])(
  'grounds the unsupported native success claim %s in actual file and failure evidence',
  async (reply) => {
    const state: ComputerState = {
      folder: { id: 'fixture-output', name: 'Work' },
      code: null,
      browser: null,
      screen: null,
      presentation: {
        filename: 'existing-image-revision.pptx',
        title: 'Existing presentation',
        slideCount: 3,
        slideTitles: ['Existing presentation', 'Topic overview', 'Final discussion'],
        sha256: 'b'.repeat(64),
        opened: true,
        imageEdits: [{ slide: 3, filename: 'campaign.png', altText: 'A supplied source picture' }],
        desktopNavigation: {
          status: 'failed',
          message: 'PowerPoint did not expose the selected slide.',
        },
      },
    };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: null,
                    clarification: reply,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await computerPlan(
      'What happened?',
      state,
      { ...config(), hfToken: 'test-no-network', cloudUrl: '' },
      new AbortController().signal,
      [{ request: 'Go to the last slide.', outcome: 'I have navigated to the last slide.' }],
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const context = JSON.parse(body.messages[1].content).context;
    expect(context.presentation).toMatchObject({
      filename: state.presentation!.filename,
      opened: true,
      imageEdits: state.presentation!.imageEdits,
      desktopNavigation: state.presentation!.desktopNavigation,
    });
    expect(context.presentation.selectedSlide).toBeUndefined();
    expect(result.action).toBeNull();
    expect(result.clarification).toMatch(/saved|written|file|PowerPoint/i);
    expect(result.clarification).toMatch(
      /unverified|not confirmed|not verify|could not|couldn['’]t|failed|unable/i,
    );
    expect(result.clarification).not.toMatch(
      /looks like|successfully|navigated to the last slide/i,
    );
  },
);

it('provides the verified current slide number when native navigation succeeded', async () => {
  const state: ComputerState = {
    folder: null,
    code: null,
    browser: null,
    screen: null,
    presentation: {
      filename: 'verified.pptx',
      title: 'Verified deck',
      slideCount: 3,
      slideTitles: ['Cover', 'Topic overview', 'Discussion'],
      sha256: 'c'.repeat(64),
      opened: true,
      selectedSlide: 2,
      desktopNavigation: { status: 'verified', slide: 2 },
    },
  };
  const fetchMock = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: null,
                  clarification: 'PowerPoint is on slide two, Topic overview.',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await computerPlan(
    'Where am I?',
    state,
    { ...config(), hfToken: 'test-no-network', cloudUrl: '' },
    new AbortController().signal,
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(JSON.parse(body.messages[1].content).context.presentation).toMatchObject({
    filename: 'verified.pptx',
    selectedSlide: 2,
    desktopNavigation: { status: 'verified', slide: 2 },
  });
  expect(result.clarification).toContain('slide two');
});
