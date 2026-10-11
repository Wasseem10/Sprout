import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'artifacts/sprout-soft-v008/study';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1120, height: 640 },
    deviceScaleFactor: 1,
  });
  await page.route('**/__soft-study', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Sprout material comparison</title><body></body>',
    }),
  );
  await page.goto('http://127.0.0.1:5173/__soft-study');
  const diagnostics = await page.evaluate(async (asset) => {
    const style = document.createElement('style');
    style.textContent =
      'body{margin:0;background:#f4f8fd;color:#172c42;font:16px Arial}main{display:flex;gap:18px;padding:24px}section{width:336px}h2{font-size:18px;margin:0 0 12px}.stage{background:linear-gradient(120deg,#f9fcff,#e0ecf8);border-radius:24px;position:relative;width:320px;height:320px}canvas,img{width:100%;height:100%;object-fit:contain}.small{width:112px;height:112px;position:relative;margin-top:12px}p{font-size:14px}';
    document.head.append(style);
    const main = document.createElement('main');
    document.body.append(main);
    const { createBuddyRenderer } = await import('/src/buddyRenderer.ts');
    window.__softStudy = [];
    for (const [label, path, profile] of [
      ['Preferred still reference', '/buddy/sprout-v005.png', null],
      ['Original live 3D', '/buddy/sprout-v005.glb', 'tapered'],
      ['Soft Original live 3D', asset, 'soft'],
    ]) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = label;
      section.append(heading);
      main.append(section);
      for (const size of [320, 112]) {
        const owner = document.createElement('div');
        owner.className = size === 320 ? 'stage' : 'small';
        section.append(owner);
        if (!profile) {
          const image = document.createElement('img');
          image.src = path;
          owner.append(image);
          await image.decode();
        } else {
          const canvas = document.createElement('canvas');
          owner.append(canvas);
          const renderer = await createBuddyRenderer(
            canvas,
            { assetUrl: path, reflectionProfile: profile, motion: false, phase: 'idle' },
            () => {},
          );
          if (!renderer) throw Error('Renderer unavailable');
          window.__softStudy.push(renderer);
        }
      }
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__softStudy.map((renderer) => renderer.diagnostics());
  }, process.env.SPROUT_STUDY_ASSET || '/buddy/sprout-v008.glb');
  await page.screenshot({ path: `${output}/comparison.png` });
  await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
  await page.evaluate(() => window.__softStudy.forEach((renderer) => renderer.dispose()));
  console.log(
    JSON.stringify({ output, assets: diagnostics.map((d) => [d.assetUrl, d.reflectionProfile]) }),
  );
} finally {
  await browser.close();
}
