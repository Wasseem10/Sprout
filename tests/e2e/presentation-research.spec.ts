import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ComputerState } from '../../shared/computer';

test('web presentation exposes source evidence and spoken review without creating a code workspace', async ({
  page,
}) => {
  const state: ComputerState = { folder: null, code: null, browser: null, screen: null };
  const calls: string[] = [];
  const deck = {
    title: 'Accessible work',
    subtitle: 'A web research draft',
    slides: [1, 2, 3].map((n) => ({
      title: `Accessible practice ${n}`,
      points: [
        {
          text: 'Use readable slide text.',
          sourceId: 1,
          quote: 'Accessible presentations include readable text.',
        },
        {
          text: 'Describe images meaningfully.',
          sourceId: 1,
          quote: 'Meaningful descriptions explain the content of images.',
        },
      ],
    })),
    diagram: {
      title: 'Proposed workflow',
      stages: ['Gather', 'Create', 'Review'].map((label) => ({
        label,
        detail: 'A proposed authoring step',
      })),
    },
  };
  await page.route('**/api/computer/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/state')) return route.fulfill({ json: state });
    if (pathname.endsWith('/request')) {
      const { request } = route.request().postDataJSON();
      calls.push(request);
      if (/create a powerpoint/i.test(request)) {
        state.folder = { id: 'qa', name: 'presentation-workspace' };
        state.presentation = {
          filename: 'qa-research.pptx',
          title: deck.title,
          slideCount: 5,
          slideTitles: [deck.title, ...deck.slides.map((s) => s.title), deck.diagram.title],
          opened: false,
          sha256: 'qa',
          research: {
            deck,
            sources: [
              {
                id: 1,
                title: 'Accessibility source',
                url: 'https://www.w3.org/WAI/tips/designing/',
                text: 'Test evidence only',
                accessedAt: '2026-10-10T00:00:00Z',
              },
            ],
          },
        };
      }
      return route.fulfill({
        json: {
          state,
          tool: 'presentationHelp',
          summary: 'Use readable slide text. Source notes are available.',
        },
      });
    }
    calls.push(pathname);
    return route.continue();
  });
  await page.goto('/?workspace=presentation');
  const input = page.getByRole('textbox', { name: 'Tell your computer what to do', exact: true });
  await input.fill('Research accessible work on the web and create a PowerPoint');
  await input.press('Enter');
  const office = page.getByRole('region', { name: 'Office tasks', exact: true });
  await expect(office.getByRole('heading', { name: deck.title, exact: true })).toBeVisible();
  await office.getByText('Sources and supporting excerpts', { exact: true }).click();
  await expect(office.getByRole('link', { name: 'Accessibility source' })).toHaveAttribute(
    'href',
    'https://www.w3.org/WAI/tips/designing/',
  );
  await expect(office).toContainText('Meaningful descriptions explain the content of images.');
  const read = office.getByRole('button', { name: 'Read slide two', exact: true });
  await read.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Conversation transcript')).toContainText(
    'Use readable slide text.',
  );
  expect(calls).toEqual([
    'Research accessible work on the web and create a PowerPoint',
    'Read slide two',
  ]);
  await expect(
    office.getByRole('link', { name: 'Download PowerPoint', exact: true }),
  ).toHaveAttribute('href', '/api/computer/presentation/export');
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/presentation-research-workspace.png', fullPage: true });
  await page.setViewportSize({ width: 440, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
