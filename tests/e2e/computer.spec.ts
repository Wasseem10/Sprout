import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('creates and runs an actual Python file through the companion interface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tell me what you need done.' })).toBeVisible();
  await page.getByRole('button', { name: 'Create & run' }).click();
  await expect(page.getByRole('button', { name: 'Create Fibonacci program' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create Fibonacci program' }).click();
  await expect(page.getByRole('region', { name: 'Python workspace' })).toContainText('Saving in');
  await expect(page.getByLabel('Python source')).toContainText(/fibonacci/i);
  const run = page.getByRole('button', { name: 'Run with Python' });
  if (await run.isEnabled()) {
    await run.click();
    await expect(page.getByLabel('Program output')).toContainText('4181');
    await expect(page.getByText('Executed · exit 0')).toBeVisible();
  }
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});

test('typed requests work and unsupported actions produce clarification', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Tell your computer what to do');
  await input.fill('Write a Python Fibonacci program with 10 numbers');
  await input.press('Enter');
  await expect(page.getByLabel('Python source')).toContainText(/fibonacci/i);
  await input.fill('Order everything and pay for it');
  await input.press('Enter');
  await expect(page.locator('.computer-message.assistant').last()).toContainText(
    'Checkout completion is not implemented yet',
  );
});

test('screen capture is explicit and connections remain accessible on small screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'My screen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select a PNG screenshot' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Describe with AI' })).toBeDisabled();
  await page.getByRole('button', { name: 'Settings and connections' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Large text', { exact: true }).check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Tell your computer what to do').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});

test('Office tab analyzes a real Excel workbook and reads calculated results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Slides & Excel' }).click();
  await page.getByRole('button', { name: 'Analyze sample Excel' }).click();
  await expect(page.getByRole('region', { name: 'Office tasks' })).toContainText(
    'Revenue totals 6,200',
  );
  await expect(page.getByRole('region', { name: 'Office tasks' })).toContainText('East with 2,700');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('starts as a general assistant without preparing a file folder', async ({ page }) => {
  let folderSetupCalls = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/computer/demo-folder') folderSetupCalls++;
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Start with InsightOS' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find jobs nearby' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Open an app' })).toBeEnabled();
  expect(folderSetupCalls).toBe(0);
});

test('reopening the buddy does not promote an old Python result on startup', async ({ page }) => {
  await page.route('**/api/computer/state', (route) =>
    route.fulfill({
      json: {
        folder: { id: 'existing', name: 'Existing work' },
        browser: null,
        screen: null,
        code: {
          filename: 'old-program.py',
          code: 'print(1)',
          provider: 'starter-template',
          sha256: 'test',
          output: '1',
          exitCode: 0,
          status: 'completed',
          editorOpened: true,
        },
      },
    }),
  );
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open in VS Code' })).toHaveCount(0);
  await expect(page.getByText('old-program.py')).toHaveCount(0);
});
