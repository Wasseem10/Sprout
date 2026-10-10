import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/?workspace=energy');
  await expect(page.getByRole('button', { name: 'Choose bills', exact: true })).toBeEnabled();
  await page.request.post('/api/computer/stop');
  const cleared = await page.request.post('/api/computer/request', {
    data: { request: 'Clear bill documents' },
  });
  expect(cleared.ok()).toBe(true);
  await page.reload();
});

test('bill workspace reads real sample PDFs, verifies inputs, and handles a payment correction', async ({
  page,
}) => {
  await page.goto('/?workspace=energy');
  await expect(page.getByRole('heading', { name: 'Your bills, understood.' })).toBeVisible();
  await page.getByText('What can I say next?', { exact: true }).click();
  await expect(page.getByText('“Read sample PDF bills.”', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/bill-start.png', fullPage: true });
  await page.getByRole('button', { name: 'Try sample PDFs' }).click();
  await page.getByRole('button', { name: 'Read both bills', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Accessible bill workspace' })).toContainText(
    'Synthetic sample',
    { timeout: 30000 },
  );
  await expect(
    page.getByRole('button', { name: 'Confirm bill numbers', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm bill numbers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'August 2026', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm bill numbers', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm bill numbers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your bill rose $45.00.' })).toBeVisible();
  const verify = page.getByRole('button', { name: 'Verify with Databricks', exact: true });
  if (await verify.count()) {
    await verify.click();
    await expect(page.getByText('Verified with Databricks SQL', { exact: true })).toBeVisible({
      timeout: 30000,
    });
  }
  const request = page.getByRole('textbox', { name: 'Tell your computer what to do' });
  await request.fill('I can afford sixty dollars a month');
  await request.press('Enter');
  await expect(page.locator('.energy-metrics')).toContainText('$60.00/mo');
  await request.fill('Choose duct repair');
  await request.press('Enter');
  await expect(page.locator('.energy-metrics')).toContainText('Duct repair');
  await page.getByRole('button', { name: 'Try a $30 limit' }).click();
  await expect(page.getByRole('region', { name: 'Energy and affordability plan' })).toContainText(
    '$30.00/mo',
  );
  await expect(page.locator('.energy-budget-alert')).toContainText('$41.67');
  await expect(
    page.getByRole('button', { name: 'Prepare demo application', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Weather sealing · $25.00/mo', exact: true }).click();
  await expect(page.locator('.energy-budget-alert')).toHaveCount(0);
  await expect(page.locator('.energy-metrics')).toContainText('Weather sealing');
  await expect(
    page.getByRole('button', { name: 'Prepare demo application', exact: true }),
  ).toBeEnabled();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/bill-workspace.png', fullPage: true });
});

test('the floating buddy asks before reading and opens the same bill workspace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 580 });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  const request = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await request.fill('Read sample PDF bills');
  await request.press('Enter');
  const review = page.getByRole('region', { name: 'Bill document review' });
  await expect(review).toContainText('Say “yes” to read them');
  await expect(page.getByRole('button', { name: 'Start voice conversation' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/bill-buddy.png' });
  await review.getByRole('button', { name: 'Open bill workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your bills, understood.' })).toBeVisible();
});

test('bill file picker and mobile review stay usable without relying on a chart', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?workspace=energy');
  await expect(page.getByRole('button', { name: 'Choose bills', exact: true })).toBeEnabled();
  await page
    .getByLabel('Import electricity bill PDFs or images')
    .setInputFiles([
      'data/bills/insight-sample-electricity-2026-08.pdf',
      'data/bills/insight-sample-electricity-2026-09.pdf',
    ]);
  await expect(page.getByRole('button', { name: 'Confirm bill numbers', exact: true })).toBeEnabled(
    { timeout: 30000 },
  );
  await page.getByLabel('Current bill total ($)', { exact: true }).fill('340');
  await expect(
    page.getByRole('button', { name: 'Confirm bill numbers', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Energy and other current charges do not add up', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Current bill total ($)', { exact: true }).fill('240');
  await page.getByRole('button', { name: 'Confirm bill numbers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'August 2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm bill numbers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your bill rose $45.00.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/bill-mobile.png', fullPage: true });
});
