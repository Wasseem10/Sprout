import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
async function ask(page: any, text: string) {
  const count = await page.locator('.message').count();
  await page.getByLabel('Ask Sprout about your workspace').fill(text);
  await page.getByLabel('Ask Sprout about your workspace').press('Enter');
  await expect(page.locator('.message')).toHaveCount(count + 2);
  await expect(page.locator('.task-progress')).toHaveCount(0);
}
test('complete data workflow, corrections, undo, disk save and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?workspace=data');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/welcome.png', fullPage: true });
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await expect(page.getByText('YOUR DATA IS READY')).toBeVisible();
  await ask(page, 'What is in this file?');
  await expect(page.locator('.message.assistant').last()).toContainText('39 rows');
  await ask(
    page,
    'Compare revenue this quarter with last quarter and tell me which region changed the most',
  );
  await expect(page.getByText('$204,000', { exact: true })).toBeVisible();
  await expect(page.locator('.stats-grid .stat').last()).toContainText('South');
  await ask(page, 'Only include locations that were operating in both quarters');
  await expect(page.getByText('$141,000', { exact: true })).toBeVisible();
  await expect(page.locator('.stats-grid .stat').last()).toContainText('East');
  await ask(page, 'Show that as a chart');
  await ask(page, 'Describe this chart');
  await expect(page.locator('.message.assistant').last()).toContainText(
    'Only locations operating throughout both quarters',
  );
  await ask(page, 'Only show the top three regions');
  await expect(page.locator('.result-table tbody tr')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/workspace.png', fullPage: true });
  await ask(page, 'What changed?');
  await expect(page.locator('.message.assistant').last()).toContainText('top 3 regions');
  await ask(page, 'How did you calculate that percentage?');
  await expect(page.getByRole('heading', { name: 'How we got here' })).toBeVisible();
  await expect(page.locator('.provenance')).toContainText('2 locations excluded');
  await ask(page, 'Undo that change');
  await expect(page.locator('.result-table tbody tr')).toHaveCount(3);
  await ask(page, 'Undo that change');
  await expect(page.locator('.result-table tbody tr')).toHaveCount(5);
  await ask(page, 'Save my workspace');
  await expect(page.locator('.message.assistant').last()).toContainText(
    'local development storage',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await page.getByRole('button', { name: 'Saved workspaces' }).click();
  await page
    .getByRole('button', { name: /Operations review/ })
    .first()
    .click();
  await expect(page.getByText('$141,000', { exact: true })).toBeVisible();
  await ask(page, 'Undo that change');
  await expect(page.getByText('$141,000', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('file opening can be cancelled without a late workspace commit', async ({ page }) => {
  await page.goto('/?workspace=data');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await page.route('**/api/sample', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue().catch(() => {});
  });
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await page.getByRole('button', { name: 'Stop task & audio' }).click();
  await page.waitForTimeout(1600);
  await expect(page.getByRole('heading', { name: 'Your work. Within reach.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
});
test('keyboard-only entry and project preference restoration', async ({ page }) => {
  await page.goto('/?workspace=data');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to request input' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Ask Sprout about your workspace')).toBeFocused();
  async function tabTo(target: any) {
    for (let i = 0; i < 40; i++) {
      if (await target.evaluate((element: HTMLElement) => document.activeElement === element))
        return;
      await page.keyboard.press('Tab');
    }
    throw new Error('Control was not reachable by Tab.');
  }
  await tabTo(page.getByRole('button', { name: 'Try sample data' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('YOUR DATA IS READY')).toBeVisible();
  await expect(page.getByLabel('Ask Sprout about your workspace')).toBeFocused();
  await page.keyboard.type('Compare revenue this quarter with last quarter');
  await page.keyboard.press('Enter');
  await expect(page.getByText('$204,000', { exact: true })).toBeVisible();
  await tabTo(page.getByRole('button', { name: 'Settings & connections' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await tabTo(page.getByLabel('Larger text', { exact: true }));
  await page.keyboard.press('Space');
  await tabTo(page.getByLabel('Reduce motion', { exact: true }));
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Settings & connections' })).toBeFocused();
  await tabTo(page.getByLabel('Ask Sprout about your workspace'));
  await page.keyboard.type('Save my workspace');
  await page.keyboard.press('Enter');
  await expect(page.locator('.message.assistant').last()).toContainText('Saved Operations review');
  await page.evaluate(() => {
    localStorage.removeItem('insightos.largeText');
    localStorage.removeItem('insightos.reducedMotion');
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  await ask(page, 'Resume my workspace');
  await expect(page.locator('.app')).toHaveClass(/large-text/);
  await expect(page.locator('.app')).toHaveClass(/reduce-motion/);
  await expect(page.getByText('$204,000', { exact: true })).toBeVisible();
});
test('three measured sample-mode rehearsals and a recording of the real UI', async ({
  browser,
}) => {
  const report: unknown[] = [];
  await mkdir('artifacts', { recursive: true });
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5173',
      viewport: { width: 1500, height: 1000 },
      ...(run === 3
        ? { recordVideo: { dir: '.local/recordings', size: { width: 1500, height: 1000 } } }
        : {}),
    });
    const page = await context.newPage();
    const started = performance.now();
    await page.goto('/?workspace=data');
    await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
    await page.getByRole('button', { name: 'Try sample data' }).click();
    await expect(page.getByText('YOUR DATA IS READY')).toBeVisible();
    const requests: unknown[] = [];
    for (const request of [
      'What is in this file?',
      'Compare revenue this quarter with last quarter',
      'Only include locations that were operating in both quarters',
      'Show that as a chart',
      'Describe this chart',
      'Only show the top three regions',
      'How did you calculate that percentage?',
      'Undo that change',
      'Save my workspace',
    ]) {
      const before = performance.now();
      await ask(page, request);
      requests.push({ request, milliseconds: Math.round(performance.now() - before) });
      if (run === 3) await page.waitForTimeout(500);
    }
    await expect(page.getByText('$141,000', { exact: true })).toBeVisible();
    await expect(page.locator('.result-table tbody tr')).toHaveCount(3);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
    await ask(page, 'Resume my workspace');
    await expect(page.getByText('$141,000', { exact: true })).toBeVisible();
    report.push({ run, totalMilliseconds: Math.round(performance.now() - started), requests });
    if (run === 3) {
      await page.waitForTimeout(700);
      await page.getByRole('heading', { name: 'Let’s make sense of it.' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'artifacts/demo.png' });
    }
    const video = page.video();
    await context.close();
    if (video) await video.saveAs('artifacts/demo-sample.webm');
  }
  await writeFile(
    'artifacts/rehearsals.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: 'sample',
        measurement:
          'Browser wall time includes UI interactions and assertions. Recording run adds deliberate pacing. These are not live provider latency measurements.',
        runs: report,
      },
      null,
      2,
    ) + '\n',
  );
});
test('actual file selection, invalid CSV recovery and keyboard access', async ({ page }) => {
  await page.goto('/?workspace=data');
  await expect(page.getByRole('button', { name: 'Open CSV', exact: true })).toBeEnabled();
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open CSV', exact: true }).click();
  await (await picker).setFiles(path.resolve('data/operations-synthetic.csv'));
  await expect(page.getByText('YOUR DATA IS READY')).toBeVisible();
  await expect(page.getByText('SYNTHETIC DATA', { exact: true })).toBeVisible();
  await ask(page, 'Compare revenue this quarter with last quarter');
  await expect(page.getByText('$204,000', { exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,revenue\n2026-01-01,1'),
  });
  await expect(page.locator('.message.error').last()).toContainText('CSV requires');
  await expect(page.getByText('$204,000', { exact: true })).toBeVisible();
  await page.getByLabel('Ask Sprout about your workspace').focus();
  await expect(page.getByLabel('Ask Sprout about your workspace')).toBeFocused();
  await ask(page, 'Show that as a chart');
  await page.getByRole('button', { name: 'Settings & connections' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings & connections' })).toBeFocused();
});
test('accessibility scan, narrow layout and delayed-task cancellation', async ({ page }) => {
  await page.goto('/?workspace=data');
  await expect(page.getByRole('button', { name: 'Try sample data' })).toBeEnabled();
  let results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await ask(page, 'Compare revenue this quarter with last quarter');
  await ask(page, 'Show that as a chart');
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.route('**/api/analyze', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue().catch(() => {});
  });
  await page
    .getByLabel('Ask Sprout about your workspace')
    .fill('Only include locations that were operating in both quarters');
  await page.getByLabel('Ask Sprout about your workspace').press('Enter');
  await expect(page.getByRole('button', { name: 'Stop task & audio' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop task & audio' }).click();
  await page.waitForTimeout(1600);
  await expect(page.getByText('$204,000', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Ask Sprout about your workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings & connections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saved workspaces' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
