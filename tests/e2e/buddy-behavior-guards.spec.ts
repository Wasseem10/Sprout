import { expect, test, type Page } from '@playwright/test';

async function companionFixture(page: Page) {
  const mutations: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
  });
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') mutations.push(pathname);
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: true, ttsConfigured: false },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        },
      });
    if (pathname === '/api/connections')
      return route.fulfill({
        json: {
          editable: false,
          defaults: {},
          configured: {
            huggingFace: false,
            elevenLabs: false,
            databricks: false,
            neon: false,
            vultr: false,
          },
          reports: {},
        },
      });
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: {
          state: {
            folder: null,
            code: null,
            browser: null,
            screen: null,
            task: {
              id: 'guard-fixture',
              status: 'completed',
              goal: 'Read fixture',
              message: 'Done',
              steps: [],
            },
          },
          summary: 'Fixture completed.',
        },
      });
    return route.fulfill({ json: { folder: null, code: null, browser: null, screen: null } });
  });
  await page.goto('/?desktop=buddy');
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-renderer', 'webgl');
  await page.getByRole('button', { name: /^Expand buddy/ }).click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  return mutations;
}

async function tools(page: Page, action: string) {
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

test('completed cosmetic requests do not replay when the workspace replaces the canvas', async ({
  page,
}) => {
  const mutations = await companionFixture(page);
  await page.getByLabel('Tell your buddy what to do').fill('Read this fixture');
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'joy');
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'normal');
  await tools(page, 'Open full workspace');
  const workspaceSignal = page.locator('.computer-heading .insight-signal');
  await expect(workspaceSignal).toHaveAttribute('data-renderer', 'webgl');
  // Inspect the first ready state, rather than waiting out an unintended replay.
  expect(await workspaceSignal.getAttribute('data-behavior')).toBe('normal');
  await page.getByRole('button', { name: 'Return to desktop buddy ↗' }).click();
  const returned = page.locator('.buddy .insight-signal');
  await expect(returned).toHaveAttribute('data-renderer', 'webgl');
  expect(await returned.getAttribute('data-behavior')).toBe('normal');
  // The existing companion establishes its sample session at startup.
  expect(mutations).toEqual(['/api/session', '/api/computer/request']);
});

test('production settings omit animation demos while motion controls remain available', async ({
  page,
}) => {
  const mutations = await companionFixture(page);
  await tools(page, 'Pause avatar motion');
  await tools(page, 'Settings and connections');
  const dialog = page.getByRole('dialog', { name: 'Settings & connections' });
  for (const name of ['Celebrate', 'Rest Sprout', 'Wake Sprout'])
    await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Large text', { exact: true })).toBeVisible();
  await dialog.press('Escape');
  await tools(page, 'Resume avatar motion');
  const signal = page.locator('.buddy .insight-signal');
  const loss = await signal
    .locator('canvas')
    .evaluateHandle((canvas) =>
      (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context'),
    );
  expect(await loss.evaluate((extension) => Boolean(extension))).toBe(true);
  await loss.evaluate((extension) => extension!.loseContext());
  await expect(signal).toHaveAttribute('data-renderer', 'fallback');
  await tools(page, 'Settings and connections');
  await expect(dialog.getByRole('button', { name: 'Celebrate', exact: true })).toHaveCount(0);
  await loss.dispose();
  expect(mutations).toEqual(['/api/session']);
});

test('expanded studio Celebrate follows panel-local pause and system reduction', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('insightos.buddyMotionPaused', 'false'));
  await page.goto('/?studio=buddy');
  await expect(page.locator('.studio-launcher .insight-signal')).toHaveAttribute(
    'data-renderer',
    'webgl',
  );
  await page.getByRole('button', { name: 'Expand conversation preview' }).click();
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-renderer', 'webgl');
  const celebrate = page.getByRole('button', { name: 'Celebrate', exact: true });
  await expect(celebrate).toBeEnabled();
  await tools(page, 'Pause avatar motion');
  await expect(celebrate).toBeDisabled();
  await expect(page.getByText(/panel pause and system reduced motion are respected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sleep', exact: true })).toBeEnabled();
  await tools(page, 'Resume avatar motion');
  await expect(celebrate).toBeEnabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(celebrate).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sleep', exact: true })).toBeEnabled();
});
