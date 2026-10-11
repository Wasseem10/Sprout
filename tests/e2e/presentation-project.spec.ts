import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { ComputerState, ComputerResult } from '../../shared/computer';

test('presentation workspace supports keyboard review, mocked Neon save/resume, and restored undo without creating an unrelated demo folder', async ({
  page,
}) => {
  const png = await readFile('artifacts/workspace.png');
  const state: ComputerState = {
    folder: { id: 'qa-folder', name: 'Q3 Demo' },
    browser: null,
    code: null,
    screen: null,
    presentation: {
      filename: 'qa.pptx',
      title: 'Q3 Marketing Direction',
      slideCount: 5,
      slideTitles: [
        'Q3 Marketing Direction',
        'Reach teams',
        'Show the workflow',
        'Help customers start',
        'Customer journey',
      ],
      opened: false,
      sha256: 'qa',
      project: {
        revision: 1,
        folder: 'Q3 Demo',
        basis:
          'Proposed plan. Synthetic browser-test fixture; provider and persistence responses are mocked. No Q3 financial results supplied.',
        canUndo: false,
        assets: [1, 2, 3].map((id) => ({
          id,
          filename: `image-${id}.png`,
          description: 'A synthetic product screenshot',
        })),
        deck: {
          title: 'Q3 Marketing Direction',
          subtitle: 'A proposed plan',
          slides: ['Reach teams', 'Show the workflow', 'Help customers start'].map((title, i) => ({
            title,
            imageId: i + 1,
            points: ['Proposed campaign direction', 'Measure outcomes before reporting results'],
          })),
          diagram: {
            title: 'Customer journey',
            stages: ['Awareness', 'Evaluation', 'Adoption'].map((label) => ({
              label,
              detail: 'A proposed customer journey step',
            })),
          },
        },
      },
    },
  };
  const originalDeck = structuredClone(state.presentation!.project!.deck);
  let savedPresentation: ComputerState['presentation'] = null;
  const calls: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          authenticated: true,
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: false, ttsConfigured: false },
            databricks: { configured: false },
            neon: { configured: true },
            vultr: { configured: false },
          },
        },
      });
    if (url.pathname === '/api/session') return route.fulfill({ json: { authenticated: true } });
    if (url.pathname.includes('/presentation/image/'))
      return route.fulfill({ contentType: 'image/png', body: png });
    if (url.pathname.endsWith('/state')) return route.fulfill({ json: state });
    if (url.pathname.endsWith('/request')) {
      const { request } = route.request().postDataJSON();
      calls.push(request);
      let summary = 'Slide two, Reach teams. Proposed campaign direction. Source: image-1.png.';
      if (/retention/i.test(request)) {
        state.presentation!.project!.revision = 2;
        state.presentation!.project!.canUndo = true;
        state.presentation!.project!.deck.diagram.stages.push({
          label: 'Retention',
          detail: 'Help customers keep using the product',
        });
        summary = 'I saved revision two. The diagram now includes Retention.';
      } else if (request === 'Save my presentation') {
        state.presentation!.project!.saved = {
          id: 'f115d668-97ed-4d53-bef2-b9de9eb8cfa0',
          provider: 'neon',
          savedAt: '2026-10-11T02:00:00.000Z',
          revision: state.presentation!.project!.revision,
        };
        savedPresentation = structuredClone(state.presentation);
        summary = 'I saved Q3 Marketing Direction and its edit history to Neon.';
      } else if (request === 'Change the diagram title to Q3 lifecycle') {
        state.presentation!.project!.revision = 3;
        state.presentation!.project!.deck.diagram.title = 'Q3 lifecycle';
        summary = 'The diagram title is Q3 lifecycle in revision three.';
      } else if (request === 'Resume my last presentation') {
        expect(savedPresentation).not.toBeNull();
        state.presentation = structuredClone(savedPresentation);
        summary = 'I restored saved revision two and its edit history from Neon.';
      } else if (request === 'Undo the last slide change') {
        state.presentation!.project!.revision = 3;
        state.presentation!.project!.deck = structuredClone(originalDeck);
        state.presentation!.project!.canUndo = false;
        summary = 'I undid the Retention change from your restored edit history.';
      }
      const result: ComputerResult = {
        tool: 'presentationHelp',
        summary,
        spokenSummary: summary,
        state,
      };
      return route.fulfill({ json: result });
    }
    calls.push(url.pathname);
    return route.fulfill({ json: {} });
  });
  await page.goto('/?workspace=presentation');
  const project = page.getByRole('region', { name: 'Voice-directed presentation', exact: true });
  await expect(project).toBeVisible();
  await expect(project.getByRole('img')).toHaveCount(3);
  await project.getByRole('button', { name: 'Read slide 2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Conversation transcript')).toContainText('Source: image-1.png');
  const input = page.getByRole('textbox', { name: 'Tell your computer what to do', exact: true });
  await input.fill('Add a retention step to the final diagram');
  await input.press('Enter');
  await expect(project.getByRole('list', { name: 'Diagram stages, left to right' })).toContainText(
    'Retention',
  );
  await expect(project).toContainText('Revision 2');
  await expect(project.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
  await project.getByRole('button', { name: 'Save project', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(project.getByRole('status')).toContainText('Revision 2 saved to Neon.');
  await expect(page.getByLabel('Conversation transcript')).toContainText('edit history to Neon');

  await input.fill('Change the diagram title to Q3 lifecycle');
  await input.press('Enter');
  await expect(project.getByRole('heading', { name: 'Q3 lifecycle', exact: true })).toBeVisible();
  await expect(project).toContainText('Revision 3');
  await expect(project.getByRole('status')).toContainText(
    'Revision 2 saved. Save again to keep your latest changes.',
  );

  await expect(
    project.getByRole('button', { name: 'Resume last saved', exact: true }),
  ).toBeEnabled();
  await project.getByRole('button', { name: 'Resume last saved', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(project).toContainText('Revision 2');
  await expect(project.getByRole('status')).toContainText('Revision 2 saved to Neon.');
  await expect(
    project.getByRole('heading', { name: 'Customer journey', exact: true }),
  ).toBeVisible();
  await expect(project.getByRole('heading', { name: 'Q3 lifecycle', exact: true })).toHaveCount(0);
  await expect(project.getByRole('list', { name: 'Diagram stages, left to right' })).toContainText(
    'Retention',
  );
  await expect(project.getByRole('button', { name: 'Undo revision', exact: true })).toBeEnabled();
  await project.getByRole('button', { name: 'Undo revision', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    project.getByRole('list', { name: 'Diagram stages, left to right' }),
  ).not.toContainText('Retention');
  await expect(project).toContainText('Revision 3');
  await expect(project.getByRole('status')).toContainText(
    'Revision 2 saved. Save again to keep your latest changes.',
  );
  await expect(project.getByRole('button', { name: 'Undo revision', exact: true })).toBeDisabled();
  await expect(project.getByRole('img')).toHaveCount(3);
  expect(calls).toEqual([
    'Read slide 2',
    'Add a retention step to the final diagram',
    'Save my presentation',
    'Change the diagram title to Q3 lifecycle',
    'Resume my last presentation',
    'Undo the last slide change',
  ]);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/presentation-workspace.png', fullPage: true });
  await page.setViewportSize({ width: 440, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
