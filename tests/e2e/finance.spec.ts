import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('finance dashboard handles a budget correction and downloads a genuine Excel workbook', async ({
  page,
}) => {
  await page.goto('/?workspace=finance');
  await expect(page.getByRole('heading', { name: 'Finance, within reach.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try sample finances' }).click();
  const panel = page.getByRole('region', { name: 'Accessible finance workspace' });
  await expect(panel).toContainText('$2,810.00');
  await expect(panel).toContainText('$190.00');
  await page.getByRole('button', { name: 'Check payment', exact: true }).click();
  await expect(panel.locator('.finance-payment-result')).toContainText('$56.49');
  await expect(panel.locator('.finance-payment-result')).toContainText('$26.49 above');
  const input = page.getByLabel('Tell your computer what to do');
  await input.fill('Change the payment limit to $60');
  await input.press('Enter');
  await expect(panel.locator('.finance-payment-result')).toContainText('Within your limit');
  await expect(page.getByLabel('Payment monthly limit')).toHaveValue('60');
  await page.getByRole('button', { name: 'Apply scenario', exact: true }).click();
  await expect(panel.locator('.finance-metric-highlight')).toContainText('$290.00');
  await expect(page.getByText('Unrecognized keys', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo finance change' }).click();
  await expect(panel.locator('.finance-metric-highlight')).toContainText('$190.00');
  await page.getByRole('button', { name: 'Export Excel', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download workbook' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download workbook' }).click();
  expect((await download).suggestedFilename()).toMatch(/^insight-finance-.*\.xlsx$/);
  await page.screenshot({ path: 'artifacts/finance-dashboard.png', fullPage: true });
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});
test('finance imports real CSV and remains usable at phone-sized widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?workspace=finance');
  await page.getByLabel('Import finance CSV or Excel').setInputFiles({
    name: 'my-finances.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Date,Category,Type,Amount\n2026-09-01,Wages,income,2000\n2026-09-02,Housing,expense,1000\n2026-09-03,Food,expense,250',
    ),
  });
  await expect(page.getByRole('region', { name: 'Accessible finance workspace' })).toContainText(
    '$750.00',
  );
  await expect(page.getByText('YOUR IMPORTED RECORDS')).toBeVisible();
  await page.getByText('Read the chart as a table').click();
  await expect(
    page.getByRole('table', { name: 'Recorded monthly cash flow in USD' }),
  ).toContainText('$2,000.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/finance-mobile.png', fullPage: true });
});
test('floating buddy keeps finance answers beside the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 580 });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  const request = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await request.fill('Start the finance demo');
  await request.press('Enter');
  await expect(page.getByRole('region', { name: 'Finance result' })).toContainText('$190.00');
  await expect(page.getByText('Comparing costs within your payment limit')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start voice conversation' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/finance-buddy.png' });
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});
