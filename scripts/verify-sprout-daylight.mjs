import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const output = 'artifacts/sprout-daylight-v006/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const requests = [],
  errors = [],
  results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1100 },
    deviceScaleFactor: 1,
  });
  await context.route('**/api/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddyMotionPaused', 'true');
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        throw Error('No microphone in avatar visual review.');
      },
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/?studio=panel');
  const visual = page.locator('.buddy .insight-signal');
  for (const [label, version] of [
    ['Original', 'v005'],
    ['Daylight', 'v006'],
  ]) {
    await page.getByLabel('Sprout appearance').selectOption({ label });
    await expect(visual).toHaveAttribute('data-asset-url', `/buddy/sprout-${version}.glb`);
    await expect(visual).toHaveAttribute('data-renderer', 'webgl');
    for (const background of ['light', 'dark', 'busy']) {
      await page.getByRole('button', { name: background, exact: true }).click();
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(20, 20);
      await page
        .locator('.buddy')
        .screenshot({ path: `${output}/${version}-panel-${background}.png` });
      await visual.screenshot({ path: `${output}/${version}-72-${background}.png` });
      results.push({ version, background, width: (await visual.boundingBox()).width });
    }
  }
  // A controlled, owned review scene calls the real renderer with unchanged
  // camera, tone mapper, assets and material defaults at diagnostic/tiny sizes.
  await page.route('**/__daylight-review', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Sprout material comparison</title></head><body></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:5173/__daylight-review');
  await page.evaluate(async () => {
    document.body.innerHTML = '<main id="daylight-board"></main>';
    const style = document.createElement('style');
    style.textContent = `html,body{margin:0;background:#edf4fa;color:#142638;font-family:Arial,sans-serif}#daylight-board{padding:24px;width:820px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.study{background:#fff;border-radius:16px;padding:16px}.study h2{margin:0 0 8px;font-size:18px}.sizes{display:flex;align-items:center;gap:12px}.view{position:relative;flex:none}.view canvas{width:100%;height:100%}.caption{font-size:13px;margin:4px 0 12px}`;
    document.head.append(style);
    const { createBuddyRenderer } = await import('/src/buddyRenderer.ts');
    window.__daylightRenderers = [];
    window.__daylightProfiles = [];
    for (const version of ['v005', 'v006']) {
      const cell = document.createElement('section');
      cell.className = 'study';
      cell.innerHTML = `<h2>${version === 'v005' ? 'Original · preserved' : 'Daylight · softer reflections'}</h2><p class="caption">Actual WebGL · white background</p>`;
      document.querySelector('#daylight-board').append(cell);
      const small = document.createElement('div');
      small.className = 'sizes';
      for (const size of [300, 44, 72, 96]) {
        const owner = document.createElement('div');
        owner.className = 'view';
        owner.style.width = owner.style.height = `${size}px`;
        const canvas = document.createElement('canvas');
        owner.append(canvas);
        (size === 300 ? cell : small).append(owner);
        if (size !== 300 && !small.isConnected) cell.append(small);
        const renderer = await createBuddyRenderer(
          canvas,
          { phase: 'idle', motion: false, assetUrl: `/buddy/sprout-${version}.glb` },
          () => {},
        );
        if (!renderer) throw Error(`Could not render ${version}/${size}`);
        window.__daylightRenderers.push(renderer);
        window.__daylightProfiles.push(renderer.diagnostics());
      }
    }
  });
  const diagnostics = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__daylightRenderers.map((renderer) => renderer.diagnostics());
  });
  for (const diag of diagnostics) {
    expect(diag.assetIssues).toEqual([]);
    expect(diag.eyeProfile).toBe('happy-eyes-v005');
    expect(diag.clips).toHaveLength(11);
    expect(diag.reflectionProfile).toBe(
      diag.assetUrl.endsWith('v006.glb') ? 'daylight' : 'tapered',
    );
  }
  await page
    .locator('#daylight-board')
    .screenshot({ path: `${output}/original-daylight-white-comparison.png` });
  await page.evaluate(() => window.__daylightRenderers.forEach((renderer) => renderer.dispose()));
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  const hashes = {};
  for (const version of ['v005', 'v006'])
    hashes[version] = createHash('sha256')
      .update(await readFile(`public/buddy/sprout-${version}.glb`))
      .digest('hex');
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          'Actual DesktopBuddy panels and controlled Three renderer board; simulated states, paused motion, no CSS/material post-capture edits. PNG fallbacks are checked separately.',
        hashes,
        results,
        diagnostics,
        requests,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      hashes,
      views: results.length,
      profiles: diagnostics.map((d) => [d.assetUrl, d.reflectionProfile, d.resolution]),
    }),
  );
} finally {
  await browser.close();
}
