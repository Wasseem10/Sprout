import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// These are captures of the actual shared panel, not a replacement character scene.
// Shader correctness is checked by visual inspection alongside the renderer proof;
// this integration test ensures both layouts keep using the requested live asset.
test.use({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });

for (const version of ['v007', 'v008']) {
  test(`${version} keeps a live face through pointer turns in compact and expanded panels`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const baseline = process.env.SPROUT_GAZE_BASELINE === '1';
    const directory = `artifacts/sprout-gaze-glass/panel/${baseline ? 'before/' : ''}${version}`;
    await mkdir(directory, { recursive: true });
    const errors: string[] = [];
    const apiCalls: string[] = [];
    const requestedModels: string[] = [];
    let baselineLoads = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    if (baseline)
      await page.route(/\/src\/buddyRenderer\.ts(?:\?|$)/, async (route) => {
        const response = await page.request.get('/src/buddyRenderer.gaze-baseline.ts');
        expect(response.ok()).toBe(true);
        baselineLoads += 1;
        await route.fulfill({ response });
      });
    await page.route('**/api/**', async (route) => {
      apiCalls.push(route.request().url());
      await route.abort();
    });
    await page.route('**/buddy/*.glb', async (route) => {
      const path = new URL(route.request().url()).pathname;
      requestedModels.push(path);
      // A fallback cannot silently satisfy a proof of the selected version.
      if (path === `/buddy/sprout-${version}.glb`) await route.continue();
      else await route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem('insightos.buddyMotionPaused', 'false');
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          throw new Error('The panel visual proof must not activate the microphone.');
        },
      });
    });
    await page.goto(`/?studio=panel&material=pearl&asset=sprout-${version}`);
    const panel = page.locator('.buddy');
    const face = panel.locator('.buddy-face');
    const signal = face.locator('.insight-signal');
    await expect(signal).toHaveAttribute('data-render-status', 'live');
    if (baseline) expect(baselineLoads).toBeGreaterThan(0);
    await expect(signal).toHaveAttribute('data-asset-url', `/buddy/sprout-${version}.glb`);
    await expect(page.getByRole('slider', { name: /Texture strength/ })).toHaveValue('40');
    const proof: { layout: string; direction: string; x: number; y: number; file: string }[] = [];
    const directions = [
      ['center', 0.5, 0.5],
      ['left', 0.04, 0.5],
      ['up-left', 0.04, 0.04],
      ['up', 0.5, 0.04],
      ['up-right', 0.96, 0.04],
      ['right', 0.96, 0.5],
      ['down-right', 0.96, 0.96],
      ['down', 0.5, 0.96],
      ['down-left', 0.04, 0.96],
    ] as const;

    for (const layout of ['expanded', 'compact']) {
      if (layout === 'compact') {
        await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
        await expect(panel).toHaveAttribute('data-panel-stage', 'closed');
      } else await expect(panel).toHaveAttribute('data-panel-stage', 'open');
      await face.scrollIntoViewIfNeeded();
      const box = await face.boundingBox();
      expect(box).not.toBeNull();
      for (const [direction, horizontal, vertical] of directions.filter(
        ([direction]) =>
          !baseline || ['center', 'up-left', 'down-right', 'down-left'].includes(direction),
      )) {
        const x = box!.x + box!.width * horizontal;
        const y = box!.y + box!.height * vertical;
        await page.mouse.move(x, y, { steps: 4 });
        await page.waitForTimeout(120);
        await face.screenshot({ path: `${directory}/${layout}-${direction}-moving.png` });
        // The actual gaze and attention springs need time to settle at each extreme.
        await page.waitForTimeout(600);
        await expect(signal).toHaveAttribute('data-render-status', 'live');
        const file = `${directory}/${layout}-${direction}.png`;
        await face.screenshot({ path: file });
        proof.push({ layout, direction, x, y, file });
      }
      const bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      for (const [direction, horizontal, vertical] of [
        ['panel-top-left', 0.01, 0.01],
        ['panel-bottom-right', 0.99, 0.99],
      ] as const) {
        const x = bounds!.x + bounds!.width * horizontal;
        const y = bounds!.y + bounds!.height * vertical;
        await page.mouse.move(x, y, { steps: 4 });
        await page.waitForTimeout(720);
        await expect(signal).toHaveAttribute('data-render-status', 'live');
        const file = `${directory}/${layout}-${direction}.png`;
        await face.screenshot({ path: file });
        proof.push({ layout, direction, x, y, file });
      }
      await panel.screenshot({ path: `${directory}/${layout}-panel.png` });
    }
    await page.getByRole('button', { name: /^Expand buddy/ }).click();
    await expect(panel).toHaveAttribute('data-panel-stage', 'open');
    await expect(signal).toHaveAttribute('data-render-status', 'live');
    expect(new Set(requestedModels)).toEqual(new Set([`/buddy/sprout-${version}.glb`]));
    expect(apiCalls).toEqual([]);
    expect(errors).toEqual([]);
    await writeFile(
      `${directory}/integration.json`,
      JSON.stringify(
        {
          asset: version,
          live: true,
          baselineLoads,
          apiCalls,
          errors,
          requestedModels,
          captures: proof,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
