import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ComputerState } from '../../shared/computer';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../../shared/presentation-deck';
import { materializeFlowchart } from '../../shared/presentation-flowchart';
import { layoutEditableSlide } from '../../server/computer/presentation-visual-layout';
import { prepareOrderedFlowchart } from '../../server/computer/presentation-flowchart-export';
import { flowchartReviewScene, layoutStructuredSlide } from '../../server/computer/presentation-review-scene';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
  'base64',
);

async function fixture(page: Page, imageLayout?: 'split' | 'large', branching = false, measured = false, duplicateLabels = false) {
  const deck: OrderedPresentationDeck = {
    schemaVersion: 2,
    title: 'Cyber Monday campaign',
    theme: 'dark',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      {
        id: 'cover-stable',
        type: 'cover',
        title: 'Cyber Monday campaign',
        subtitle: 'A proposed campaign built from your source picture.',
        imageId: 1,
      },
      {
        id: 'audience-stable',
        type: 'text',
        title: 'Our audience',
        points: [
          'Help returning customers discover relevant offers.',
          'Keep the mobile experience clear and accessible.',
        ],
      },
      imageLayout
        ? {
            id: 'message-stable',
            type: 'image',
            title: 'Campaign image',
            imageId: 2,
            caption: 'A second supplied campaign picture.',
            layout: imageLayout,
            points: ['Show the offer clearly.'],
          }
        : {
            id: 'message-stable',
            type: 'text',
            title: 'Campaign message',
            points: ['Explain the benefit before the discount.', 'Use one clear call to action.'],
          },
      {
        id: 'chart-stable',
        type: 'chart',
        title: 'Verified sample sales',
        chart: {
          labels: ['Q2', 'Q3'],
          series: [{ name: 'Sales', values: [12000, 15600] }],
          unit: 'USD',
          provenance: {
            datasetId: 'synthetic-ui-fixture',
            revision: 3,
            verifiedAt: '2026-10-11T05:00:00.000Z',
            provider: 'local',
            summary: 'Synthetic browser fixture. Values and provider responses are mocked.',
          },
        },
      },
      {
        id: 'process-stable',
        type: 'process',
        title: 'Campaign workflow',
        stages: [
          { label: 'Prepare', detail: 'Review the offer and creative.' },
          { label: 'Launch', detail: 'Publish the approved campaign.' },
          { label: 'Learn', detail: 'Review measured outcomes.' },
        ],
      },
      {
        id: 'summary-stable',
        type: 'text',
        title: 'Campaign summary',
        points: ['Make the offer useful.', 'Measure real results before reporting success.'],
      },
    ],
  };
  if(branching) deck.slides[2]={id:'graph-stable',type:'flowchart',title:'Approval branches',graph:materializeFlowchart({orientation:'vertical',nodes:[
    {ref:'start',kind:'start',label:'Prepare'},{ref:'decision',kind:'decision',label:'Approved?'},{ref:'yes',kind:'end',label:'Publish'},{ref:'no',kind:'end',label:'Revise'}
  ],edges:[{from:'start',to:'decision'},{from:'decision',to:'yes',branchLabel:'Yes'},{from:'decision',to:'no',branchLabel:'No'}]})};
  if (duplicateLabels && deck.slides[2].type === 'flowchart') {
    for (const node of deck.slides[2].graph.nodes) if (node.kind === 'end') node.label = 'Finish';
  }
  const state: ComputerState = {
    folder: { id: 'source', name: 'Marketing' },
    code: null,
    browser: null,
    screen: null,
    presentation: {
      projectId: 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa',
      filename: 'campaign-r1.pptx',
      sha256: 'a'.repeat(64),
      title: deck.title,
      slideCount: 6,
      slideTitles: deck.slides.map((slide) => slide.title),
      opened: false,
      project: {
        revision: 1,
        folder: 'Marketing',
        basis: 'Proposed campaign. Synthetic UI fixture with mocked execution and data.',
        assets: [
          {
            id: 1,
            filename: 'marketing.png',
            description: 'A supplied marketing campaign picture.',
          },
          ...(imageLayout
            ? [{ id: 2, filename: 'second.png', description: 'A second supplied picture.' }]
            : []),
        ],
        deck: legacyDeckProjection(deck),
        orderedDeck: deck,
        canUndo: false,
      },
    },
  };
  const calls: string[] = [];
  const original = structuredClone(deck);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/status')
      return route.fulfill({
        json: {
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: false, ttsConfigured: false },
            neon: { configured: false },
          },
        },
      });
    if (path === '/api/computer/presentation/layout' && measured) {
      const current = state.presentation!.project!.orderedDeck!;
      return route.fulfill({ json: { projectId: state.presentation!.projectId, sha256: state.presentation!.sha256, revision: state.presentation!.project!.revision, evidence: 'saved-export', scenes: current.slides.map(slide => slide.type === 'flowchart' ? flowchartReviewScene(slide, current, prepareOrderedFlowchart(slide, current)) : slide.type === 'process' || slide.type === 'chart' ? layoutStructuredSlide(slide, current) : layoutEditableSlide(slide, current)) } });
    }
    if (path.includes('/presentation/image/'))
      return route.fulfill({ contentType: 'image/png', body: png });
    if (path === '/api/computer/state') return route.fulfill({ json: state });
    if (path === '/api/computer/request') {
      const { request } = route.request().postDataJSON();
      calls.push(request);
      const project = state.presentation!.project!;
      if (request === 'Move slide four before slide two.') {
        const [slide] = project.orderedDeck!.slides.splice(3, 1);
        project.orderedDeck!.slides.splice(1, 0, slide);
        project.revision++;
        project.canUndo = true;
      } else if (request === 'Undo the last slide change') {
        project.orderedDeck = structuredClone(original);
        project.revision++;
        project.canUndo = false;
      } else if (request === 'Use bright minimal.') {
        project.orderedDeck!.theme = 'light';
        project.revision++;
      }
      return route.fulfill({
        json: { state, tool: 'presentationHelp', summary: `Handled: ${request}` },
      });
    }
    return route.fulfill({ json: {} });
  });
  return { calls };
}

