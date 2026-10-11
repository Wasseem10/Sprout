import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('studio connects a correction, row evidence and genuine Office downloads, with keyboard chart exploration', async ({
  page,
}) => {
  await page.goto('/?workspace=studio');
  await page.getByRole('button', { name: 'Try sample analysis' }).click();
  const studio = page.getByRole('region', { name: 'Insight Studio', exact: true });
  await expect(studio).toContainText('52.2%');
  await page.getByRole('button', { name: 'Compare same locations', exact: true }).click();
  await expect(studio).toContainText('11.9%');
  await expect(studio).toContainText('$141,000');
  await page.getByRole('button', { name: 'Show your work' }).click();
  await expect(
    studio.getByRole('table', { name: 'CSV source rows and analysis inclusion' }),
  ).toBeVisible();
  const region = page.getByRole('button', { name: /^East \$/ });
  await region.focus();
  await page.keyboard.press('Enter');
  await expect(region).toHaveAttribute('aria-pressed', 'true');
  await expect(
    studio.getByRole('table', { name: 'CSV source rows and analysis inclusion' }),
  ).toContainText('East');
  await page.getByRole('button', { name: 'Create Excel + PowerPoint', exact: true }).click();
  for (const name of ['Download Excel workbook', 'Download PowerPoint']) {
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name, exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/insight-analysis-r2-.*\.(xlsx|pptx)$/);
  }
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/studio-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(studio).toContainText('52.2%');
  await expect(page.getByRole('link', { name: 'Download PowerPoint', exact: true })).toHaveCount(0);
});
test('studio imports a user CSV and the floating buddy retains the analysis', async ({ page }) => {
  await page.goto('/?workspace=studio');
  await page
    .getByLabel('Import studio CSV or Excel')
    .setInputFiles({
      name: 'my-records.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'date,location_id,region,revenue,operating_start,operating_end\n2026-01-01,A,East,100,2025-01-01,\n2026-04-01,A,East,120,2025-01-01,',
      ),
    });
  await expect(page.getByRole('region', { name: 'Insight Studio' })).toContainText('20.0%');
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await input.fill('Start the analysis demo');
  await input.press('Enter');
  await expect(page.getByRole('region', { name: 'Studio result' })).toContainText('52.2%');
  await page.setViewportSize({ width: 440, height: 700 });
  await page.screenshot({ path: 'artifacts/studio-buddy.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
