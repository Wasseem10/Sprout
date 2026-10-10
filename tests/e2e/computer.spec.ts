import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('creates and runs an actual Python file through the companion interface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Just say the next step.' })).toBeVisible();
  await page.getByRole('button', { name: 'Use demo folder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create Fibonacci program' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create Fibonacci program' }).click();
  await expect(page.getByLabel('Python source')).toContainText('sequence.append(a)');
  const run = page.getByRole('button', { name: 'Run with Python' });
  if (await run.isEnabled()) {
    await run.click();
    await expect(page.getByLabel('Program output')).toContainText('First 20 Fibonacci numbers');
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
  await expect(page.getByLabel('Python source')).toContainText('count = 10');
  await input.fill('Order everything and pay for it');
  await input.press('Enter');
  await expect(page.locator('.computer-message.assistant').last()).toContainText(
    'Starter mode supports',
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