test('one source picture renders six ordered slides, with the picture on the cover and a process before the summary', async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await page.goto('/?workspace=presentation');
  const project = page.getByRole('region', { name: 'Voice-directed presentation', exact: true });
  await expect(project).toContainText('6 editable slides');
  await expect(project).toContainText('Dark minimal');
  const slides = project.locator('.presentation-project-slides > li');
  await expect(slides).toHaveCount(6);
  await expect(slides.first()).toHaveAttribute('data-slide-id', 'cover-stable');
  await expect(slides.first().getByRole('img')).toHaveCount(1);
  await expect(project.getByRole('img')).toHaveCount(1);
  await expect(slides.nth(4)).toContainText('Campaign workflow');
  await expect(slides.last()).toContainText('Campaign summary');
  await expect(project.getByRole('table')).toContainText('15,600');
  await project.getByRole('button', { name: 'Read slide 5', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => calls).toEqual(['Read slide 5']);
  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({ path: '.local/presentation-v2-workspace.png', fullPage: true });
  await page.setViewportSize({ width: 440, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('reordering and undo keep stable slide identities with accurate read targets and theme state', async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await page.goto('/?workspace=presentation');
  const project = page.getByRole('region', { name: 'Voice-directed presentation', exact: true });
  const input = page.getByRole('textbox', { name: 'Tell your computer what to do', exact: true });
  await input.fill('Move slide four before slide two.');
  await input.press('Enter');
  const second = project.locator('.presentation-project-slides > li').nth(1);
  await expect(second).toHaveAttribute('data-slide-id', 'chart-stable');
  await expect(second).toContainText('SLIDE 2');
  await second.getByRole('button', { name: 'Read slide 2', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toBe('Read slide 2');
  await project.getByRole('button', { name: 'Undo revision', exact: true }).click();
  await expect(second).toHaveAttribute('data-slide-id', 'audience-stable');
  await input.fill('Use bright minimal.');
  await input.press('Enter');
  await expect(project).toHaveAttribute('data-theme', 'light');
  await expect(project).toContainText('Bright minimal');
});

for (const layout of ['split', 'large'] as const) {
  test(`the ${layout} image slide renders its own source and caption`, async ({ page }) => {
    await fixture(page, layout);
    await page.goto('/?workspace=presentation');
    const imageSlide = page.locator('[data-slide-id="message-stable"]');
    await expect(imageSlide).toHaveClass(new RegExp(`layout-${layout}`));
    await expect(imageSlide.getByRole('img')).toHaveAttribute('src', /\/image\/2\?revision=1/);
    await expect(imageSlide).toContainText('A second supplied campaign picture.');
  });
}

test('the buddy reports the real image count and reads a process at its actual position', async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await page.goto('/?desktop=buddy&workspace=presentation');
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  await expect(page.locator('.buddy-result')).toContainText(
    '6 editable slides · revision 1 · 1 source image',
  );
  await page.getByRole('button', { name: 'Read the diagram', exact: true }).click();
  await expect.poll(() => calls).toEqual(['Read slide 5']);
});

test('the buddy diagram shortcut and graph slide read use the graph actual position',async({page})=>{
  const {calls}=await fixture(page,undefined,true);
  await page.goto('/?desktop=buddy&workspace=presentation');
  await page.getByRole('button',{name:'Expand buddy',exact:true}).click();
  await page.getByRole('button',{name:'Read the diagram',exact:true}).click();
  await expect.poll(()=>calls).toEqual(['Read slide 3']);
  await page.goto('/?workspace=presentation');
  const graph=page.locator('[data-slide-id="graph-stable"]');
  await expect(graph).toContainText('Yes');await expect(graph).toContainText('No');
  await graph.getByRole('button',{name:'Read slide 3',exact:true}).click();
  await expect.poll(()=>calls).toEqual(['Read slide 3','Read slide 3']);
});

test('measured preview keeps exported geometry and keyboard diagram exploration sends semantic requests', async ({ page }) => {
  const { calls } = await fixture(page, undefined, true, true);
  await page.goto('/?workspace=presentation');
  const graph = page.locator('[data-slide-id="graph-stable"]');
  await expect(page.locator('.presentation-measured-preview svg')).toHaveCount(6);
  await expect(graph.locator('.presentation-measured-preview svg')).toHaveAttribute('data-layout-version', 'structured-v1');
  await expect(graph.locator('polygon')).toHaveCount(1);
  const nodes = graph.locator('button[data-node-id]');
  await nodes.first().focus(); await page.keyboard.press('ArrowDown');
  await expect(nodes.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => calls.at(-1)).toBe('Explain the node “step 2: Approved?” on the flowchart on slide 3.');
  await expect(nodes.first()).toBeEnabled();
  await nodes.first().focus(); await page.keyboard.press('End'); await expect(nodes.last()).toBeFocused();
  await page.keyboard.press('Home'); await expect(nodes.first()).toBeFocused();
  await graph.getByRole('button', { name: 'Read No branch', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => calls.at(-1)).toBe('Explain the "No" branch of the flowchart on slide 3.');
  await graph.getByRole('button', { name: 'Describe layout', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toBe('Describe the layout of slide 3.');
  const picture = page.locator('[data-slide-id="cover-stable"] svg image');
  await expect(picture).toHaveAttribute('href', /projectId=aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa&sha256=a{64}$/);
  await expect(picture).toHaveAttribute('x', '7.25');
  await expect(page.locator('[data-slide-id="chart-stable"]')).toContainText('chart frame only');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await graph.screenshot({ path: '.local/scene-preview-graph.png' });
  await page.locator('[data-slide-id="cover-stable"]').screenshot({ path: '.local/scene-preview-cover.png' });
});

test('picture descriptions can be reviewed and corrected through the existing request path', async ({ page }) => {
  const { calls } = await fixture(page, undefined, false, true);
  await page.goto('/?workspace=presentation');
  const cover = page.locator('[data-slide-id="cover-stable"]');
  await cover.getByText('Picture description · AI-generated', { exact: true }).click();
  await cover.getByRole('button', { name: 'Read picture description', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toBe('Read the picture description on slide 1.');
  const field = cover.getByRole('textbox', { name: 'Correct the description for slide 1' });
  await field.fill('A blue campaign banner with a white heading.');
  await cover.getByRole('button', { name: 'Save description', exact: true }).click();
  await expect.poll(() => calls.at(-1)).toBe('Set the picture description on slide 1 to “A blue campaign banner with a white heading.”.');
});

test('keyboard explorer gives repeated node labels distinct spoken references', async ({ page }) => {
  const { calls } = await fixture(page, undefined, true, true, true);
  await page.goto('/?workspace=presentation');
  const nodes = page.locator('[data-slide-id="graph-stable"] button[data-node-id]');
  await nodes.first().focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect.poll(() => calls.at(-1)).toBe('Explain the node “step 4: Finish” on the flowchart on slide 3.');
  await expect(nodes.first()).toBeEnabled();
  await nodes.last().focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect.poll(() => calls.at(-1)).toBe('Explain the node “step 3: Finish” on the flowchart on slide 3.');
});
