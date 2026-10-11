// Actual-component optical regression: the retained opacity animation must not
// prevent frost sampling owned page pixels while the visual plane is tilted.
import { chromium, expect } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argument = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const tag = argument('proof-tag', 'glass-panel-v006-frost-fix');
assert.match(tag, /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/);
const output = path.join('artifacts', tag, 'active-tilt');
await mkdir(output, { recursive: true });
const requests = [],
  errors = [],
  results = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = Object.fromEntries(
  await Promise.all(
    ['src/DesktopBuddy.tsx', 'src/buddy.css', 'src/useBuddyTilt.ts', 'src/useBuddyPanel.ts'].map(
      async (name) => [name, digest(await readFile(name))],
    ),
  ),
);

async function stripeStep(buffer, scan) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(scan.x, scan.y, scan.width, scan.height).data;
  let maximumAdjacentRgbStep = 0;
  for (let y = 0; y < scan.height; y++)
    for (let x = 1; x < scan.width; x++) {
      const offset = (y * scan.width + x) * 4;
      const step =
        [0, 1, 2].reduce(
          (sum, channel) => sum + Math.abs(pixels[offset + channel] - pixels[offset - 4 + channel]),
          0,
        ) / 3;
      maximumAdjacentRgbStep = Math.max(maximumAdjacentRgbStep, step);
    }
  return maximumAdjacentRgbStep;
}

const browser = await chromium.launch({ args: ['--disable-gpu'] });
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1200 },
    reducedMotion: 'no-preference',
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind.startsWith('webgl') ? null : original.apply(this, [kind, ...args]);
    };
  });
  await context.route('**/api/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173'}/?studio=panel`);
  const root = page.locator('.buddy'),
    plane = root.locator('.buddy-visual-plane');
  await expect(root).toHaveAttribute('data-panel-stage', 'open');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'busy', exact: true }).click();
  const box = await root.boundingBox();
  const animation = await page.locator('.buddy-panel-glass').evaluate((element) =>
    element.getAnimations().map((value) => ({
      playState: value.playState,
      fill: value.effect.getComputedTiming().fill,
    })),
  );
  assert.ok(
    animation.some((value) => value.playState === 'finished' && value.fill === 'both'),
    'Exercise retained opening opacity animation, not the reduced-motion path.',
  );

  for (const direction of ['left', 'right']) {
    await page.mouse.move(
      box.x + (direction === 'left' ? 8 : box.width - 8),
      box.y + box.height / 2,
    );
    await expect(plane).toHaveAttribute('data-tilt', 'active');
    await expect.poll(() => plane.evaluate((element) => element.style.willChange)).toBe('');
    const pose = await plane.evaluate((element) => element.style.transform);
    assert.match(
      pose,
      /rotateY\(-?1\./,
      'Nonzero near-limit yaw is necessary for composited sampling proof.',
    );
    const scan = await root.evaluate((element) => {
      const root = element.getBoundingClientRect();
      const message = element.querySelector('.buddy-message:last-child').getBoundingClientRect();
      const composer = element.querySelector('.buddy-composer').getBoundingClientRect();
      const middle = (message.bottom + composer.top) / 2;
      return {
        x: 40,
        y: Math.round(middle - root.top) - 8,
        width: Math.floor(root.width - 80),
        height: 16,
      };
    });
    assert.ok(scan.y > 0 && scan.y + scan.height < box.height);
    // Recreate the exact failed filter ownership on otherwise identical current
    // component, angle and retained WAAPI animation, then remove only this style.
    const failed = await page.addStyleTag({
      content:
        '.buddy-panel-glass{backdrop-filter:none!important}.buddy-panel-glass::after{backdrop-filter:blur(14px) saturate(112%)!important}',
    });
    const before = await root.screenshot();
    await page
      .locator('.panel-preview-scene')
      .screenshot({ path: path.join(output, `${direction}-before.png`) });
    await failed.evaluate((element) => element.remove());
    const after = await root.screenshot();
    await page
      .locator('.panel-preview-scene')
      .screenshot({ path: path.join(output, `${direction}-after.png`) });
    const sharpStep = await stripeStep(before, scan),
      frostedStep = await stripeStep(after, scan);
    assert.ok(
      sharpStep > 25,
      `A stripe boundary must cross the sampled clear reading well (${sharpStep}).`,
    );
    assert.ok(
      frostedStep < sharpStep * 0.35,
      `Active frost must soften observed edges, not merely declare a filter (${frostedStep}/${sharpStep}).`,
    );
    assert.deepEqual(
      await root.boundingBox(),
      box,
      'Optical change must not move the fixed input surface.',
    );
    assert.equal(await plane.evaluate((element) => element.style.transform), pose);
    results.push({
      direction,
      pose,
      scan,
      sharpStep,
      frostedStep,
      edgeStepRatio: frostedStep / sharpStep,
    });
  }
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    pass: true,
    source,
    animation,
    results,
    requests,
    errors,
    limits: [
      'Actual production DesktopBuddy within its local panel preview; sample messages and PNG avatar, no WebGL or provider/microphone session.',
      'Matched before recreates failed descendant filter ownership through a temporary CSS override. After is unmodified current product CSS.',
      'Observed adjacent RGB steps in the empty reading well certify owned webpage stripe softening at nonzero left/right yaw; not OS desktop blur or performance evidence.',
    ],
  };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report }, null, 2));
} finally {
  await browser.close();
}
