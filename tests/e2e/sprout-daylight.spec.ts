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

test('standalone appearance switches keep the selected live model and conversation draft', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', () => {
    throw Error('Appearance review must stay local.');
  });
  await page.goto('/?studio=panel&material=pearl');
  const signal = page.locator('.buddy .insight-signal');
  const appearance = page.getByRole('combobox', { name: 'Sprout appearance', exact: true });
  const rendering = page.getByRole('combobox', { name: 'Rendering', exact: true });
  const status = page.locator('.panel-preview-render-status');
  const input = page.getByLabel('Tell your buddy what to do');
  const original = '/buddy/sprout-v005.glb';
  const daylight = '/buddy/sprout-v007.glb';
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await input.fill('Keep my draft while comparing the two appearances.');

  for (const asset of [original, daylight, original]) {
    await appearance.selectOption(asset);
    await expect(signal).toHaveAttribute('data-asset-url', asset);
    await expect(signal).toHaveAttribute('data-render-status', 'live');
    await expect(signal).toHaveAttribute('data-renderer', 'webgl');
    await expect(status).toContainText(/live/i);
    await expect(input).toHaveValue('Keep my draft while comparing the two appearances.');
  }

  // Deliberately do not wait for renderer readiness between these changes.
  for (const asset of [daylight, original, daylight, original])
    await appearance.selectOption(asset);
  await expect(appearance).toHaveValue(original);
  await expect(signal).toHaveAttribute('data-asset-url', original);
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await expect(signal.locator('canvas')).toHaveCount(1);
  await page.locator('.panel-preview-scene').screenshot({
    path: 'artifacts/sprout-appearance-v001/live-original.png',
  });

  await rendering.selectOption('reference');
  await expect(signal).toHaveAttribute('data-render-status', 'reference');
  await expect(signal).not.toHaveAttribute('data-renderer', 'webgl');
  await expect(signal.locator('.signal-authored-image')).toHaveAttribute(
    'src',
    '/buddy/sprout-v005.png',
  );
  await expect(signal.locator('.signal-authored-image')).toBeVisible();
  await expect(status).toContainText(/reference/i);
  await expect(input).toHaveValue('Keep my draft while comparing the two appearances.');
  await page.locator('.panel-preview-scene').screenshot({
    path: 'artifacts/sprout-appearance-v001/reference-original.png',
  });

  await rendering.selectOption('live');
  await expect(signal).toHaveAttribute('data-asset-url', original);
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await expect(input).toHaveValue('Keep my draft while comparing the two appearances.');
  expect(errors).toEqual([]);
});

test('an explicit Original reference URL shows its preserved PNG without loading a GLB', async ({
  page,
}) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.glb')) modelRequests.push(request.url());
  });
  await page.goto('/?studio=panel&material=pearl&asset=sprout-v005&render=reference');
  const signal = page.locator('.buddy .insight-signal');
  const image = signal.locator('.signal-authored-image');
  await expect(page.getByRole('combobox', { name: 'Sprout appearance', exact: true })).toHaveValue(
    '/buddy/sprout-v005.glb',
  );
  await expect(page.getByRole('combobox', { name: 'Rendering', exact: true })).toHaveValue(
    'reference',
  );
  await expect(signal).toHaveAttribute('data-render-status', 'reference');
  await expect(signal).not.toHaveAttribute('data-renderer', 'webgl');
  await expect(image).toHaveAttribute('src', '/buddy/sprout-v005.png');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('.panel-preview-render-status')).toContainText(/reference/i);
  expect(modelRequests).toEqual([]);
});

test('standalone loading and context loss are reported distinctly from live rendering', async ({
  page,
}) => {
  let releaseModel!: () => void;
  const modelGate = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  await page.route('**/buddy/sprout-v005.glb', async (route) => {
    await modelGate;
    await route.continue();
  });
  await page.goto('/?studio=panel&asset=sprout-v005', { waitUntil: 'domcontentloaded' });
  const signal = page.locator('.buddy .insight-signal');
  const status = page.locator('.panel-preview-render-status');
  try {
    await expect(signal).toHaveAttribute('data-render-status', 'loading');
    await expect(signal).not.toHaveAttribute('data-renderer', 'webgl');
    await expect(status).toContainText(/loading/i);
  } finally {
    releaseModel();
  }
  await expect(signal).toHaveAttribute('data-render-status', 'live');
  await expect(signal).toHaveAttribute('data-asset-url', '/buddy/sprout-v005.glb');
  const loss = await signal
    .locator('canvas')
    .evaluateHandle((canvas) =>
      (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context'),
    );
  expect(await loss.evaluate((extension) => Boolean(extension))).toBe(true);
  await loss.evaluate((extension) => extension!.loseContext());
  await expect(signal).toHaveAttribute('data-render-status', 'fallback');
  await expect(signal).toHaveAttribute('data-renderer', 'fallback');
  await expect(status).toContainText(/still image.*3D unavailable/i);
  await expect(signal.locator('.signal-authored-image')).toHaveAttribute(
    'src',
    '/buddy/sprout-v005.png',
  );
  await expect(signal.locator('.signal-authored-image')).toBeVisible();
  await loss.dispose();
});
