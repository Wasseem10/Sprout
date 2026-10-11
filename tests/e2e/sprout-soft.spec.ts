import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const soft = '/buddy/sprout-v008.glb';
const output = 'artifacts/sprout-soft-v008/panel';

test('Soft Original stays live through appearance changes, reference comparison and panel collapse', async ({
  page,
}) => {
  test.setTimeout(60000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto('/?studio=panel&material=pearl&asset=sprout-v008');
  const signal = page.locator('.buddy .insight-signal');
  const appearance = page.getByRole('combobox', { name: 'Sprout appearance', exact: true });
  const rendering = page.getByRole('combobox', { name: 'Rendering', exact: true });
  const input = page.getByLabel('Tell your buddy what to do');
  await expect(appearance).toHaveValue(soft);
  await expect(rendering).toHaveValue('live');
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await expect(signal).toHaveAttribute('data-asset-url', soft);
  await expect(page.getByLabel('Texture strength')).toHaveValue('40');
  await expect(page.locator('.panel-preview-render-status')).toHaveText('Soft Original · Live 3D');
  await page.locator('.buddy').screenshot({ path: `${output}/soft-expanded.png` });
  await input.fill('Keep this draft through every appearance.');

  // Change again before the preceding asynchronous renderer necessarily finishes.
  for (const asset of ['/buddy/sprout-v005.glb', '/buddy/sprout-v007.glb', soft])
    await appearance.selectOption(asset);
  await expect(signal).toHaveAttribute('data-asset-url', soft);
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await expect(signal.locator('canvas')).toHaveCount(1);
  await expect(input).toHaveValue('Keep this draft through every appearance.');
  await rendering.selectOption('reference');
  await expect(signal).toHaveAttribute('data-render-status', 'reference');
  await expect(signal.locator('.signal-authored-image')).toHaveAttribute(
    'src',
    '/buddy/sprout-v008.png',
  );
  await rendering.selectOption('live');
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await expect(signal).toHaveAttribute('data-asset-url', soft);
  await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Expand buddy/ })).toBeVisible();
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await page.locator('.panel-preview-scene').screenshot({ path: `${output}/soft-compact.png` });
  await page.getByRole('button', { name: /^Expand buddy/ }).click();
  await expect(input).toHaveValue('Keep this draft through every appearance.');
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
});

test('the studio binds Soft Original to its own shading and falls back with the loaded asset lighting', async ({
  page,
}) => {
  await page.goto('/?studio=buddy&asset=sprout-v008');
  const report = () =>
    page
      .locator('.studio-render-report')
      .getAttribute('data-diagnostics')
      .then((value) => (value ? JSON.parse(value) : null));
  await expect
    .poll(report)
    .toMatchObject({ assetUrl: soft, reflectionProfile: 'soft', assetIssues: [] });
  await expect(page.getByLabel('Sprout appearance')).toHaveValue(soft);
  await page.route('**/buddy/sprout-v008.glb', (route) => route.abort());
  await page.reload();
  await expect.poll(report).toMatchObject({
    assetUrl: '/buddy/sprout-v007.glb',
    reflectionProfile: 'daylight',
    assetIssues: [],
  });
  await expect(page.locator('.studio-launcher .insight-signal')).toHaveAttribute(
    'data-renderer',
    'webgl',
  );
});
