import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

for (const variant of ['glossy', 'transmission', 'refined', 'final']) {
  test(`matched original Sprout ${variant} material at review sizes`, async ({ page }) => {
    test.setTimeout(65000);
    const bytes = await readFile(
      path.resolve(
        'design/buddy/sprout',
        variant === 'final' ? 'sprout-prism-v002.glb' : `sprout-prism-${variant}-v002.glb`,
      ),
    );
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const artifactDir = path.resolve('artifacts/sprout-web-look');
    await mkdir(artifactDir, { recursive: true });
    await page.route('**/buddy/sprout-v002.glb', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'model/gltf-binary',
        body: bytes,
      }),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?studio=buddy');
    const visual = page.locator('.studio-launcher .insight-signal');
    await expect(visual).toHaveAttribute('data-renderer', 'webgl', { timeout: 30000 });
    await expect(visual).toHaveAttribute('data-model', 'sprout');
    for (const size of [44, 96, 160, 320]) {
      if (size <= 160) await page.getByRole('button', { name: `${size}px`, exact: true }).click();
      else
        await visual.evaluate((node) => {
          (node as HTMLElement).style.width = '320px';
          (node as HTMLElement).style.height = '320px';
        });
      await visual.scrollIntoViewIfNeeded();
      await expect(visual).toHaveCSS('width', `${size}px`);
      const box = await visual.boundingBox();
      expect(box?.width).toBeCloseTo(size, 1);
      expect(box?.height).toBeCloseTo(size, 1);
      // ResizeObserver and the still renderer complete before this review still.
      await expect
        .poll(() =>
          visual.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).width),
        )
        .toBe(Math.min(size, 420));
      await visual.screenshot({ path: path.join(artifactDir, `${variant}-${size}.png`) });
    }
    const diagnostics = await page
      .locator('.studio-render-report')
      .getAttribute('data-diagnostics');
    await writeFile(
      path.join(artifactDir, `${variant}-report.json`),
      `${JSON.stringify(
        {
          kind: 'Matched browser stills: Idle at time zero, reduced motion. 320px is an inspection fixture, not a shipped size.',
          assetSha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
          diagnostics: diagnostics ? JSON.parse(diagnostics) : null,
          errors,
        },
        null,
        2,
      )}\n`,
    );
    expect(errors).toEqual([]);
  });
}
