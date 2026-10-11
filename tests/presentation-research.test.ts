import { it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';
import { spokenFolderName } from '../server/computer/presentation-project';
import {
  validateResearchEvidence,
  isResearchPresentationRequest,
} from '../server/computer/presentation-research';
import {
  researchDeckSchema,
  type ResearchDeck,
  type ResearchSource,
} from '../shared/presentation-research';
import { openNativeApp } from '../server/computer/native-apps';

vi.mock('../server/computer/native-apps', () => ({
  openNativeApp: vi.fn(async () => ({
    app: 'fileExplorer',
    name: 'File Explorer',
    mode: 'launched',
  })),
}));
const controllers: ComputerController[] = [],
  servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const c of controllers.splice(0)) await c.close();
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
const JSZip = createRequire(import.meta.url)('jszip');
const signal = () => new AbortController().signal;
const sentence =
  'Accessible presentations include meaningful descriptions of images and readable text.';
const evidence = `${sentence} Speaker notes can record sources and context. ${'Accessible information allows people to review their work independently. '.repeat(12)}`;
const sources: ResearchSource[] = [
  {
    id: 1,
    title: 'Accessible work',
    url: 'https://example.org/article',
    text: evidence,
    accessedAt: '2026-10-10T00:00:00Z',
  },
];
const deck: ResearchDeck = {
  title: 'Accessible presentations',
  subtitle: 'Research findings and a proposed authoring workflow',
  slides: [1, 2, 3].map((n) => ({
    title: `Accessible practice ${n}`,
    points: [
      { text: 'Include meaningful descriptions of images.', sourceId: 1, quote: sentence },
      { text: 'Keep slide text readable.', sourceId: 1, quote: sentence },
    ],
  })),
  diagram: {
    title: 'Proposed review workflow',
    stages: [
      { label: 'Gather', detail: 'Choose relevant sources and images' },
      { label: 'Create', detail: 'Draft readable slides with descriptions' },
      { label: 'Review', detail: 'Listen to the slides and verify the sources' },
    ],
  },
};
it('refuses invented citations and unsupported numeric claims', () => {
  expect(() => validateResearchEvidence(deck, sources)).not.toThrow();
  const bad = structuredClone(deck);
  bad.slides[0].points[0].quote = 'This exact quote was never on the page.';
  expect(() => validateResearchEvidence(bad, sources)).toThrow('citation did not match');
  bad.slides[0].points[0] = {
    ...deck.slides[0].points[0],
    text: 'Accessibility increased revenue by 25%.',
  };
  expect(() => validateResearchEvidence(bad, sources)).toThrow('number absent');
  expect(researchDeckSchema.safeParse({ ...deck, slides: deck.slides.slice(0, 2) }).success).toBe(
    false,
  );
  expect(
    isResearchPresentationRequest('Research accessibility on the web and create a PowerPoint'),
  ).toBe(true);
});
it('selects and opens a spoken folder without a picker, then uses it for the image presentation', async () => {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-voice-folder-')),
    root = path.join(localDir, 'Q3 Demo');
  await mkdir(root);
  const png = await readFile(path.resolve('artifacts/workspace.png'));
  for (const i of [1, 2, 3]) await writeFile(path.join(root, `${i}.png`), png);
  // Preserve the separate research/legacy folder workflow; semantic routing is tested separately.
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
  const ask = await c.request('Can you open my folder?', signal());
  expect(ask.clarification).toBe(true);
  expect(ask.summary).toContain('What is the folder called');
  const selected = await c.request(root, signal());
  expect(selected.state.folder?.name).toBe('Q3 Demo');
  expect(selected.summary).toContain('3 pictures');
  expect(openNativeApp).not.toHaveBeenCalled();
  expect(selected.desktopIntent).toMatchObject({
    kind: 'openFolder',
    name: 'Q3 Demo',
    path: root,
  });
  const picture = {
    ...deck,
    slides: deck.slides.map((s, i) => ({
      title: s.title,
      imageId: i + 1,
      points: s.points.map((p) => p.text),
    })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  Array.isArray(body.messages[1].content)
                    ? { description: 'An image of a sample product interface' }
                    : picture,
                ),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
  const made = await c.request(
    'Make a PowerPoint using these images with a final diagram. Save only.',
    signal(),
  );
  expect(made.state.presentation?.project?.folder).toBe('Q3 Demo');
  expect(made.state.presentation?.slideCount).toBe(5);
  expect(spokenFolderName('Open folder Q3 Demo')).toBe('Q3 Demo');
  expect(spokenFolderName('Open my Q3 Demo folder')).toBe('Q3 Demo');
});
it('browses actual result pages and exports source quotes with an editable final diagram', async () => {
  let base = '';
  const visited: string[] = [];
  const server = createServer((req, res) => {
    visited.push(req.url!);
    res.setHeader('Content-Type', 'text/html');
    if (req.url!.startsWith('/search'))
      res.end(
        `<title>Research search</title><div id="b_results"><div class="b_algo"><h2><a href="${base}/article">Accessible work</a></h2></div></div>`,
      );
    else
      res.end(
        `<title>Accessible work</title><main><h1>Accessible work</h1><p>${evidence}</p></main>`,
      );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-research-'));
  const c = new ComputerController(
    { ...config(), localDir, host: '127.0.0.1', hfToken: 'test', cloudUrl: '' },
    {
      semanticPresentation: false,
      headless: true,
      validateUrl: async (url) => url,
      searchUrl: () => `${base}/search`,
    },
  );
  controllers.push(c);
  await c.init();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body),
        system = body.messages[0].content;
      const content = system.includes('Extract the subject')
        ? { query: 'accessible presentations' }
        : system.includes('sourced five-slide')
          ? deck
          : 'Found accessible work.';
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
  const made = await c.request(
    'Research accessible presentations on the web and make a PowerPoint. Save only.',
    signal(),
  );
  expect(visited).toContain('/article');
  expect(made.state.presentation?.research?.sources[0].url).toBe(`${base}/article`);
  expect(made.state.presentation?.slideCount).toBe(5);
  const zip = await JSZip.loadAsync((await c.presentationExport()).bytes);
  const notes = await zip.file('ppt/notesSlides/notesSlide2.xml').async('string');
  expect(notes).toContain(`${base}/article`);
  expect(notes).toContain(sentence);
  const diagram = await zip.file('ppt/slides/slide5.xml').async('string');
  expect(diagram).toContain('PROPOSED WORKFLOW');
  expect(diagram).toContain('Gather');
  expect(diagram).not.toContain('<p:pic>');
  expect((await c.request('Read slide two', signal())).summary).toContain(
    'meaningful descriptions',
  );
  expect((await c.request('Read sources', signal())).summary).toContain('Accessible work');
});
