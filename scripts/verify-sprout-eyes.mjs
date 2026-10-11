import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Actual application/renderer controls only. No model, pose, mixer or clock substitution.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = path.resolve(root, argument('output', 'artifacts/sprout-eyes-v005/browser'));
assert.ok(output.startsWith(path.join(root, 'artifacts') + path.sep));
const baseURL = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';
const assetPath = path.resolve(root, argument('asset', 'public/buddy/sprout-v005.glb'));
const bytes = await readFile(assetPath);
const sha = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
const pngs = new Map();
for (const name of ['sprout-v005.png', 'sprout-v005-sleep.png']) {
  const png = await readFile(path.join(root, 'public/buddy', name));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 640);
  assert.equal(png.readUInt32BE(20), 640);
  pngs.set(`/buddy/${name}`, { bytes: png.length, sha256: sha(png), width: 640, height: 640 });
}
await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  pass: false,
  scope:
    'Actual local React app and Three renderer; labelled simulated Blink/Sleep/Wake controls, real PNG decoding and actual WebGL context loss/recovery. No voice/provider/microphone/native window/performance acceptance.',
  instrumentation:
    'No pose or clock override. Browser WebGL-null interception is used only in the explicitly labelled no-WebGL fallback context. Control clicks use the actual HTML handlers without scrolling the model offscreen. Blink stills are timed visual-review samples, not exact compositor-phase claims; exact peaks are tested separately in CPU actual-GLB regressions.',
  expectedAsset: { path: path.relative(root, assetPath), bytes: bytes.length, sha256: sha(bytes) },
  servedAssets: [],
  expectedPNGs: Object.fromEntries(pngs),
  servedPNGs: [],
  sequence: [],
  diagnostics: [],
  errors: [],
  apiCalls: [],
};
const resumeFlow = process.argv.includes('--resume-flow');
if (resumeFlow) {
  const previous = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  assert.equal(previous.expectedAsset.sha256, report.expectedAsset.sha256);
  for (const size of [44, 72, 96, 320])
    for (const state of ['idle', 'blink-review', 'sleep']) {
      const name = `${state}-${size}`;
      const sample = previous.sequence.find((item) => item.name === name);
      assert.ok(sample, `Missing completed size sample: ${name}`);
      await readFile(path.join(output, `${name}.png`));
      report.sequence.push(sample);
    }
  await writeFile(
    path.join(output, 'report-first-attempt.json'),
    `${JSON.stringify(previous, null, 2)}\n`,
  );
  report.reusedSizeEvidence =
    'The same-hash actual-size captures completed in the prior run before an unrelated Studio panel effect returned a boolean cleanup value. That integration defect is fixed; this run repeats the missing real-panel/fallback behavior with a fresh browser. Prior failed report is retained separately; no prior error is counted as passing evidence.';
}
let browser;
const contexts = [];
let video;
const responseJobs = [];
let deadline;
try {
  browser = await chromium.launch();
  deadline = setTimeout(() => void browser.close(), 90000);
  const setup = async (context) => {
    contexts.push(context);
    await context.route('**/api/**', async (route) => {
      report.apiCalls.push(route.request().url());
      await route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pngs.has(pathname)) {
        responseJobs.push(
          (async () => {
            const png = await response.body();
            assert.equal(response.status(), 200);
            assert.equal(sha(png), pngs.get(pathname).sha256);
            report.servedPNGs.push({ path: pathname, ...pngs.get(pathname) });
          })().catch((error) => report.errors.push(`Served PNG verification: ${error.message}`)),
        );
        return;
      }
      if (pathname !== '/buddy/sprout-v005.glb') return;
      responseJobs.push(
        (async () => {
          const served = await response.body();
          assert.equal(response.status(), 200);
          assert.equal(served.toString('ascii', 0, 4), 'glTF');
          assert.equal(served.readUInt32LE(4), 2);
          assert.equal(served.readUInt32LE(8), served.length);
          assert.equal(sha(served), report.expectedAsset.sha256);
          report.servedAssets.push({
            url: response.url(),
            bytes: served.length,
            sha256: sha(served),
            version: 2,
          });
        })().catch((error) => report.errors.push(`Served asset verification: ${error.message}`)),
      );
    });
    await page.goto(`${baseURL}/?studio=buddy&asset=sprout-v005`);
    return page;
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    recordVideo: { dir: path.join(output, 'raw-video'), size: { width: 1440, height: 1100 } },
  });
  const page = await setup(context);
  video = page.video();
  const launcher = page.locator('.studio-launcher .insight-signal');
  await expect(launcher).toHaveAttribute('data-renderer', 'webgl', { timeout: 30000 });
  const click = async (label) => {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeEnabled();
    await button.evaluate((element) => element.click());
  };
  const diagnostics = async () => {
    await expect
      .poll(async () => {
        const raw = await page.locator('.studio-render-report').getAttribute('data-diagnostics');
        return raw ? JSON.parse(raw).eyeProfile : null;
      })
      .toBe('happy-eyes-v005');
    const value = JSON.parse(
      await page.locator('.studio-render-report').getAttribute('data-diagnostics'),
    );
    assert.equal(value.assetUrl, '/buddy/sprout-v005.glb');
    assert.deepEqual(value.assetIssues, []);
    report.diagnostics.push(value);
  };
  const capture = async (signal, name) => {
    await signal.scrollIntoViewIfNeeded();
    await signal.screenshot({ path: path.join(output, `${name}.png`) });
    report.sequence.push({
      name,
      phase: await signal.getAttribute('data-phase'),
      behavior: await signal.getAttribute('data-behavior'),
      renderer: await signal.getAttribute('data-renderer'),
      box: await signal.boundingBox(),
    });
  };
  await diagnostics();
  const gpu = await launcher.locator('canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  report.gpu = gpu;
  for (const size of resumeFlow ? [] : [44, 72, 96, 320]) {
    await click(`${size}px`);
    await expect(launcher).toHaveCSS('width', `${size}px`);
    await expect(launcher).toHaveCSS('height', `${size}px`);
    await capture(launcher, `idle-${size}`);
    await click('Blink');
    await page.waitForTimeout(65);
    await capture(launcher, `blink-review-${size}`);
    await page.waitForTimeout(200);
    await click('Sleep');
    await expect(launcher).toHaveAttribute('data-behavior', 'sleep');
    await expect(launcher.locator('.signal-sleep-zs')).toBeVisible();
    await capture(launcher, `sleep-${size}`);
    await click('Wake');
    await expect(launcher).toHaveAttribute('data-behavior', 'normal');
    await expect(launcher.locator('.signal-sleep-zs')).toHaveCount(0);
  }
  await click('96px');
  await launcher.scrollIntoViewIfNeeded();
  for (let repetition = 0; repetition < 3; repetition++) {
    await click('Blink');
    await page.waitForTimeout(320);
  }
  await page
    .getByRole('button', { name: 'Expand conversation preview', exact: true })
    .evaluate((element) => element.click());
  const panel = page.locator('.studio-real-panel .buddy');
  const pet = panel.locator('.insight-signal');
  await expect(panel).toHaveAttribute('data-panel-stage', 'open');
  await expect(pet).toHaveAttribute('data-renderer', 'webgl');
  await expect(pet).toHaveCSS('width', '72px');
  await capture(pet, 'actual-panel-idle-72');
  const neutralPet = await pet.boundingBox();
  const fixedPanel = await panel.boundingBox();
  await page.mouse.move(fixedPanel.x + fixedPanel.width - 12, fixedPanel.y + 160);
  await expect(panel.locator('.buddy-visual-plane')).toHaveAttribute('data-tilt', 'active');
  await page.mouse.move(neutralPet.x + neutralPet.width / 2, neutralPet.y + neutralPet.height / 2);
  await expect
    .poll(async () => {
      const current = JSON.parse(
        await page.locator('.studio-render-report').getAttribute('data-diagnostics'),
      );
      return Math.abs(current.attention.target.x) + Math.abs(current.attention.target.y);
    })
    .toBeLessThan(0.025);
  report.sequence.push({
    name: 'actual-panel-neutral-gaze-under-tilt',
    basis: 'Original untilted72px avatar center; panel layout stayed fixed, no pose override',
    pass: true,
  });
  await click('Sleep');
  await expect(pet).toHaveAttribute('data-behavior', 'sleep');
  await capture(pet, 'actual-panel-sleep-72');
  await click('Wake');
  await expect(pet).toHaveAttribute('data-behavior', 'normal');
  await panel
    .getByRole('button', { name: 'Collapse conversation', exact: true })
    .evaluate((element) => element.click());
  await expect(panel).toHaveAttribute('data-panel-stage', 'closed');
  await launcher.scrollIntoViewIfNeeded();
  await click('Sleep');
  await expect(launcher).toHaveAttribute('data-behavior', 'sleep');
  await click('Pause motion');
  await capture(launcher, 'sleep-static-96');
  const before = await launcher.screenshot();
  await page.waitForTimeout(250);
  assert.ok(
    before.equals(await launcher.screenshot()),
    'Paused actual sleeping model must stay still',
  );
  const loss = await launcher
    .locator('canvas')
    .evaluateHandle((canvas) => canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context'));
  assert.ok(await loss.evaluate((extension) => Boolean(extension)));
  await loss.evaluate((extension) => extension.loseContext());
  await expect(launcher).toHaveAttribute('data-renderer', 'fallback');
  await expect(launcher.locator('img')).toHaveAttribute('src', '/buddy/sprout-v005-sleep.png');
  await expect
    .poll(() => launcher.locator('img').evaluate((image) => image.naturalWidth))
    .toBe(640);
  await capture(launcher, 'sleep-context-loss-png-96');
  await loss.evaluate((extension) => extension.restoreContext());
  await expect(launcher).toHaveAttribute('data-renderer', 'webgl');
  await expect(launcher).toHaveAttribute('data-behavior', 'sleep');
  await capture(launcher, 'sleep-context-restored-96');
  await loss.dispose();
  await click('Wake');
  await expect(launcher).toHaveAttribute('data-behavior', 'normal');
  await capture(launcher, 'idle-static-96');
  await diagnostics();
  await context.close();
  await video.saveAs(path.join(output, 'actual-eye-sleep-wake.webm'));
  await video.delete();
  const fallback = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
  });
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind.startsWith('webgl') ? null : getContext.apply(this, [kind, ...args]);
    };
  });
  const fallbackPage = await setup(fallback);
  const fallbackSignal = fallbackPage.locator('.studio-launcher .insight-signal');
  await expect(fallbackSignal).toHaveAttribute('data-renderer', 'fallback');
  await expect(fallbackSignal.locator('img')).toHaveAttribute('src', '/buddy/sprout-v005.png');
  await expect
    .poll(() => fallbackSignal.locator('img').evaluate((image) => image.naturalWidth))
    .toBe(640);
  await fallbackSignal.screenshot({ path: path.join(output, 'no-webgl-idle-png-96.png') });
  await expect(fallbackPage.getByRole('button', { name: 'Sleep', exact: true })).toBeDisabled();
  await fallback.close();
  await Promise.all(responseJobs);
  assert.ok(report.servedAssets.length > 0);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.apiCalls, []);
  const board = createCanvas(1360, 1140);
  const painter = board.getContext('2d');
  painter.fillStyle = '#f4f8fb';
  painter.fillRect(0, 0, board.width, board.height);
  painter.fillStyle = '#153353';
  painter.font = '16px sans-serif';
  for (const [row, state] of ['idle', 'blink-review', 'sleep'].entries())
    for (const [column, size] of [44, 72, 96, 320].entries()) {
      const image = await loadImage(path.join(output, `${state}-${size}.png`));
      painter.drawImage(
        image,
        column * 340 + (340 - image.width) / 2,
        row * 380 + 25 + (320 - image.height) / 2,
      );
      painter.fillText(`${state} · ${size}px`, column * 340 + 18, row * 380 + 368);
    }
  await writeFile(path.join(output, 'actual-size-eye-board.png'), board.toBuffer('image/png'));
  report.recording = 'actual-eye-sleep-wake.webm';
  report.pass = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ pass: report.pass, report: path.join(output, 'report.json'), failure: report.failure ?? null })}\n`,
  );
}
