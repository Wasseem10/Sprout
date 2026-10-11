import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const label = process.env.SPROUT_GLASS_PROOF ?? 'after';
const output = `artifacts/sprout-gaze-glass/${label}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const samples = [];
// A fixed committed renderer supplies a reproducible pre-fix comparison without
// reverting the user's working tree or modifying any of the shipped model files.
const baselinePath = 'src/__sprout-gaze-baseline.ts';
let baselineCreated = false;
try {
  if (label === 'before') {
    await writeFile(baselinePath, execFileSync('git', ['show', '6d5b35d:src/buddyRenderer.ts']), {
      flag: 'wx',
    });
    baselineCreated = true;
  }
  const page = await browser.newPage({ viewport: { width: 900, height: 395 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/__sprout-gaze-glass', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><title>Sprout eye refraction review</title><body></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:5173/__sprout-gaze-glass');
  await page.evaluate(
    async (modulePath) => {
      document.body.innerHTML =
        '<h1>Sprout eye refraction · actual live renderer</h1><p id="direction">Neutral</p><main></main>';
      const style = document.createElement('style');
      style.textContent =
        'body{margin:0;padding:18px;background:#edf5fc;color:#18304b;font:15px Arial}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 12px}main{display:flex;gap:20px}section{width:270px;border-radius:22px;background:linear-gradient(125deg,#fff,#deebf8)}h2{font-size:16px;margin:14px 15px 0}.stage{width:260px;height:260px;position:relative}canvas{width:100%;height:100%}';
      document.head.append(style);
      const { createBuddyRenderer } = await import(modulePath);
      window.__gazeGlass = [];
      for (const [version, name] of [
        ['v005', 'Original'],
        ['v007', 'Daylight'],
        ['v008', 'Soft Original'],
      ]) {
        const section = document.createElement('section');
        section.innerHTML = `<h2>${name}</h2><div class="stage"><canvas></canvas></div>`;
        document.querySelector('main').append(section);
        const settings = {
          assetUrl: `/buddy/sprout-${version}.glb`,
          phase: 'idle',
          motion: true,
          gaze: { x: 0, y: 0 },
        };
        const renderer = await createBuddyRenderer(
          section.querySelector('canvas'),
          settings,
          () => {},
        );
        if (!renderer) throw Error(`No renderer for ${version}`);
        window.__gazeGlass.push({ renderer, settings });
      }
    },
    label === 'before' ? '/src/__sprout-gaze-baseline.ts' : '/src/buddyRenderer.ts',
  );
  const directions = [
    ['neutral', 0, 0],
    ['left', -1, 0],
    ['right', 1, 0],
    ['up', 0, 1],
    ['down', 0, -1],
    ['up-left', -1, 1],
    ['up-right', 1, 1],
    ['down-left', -1, -1],
    ['down-right', 1, -1],
  ];
  for (const [name, x, y] of directions) {
    await page.evaluate(
      ({ name, x, y }) => {
        document.querySelector('#direction').textContent = `Look ${name}`;
        for (const item of window.__gazeGlass) {
          item.settings = { ...item.settings, gaze: { x, y } };
          item.renderer.update(item.settings);
        }
      },
      { name, x, y },
    );
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.__gazeGlass.every(({ renderer }) => renderer.diagnostics().frames > 12),
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${output}/${name}.png` });
    samples.push({
      name,
      diagnostics: await page.evaluate(() =>
        window.__gazeGlass.map(({ renderer }) => renderer.diagnostics()),
      ),
    });
  }
  await page.evaluate(() => window.__gazeGlass.forEach(({ renderer }) => renderer.dispose()));
  expect(errors).toEqual([]);
} finally {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        scope:
          'Shipped GLBs and renderer with explicit gaze inputs, actual wall-time animation; no camera/pose/material overrides. Visual inspection required.',
        errors,
        samples,
      },
      null,
      2,
    ),
  );
  await browser.close();
  if (baselineCreated) await unlink(baselinePath);
}
console.log(JSON.stringify({ output, samples: samples.length, errors }));
