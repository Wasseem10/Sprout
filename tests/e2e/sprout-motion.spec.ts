import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

test('actual Sprout export renders at review sizes and runs a labelled simulated replay', async ({
  page,
}) => {
  test.setTimeout(65000);
  const asset = await readFile(path.resolve('public/buddy/sprout-v004.glb'));
  const assetSha256 = createHash('sha256').update(asset).digest('hex');
  const artifactDir = path.resolve('artifacts/glass-sprout-v004/sprout-browser');
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?studio=buddy');
  const visual = page.locator('.studio-launcher .insight-signal');
  await expect(visual).toHaveAttribute('data-renderer', 'webgl', { timeout: 30000 });
  await expect(visual).toHaveAttribute('data-model', 'sprout');
  await mkdir(artifactDir, { recursive: true });
  for (const size of [44, 96, 160]) {
    await page.getByRole('button', { name: `${size}px`, exact: true }).click();
    await expect(visual).toHaveCSS('width', `${size}px`);
    const box = await visual.boundingBox();
    expect(box?.width).toBeCloseTo(size, 2);
    expect(box?.height).toBeCloseTo(size, 2);
    await visual.screenshot({ path: path.join(artifactDir, `sprout-${size}.png`) });
  }
  await page.getByRole('button', { name: '96px', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await visual.scrollIntoViewIfNeeded();
  // Keep the avatar in view: proof inputs are synthetic and must not scroll the canvas offscreen.
  await page
    .getByRole('button', { name: 'Blink', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  // This is a visual review still, not an assertion of an exact compositor timestamp.
  await page.waitForTimeout(65);
  await visual.screenshot({ path: path.join(artifactDir, 'sprout-blink-review.png') });
  await page
    .getByRole('button', { name: 'Run simulated replay', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(
    page.getByRole('button', { name: 'Stop simulated replay', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run simulated replay', exact: true })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(visual).toHaveAttribute('data-phase', 'idle');
  await expect(page.getByRole('button', { name: 'Pause motion', exact: true })).toBeVisible();
  await page
    .getByText('Renderer measurement', { exact: true })
    .evaluate((summary) => (summary as HTMLElement).click());
  const report = await page.locator('.studio-render-report').innerText();
  expect(report).toContain('Sprout');
  expect(report).not.toContain('Sprout export gate:');
  expect(Number(report.match(/([\d,]+) rendered frames/)?.[1].replaceAll(',', ''))).toBeGreaterThan(
    100,
  );
  const gpu = await visual.locator('canvas').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = context?.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: extension ? context!.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      renderer: extension ? context!.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      width: (canvas as HTMLCanvasElement).width,
      height: (canvas as HTMLCanvasElement).height,
    };
  });
  await writeFile(
    path.join(artifactDir, 'report.json'),
    `${JSON.stringify({ checkedAt: new Date().toISOString(), assetSha256, assetBytes: asset.length, kind: 'Current authored Sprout asset, headless browser simulated six-clip proof; separate from native production and real voice verification', report, gpu, errors, apiCalls }, null, 2)}\n`,
  );
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
});
