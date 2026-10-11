import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

// Bounded HTML-only review of the actual static asset. No image recolouring,
// WebGL, provider request, desktop capture, or live application mutation.
const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(directory, 'sprout-prism-v003.png');
const runtime = path.resolve(directory, '../../../public/buddy/sprout-v003.png');
const output = path.join(directory, 'proofs/sprout-prism-v003-fallback-backgrounds.png');
const bytes = await readFile(source);
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
if (digest(bytes) !== digest(await readFile(runtime))) throw new Error('Fallback copies differ.');
if (bytes.readUInt32BE(16) !== 640 || bytes.readUInt32BE(20) !== 640 || bytes[25] !== 6) {
  throw new Error('Expected 640px RGBA PNG.');
}
const url = `data:image/png;base64,${bytes.toString('base64')}`;
const browser = await chromium.launch({ args: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 660 }, deviceScaleFactor: 1 });
  const fixtures = [
    ['bright', '#f5faff', '#162d3d'],
    ['dark', '#091827', '#e9f5fb'],
    ['busy', 'repeating-linear-gradient(130deg,#366ba1 0 26px,#efcf8e 26px 48px,#b881a7 48px 72px,#9fdbc5 72px 94px)', '#101a20'],
  ];
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;background:#f1f5f7;font:16px Arial;color:#162d3d}
    header{padding:18px 24px;height:60px}section{margin:0 16px 14px;display:flex;height:180px;border-radius:16px;overflow:hidden}
    .label{width:160px;padding:24px;font-weight:bold;background:#ffffff80}
    figure{margin:0;flex:1;display:flex;align-items:center;justify-content:center;gap:20px}
    figcaption{font-size:14px;background:#ffffffd0;color:#132c3d;padding:5px 8px;border-radius:7px}
    img{display:block;object-fit:contain}
  </style><header>Selected Sprout v003 · actual source-backed PNG · CSS pixels · HTML only</header>
  ${fixtures.map(([name, background, colour]) => `<section style="background:${background};color:${colour}">
    <div class="label">${name}</div>${[44, 96, 160].map(size => `<figure><img src="${url}" width="${size}" height="${size}" alt="Sprout ${size}px"><figcaption>${size}px</figcaption></figure>`).join('')}
  </section>`).join('')}`);
  const decoded = await page.locator('img').evaluateAll(images => images.map(image => ({
    width: image.width, height: image.height, naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight, complete: image.complete,
  })));
  if (decoded.length !== 9 || decoded.some(image => !image.complete || image.naturalWidth !== 640 || image.naturalHeight !== 640)) {
    throw new Error('Actual fallback failed decoding.');
  }
  await page.screenshot({ path: output });
  const report = {
    source, runtime, sha256: digest(bytes), bytes: bytes.length, copiesEqual: true,
    screenshot: output, decoded, fixtures: fixtures.map(([name, background]) => ({ name, background })),
    scope: 'HTML-only exact static PNG at44/96/160CSSpx on owned backgrounds; GPU disabled. Appearance review, not native compositor/GLB/performance/provider evidence.',
  };
  await writeFile(output.replace('.png', '.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ screenshot: output, sha256: report.sha256, decoded: decoded.length }));
} finally {
  await browser.close();
}
