import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({ baseURL: process.env.INSIGHTOS_PUBLIC_URL || 'http://127.0.0.1:5173' });

test('public demo keeps corrected budgets, choices and application review consistent without calling the local API', async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });
  await page.goto('/?demo=public');
  await expect(page.getByRole('heading', { name: 'What changed this month?' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare practice application' }).click();
  await page.getByRole('button', { name: 'Read application back' }).click();
  await expect(
    page.getByText('Current fields checked in this browser. Nothing submitted.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Wait, I can only afford $30.' }).click();
  await expect(page.getByText('Your selected option is above your limit.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare practice application' })).toBeDisabled();
  await expect(
    page.getByText('Current fields checked in this browser. Nothing submitted.'),
  ).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Applicant name' })).toHaveValue('Alex Sample');
  await page.getByRole('button', { name: 'Choose weather sealing.', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Monthly payment', exact: true })).toHaveValue(
    '$25.00',
  );
  await page.getByRole('button', { name: 'Read application back' }).click();
  await expect(
    page.getByText('Current fields checked in this browser. Nothing submitted.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review or correct bill inputs' }).click();
  await page.getByRole('spinbutton', { name: 'Bill 2: Current bill total ($)' }).fill('241');
  await page.getByRole('button', { name: 'Confirm numbers and recalculate' }).click();
  await expect(page.getByRole('alert')).toContainText('do not add up');
  await page.getByRole('spinbutton', { name: 'Bill 2: Energy charges ($)' }).fill('181');
  await page.getByRole('button', { name: 'Confirm numbers and recalculate' }).click();
  await expect(page.locator('.public-big-number')).toContainText('$241.00');
  await expect(
    page.getByText('Current fields checked in this browser. Nothing submitted.'),
  ).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save sample plan' }).click();
  expect((await download).suggestedFilename()).toBe('sprout-sample-plan.json');
  expect(apiCalls).toEqual([]);
  await page.getByRole('button', { name: 'Reset sample workflow' }).click();
  await expect(page.getByRole('heading', { name: 'Your choice. Your final say.' })).toHaveCount(0);
});

test('public demo is keyboard accessible and fits mobile and large text', async ({ page }) => {
  await page.goto('/?demo=public');
  await expect(page.getByRole('heading', { name: 'What changed this month?' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to bill analysis' })).toBeFocused();
  let audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('button', { name: 'Review or correct bill inputs' }).click();
  audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Large text' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});
