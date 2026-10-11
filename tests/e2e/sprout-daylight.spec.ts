import { test, expect, type Page } from '@playwright/test';

async function diagnostics(page: Page) {
  const raw = await page.locator('.studio-render-report').getAttribute('data-diagnostics');
  return raw
    ? (JSON.parse(raw) as { assetUrl: string; reflectionProfile: string; assetIssues: string[] })
    : null;
}

test('daylight and original switch together with their own lighting while the conversation survives', async ({
  page,
}) => {
  await page.route('**/api/**', () => {
    throw Error('Visual review must stay local.');
  });
  await page.goto('/?studio=buddy');
  await expect
    .poll(() => diagnostics(page))
    .toMatchObject({
      assetUrl: '/buddy/sprout-v007.glb',
      reflectionProfile: 'daylight',
      assetIssues: [],
    });
  await page.getByRole('button', { name: 'Expand conversation preview' }).click();
  const panel = page.locator('.buddy');
  const input = panel.getByLabel('Tell your buddy what to do');
  await input.fill('Keep this draft when comparing Sprout.');
  for (const [value, profile] of [
    ['/buddy/sprout-v005.glb', 'tapered'],
    ['/buddy/sprout-v007.glb', 'daylight'],
  ]) {
    await page.getByLabel('Sprout appearance').selectOption(value);
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.locator('.insight-signal')).toHaveAttribute('data-asset-url', value);
    await expect(panel.locator('.insight-signal')).toHaveAttribute('data-renderer', 'webgl');
    await expect
      .poll(() => diagnostics(page))
      .toMatchObject({ assetUrl: value, reflectionProfile: profile, assetIssues: [] });
    await expect(input).toHaveValue('Keep this draft when comparing Sprout.');
  }
});

test('a missing daylight asset loads the preserved original with original lighting and PNG', async ({
  page,
}) => {
  await page.route('**/buddy/sprout-v007.glb', (route) => route.abort());
  await page.route('**/buddy/sprout-v006.glb', (route) => route.abort());
  await page.goto('/?studio=buddy');
  await expect
    .poll(() => diagnostics(page))
    .toMatchObject({ assetUrl: '/buddy/sprout-v005.glb', reflectionProfile: 'tapered' });
  const signal = page.locator('.studio-launcher .insight-signal');
  await expect(signal).toHaveAttribute('data-renderer', 'webgl');
  const loss = await signal
    .locator('canvas')
    .evaluateHandle((canvas) =>
      (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context'),
    );
  expect(await loss.evaluate((extension) => Boolean(extension))).toBe(true);
  await loss.evaluate((extension) => extension!.loseContext());
  await expect(signal).toHaveAttribute('data-renderer', 'fallback');
  await expect(signal.locator('img')).toHaveAttribute('src', '/buddy/sprout-v005.png');
  await loss.dispose();
});
