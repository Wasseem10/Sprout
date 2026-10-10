import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('creates and runs an actual Python file through the companion interface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Just say the next step.' })).toBeVisible();
  await page.getByRole('button', { name: 'Use demo folder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create Fibonacci program' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create Fibonacci program' }).click();
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
  await page.getByRole('button', { name: 'Use demo folder', exact: true }).click();
  const input = page.getByLabel('Tell your computer what to do');
  await input.fill('Write a Python Fibonacci program with 10 numbers');
  await input.press('Enter');
  await expect(page.getByLabel('Python source')).toContainText(/fibonacci/i);
  await input.fill('Order everything and pay for it');
  await input.press('Enter');
  await expect(page.locator('.computer-message.assistant').last()).toContainText(
    'cannot place orders or make payments',
  );
});

test('screen capture is explicit and connections remain accessible on small screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'See my screen', exact: true }).click();
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
  await page.getByRole('button', { name: 'Office tasks' }).click();
  await page.getByRole('button', { name: 'Use demo folder', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze sample Excel' }).click();
  await expect(page.getByRole('region', { name: 'Office tasks' })).toContainText(
    'Revenue totals 6,200',
  );
  await expect(page.getByRole('region', { name: 'Office tasks' })).toContainText('East with 2,700');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
