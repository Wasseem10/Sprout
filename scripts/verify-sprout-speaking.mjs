/** Owned visual review: actual animated renderer, default camera/Daylight look. */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const output = 'artifacts/sprout-automatic-v007/speaking-review';
const origin = process.env.SPROUT_REVIEW_BASE_URL ?? 'http://127.0.0.1:5173';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const apiRequests = [];
const errors = [];
const consoleErrors = [];
const studies = [];
let context;
let videoPath;
try {
  context = await browser.newContext({
    viewport: { width: 1040, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: `${output}/video`, size: { width: 1040, height: 720 } },
  });
  await context.route('**/api/**', (route) => {
    apiRequests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(() => {
    window.__sproutMicrophoneAttempts = 0;
    if (navigator.mediaDevices) {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.__sproutMicrophoneAttempts += 1;
          throw Error('Microphone is not used by this visual-only review.');
        },
      });
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/__sprout-speaking-review', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Sprout speaking review</title></head><body></body></html>',
    }),
  );
  await page.goto(`${origin}/__sprout-speaking-review`);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<main id="speaking-board"><header><h1></h1><p></p></header><div id="studies"></div><footer>Actual browser rendering · moving authored clips · default camera and Daylight lighting</footer></main>';
    const style = document.createElement('style');
    style.textContent = `html,body{margin:0;color:#162d42;font-family:Arial,sans-serif;background:#edf5fb}body{background:radial-gradient(at 5% 20%,#e0f8ff,transparent 55%),radial-gradient(at 95% 5%,#eeebff,transparent 50%),#f5f9fd;min-height:720px}#speaking-board{box-sizing:border-box;padding:24px;width:1000px}h1{font-size:22px;margin:0 0 8px}header p{font-size:14px;margin:0 0 20px;max-width:850px;line-height:1.5}#studies{display:flex;gap:20px}.study{background:rgba(255,255,255,.76);border-radius:20px;padding:20px;min-width:270px}.study h2{font-size:17px;margin:0 0 10px}.stage{display:flex;justify-content:center}.sizes{display:flex;align-items:end;gap:18px;margin-top:8px}.slot{position:relative;flex:none}.slot canvas{display:block;width:100%;height:100%}.size-label{font-size:12px;text-align:center;margin:8px 0 0}.group{display:flex;flex-direction:column;align-items:center}footer{font-size:12px;color:#456076;margin-top:20px}`;
    document.head.append(style);
    window.__sproutReviewRenderers = [];
  });
  await page.mouse.move(1010, 700);

  const createStudy = async (label, groups) => {
    await page.evaluate(
      async ({ label, groups }) => {
        for (const item of window.__sproutReviewRenderers) item.renderer.dispose();
        window.__sproutReviewRenderers = [];
        document.querySelector('#studies').replaceChildren();
        document.querySelector('h1').textContent = label;
        document.querySelector('header p').textContent =
          'Source-backed animation review. Small canvases are 44, 72 and 96 CSS pixels at 1× device scale. The larger canvas is a diagnostic view. These are selected visual states, not a live voice session.';
        const { createBuddyRenderer } = await import('/src/buddyRenderer.ts');
        for (const group of groups) {
          const cell = document.createElement('section');
          cell.className = 'study';
          const heading = document.createElement('h2');
          heading.textContent = group.label;
          cell.append(heading);
          const large = document.createElement('div');
          large.className = 'stage';
          const small = document.createElement('div');
          small.className = 'sizes';
          cell.append(large, small);
          document.querySelector('#studies').append(cell);
          for (const size of [240, 44, 72, 96]) {
            const wrap = document.createElement('div');
            wrap.className = 'group';
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.dataset.version = group.version;
            slot.dataset.size = String(size);
            slot.style.width = slot.style.height = `${size}px`;
            const canvas = document.createElement('canvas');
            slot.append(canvas);
            const caption = document.createElement('p');
            caption.className = 'size-label';
            caption.textContent = `${size} px`;
            wrap.append(slot, caption);
            (size === 240 ? large : small).append(wrap);
            const settings = {
              assetUrl: `/buddy/sprout-${group.version}.glb`,
              phase: group.phase,
              motion: true,
            };
            // No camera, tone mapping, reflection, material or amplitude override.
            // With no voice sample, the renderer permits Studio's selected phase.
            const renderer = await createBuddyRenderer(canvas, settings, () => {});
            if (!renderer) throw Error(`Renderer failed: ${group.version}/${group.phase}/${size}`);
            window.__sproutReviewRenderers.push({
              renderer,
              version: group.version,
              phase: group.phase,
              size,
              createdAt: performance.now(),
            });
          }
        }
      },
      { label, groups },
    );
    // Wait for actual moving frames and the base-pose crossfade, not a parked frame zero.
    await page.waitForFunction(() =>
      window.__sproutReviewRenderers.every(({ renderer }) => renderer.diagnostics().frames >= 12),
    );
    await page.waitForTimeout(800);
  };

  const capture = async (name) => {
    const diagnostics = await page.evaluate(() =>
      window.__sproutReviewRenderers.map(({ renderer, version, phase, size, createdAt }) => ({
        version,
        requestedPhase: phase,
        cssSize: size,
        observedAfterMs: performance.now() - createdAt,
        ...renderer.diagnostics(),
      })),
    );
    for (const diag of diagnostics) {
      expect(diag.assetUrl).toBe(`/buddy/sprout-${diag.version}.glb`);
      expect(diag.assetIssues).toEqual([]);
      expect(diag.eyeProfile).toBe('happy-eyes-v005');
      expect(diag.reflectionProfile).toBe('daylight');
      expect(diag.clips).toHaveLength(11);
      expect(diag.clips).toContain('Sprout_Speak');
      expect(diag.behavior.moving).toBe(true);
      expect(diag.behavior.visible).toBe(true);
      expect(diag.frames).toBeGreaterThan(10);
    }
    const board = `${output}/${name}.png`;
    await page.locator('#speaking-board').screenshot({ path: board });
    const samples = [];
    for (const diag of diagnostics) {
      const path = `${output}/${name}-${diag.version}-${diag.cssSize}px.png`;
      await page
        .locator(`.slot[data-version="${diag.version}"][data-size="${diag.cssSize}"]`)
        .screenshot({ path });
      samples.push({ path, version: diag.version, cssSize: diag.cssSize });
    }
    studies.push({ name, board, diagnostics, samples });
  };

  await createStudy('Retained and refined speaking gestures', [
    { version: 'v006', phase: 'speaking', label: 'Daylight v006 · retained speaking' },
    { version: 'v007', phase: 'speaking', label: 'Daylight v007 · planted explaining' },
  ]);
  await capture('speaking-comparison-a');
  await page.waitForTimeout(1400);
  await capture('speaking-comparison-b');
  await page.waitForTimeout(1400);
  await capture('speaking-comparison-c');

  for (const phase of ['idle', 'listening', 'thinking', 'speaking']) {
    await createStudy(`Sprout v007 · ${phase}`, [
      {
        version: 'v007',
        phase,
        label: `${phase[0].toUpperCase()}${phase.slice(1)} · motion running`,
      },
    ]);
    await capture(`v007-${phase}-a`);
    await page.waitForTimeout(1300);
    await capture(`v007-${phase}-b`);
  }
  const servedHashes = await page.evaluate(async () => {
    const result = {};
    for (const version of ['v006', 'v007']) {
      const bytes = await (await fetch(`/buddy/sprout-${version}.glb`)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      result[version] = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return result;
  });
  const diskHashes = {};
  for (const version of ['v006', 'v007']) {
    diskHashes[version] = createHash('sha256')
      .update(await readFile(`public/buddy/sprout-${version}.glb`))
      .digest('hex');
    expect(servedHashes[version]).toBe(diskHashes[version]);
  }
  for (const phase of ['idle', 'listening', 'thinking', 'speaking']) {
    const first = studies.find((study) => study.name === `v007-${phase}-a`);
    const second = studies.find((study) => study.name === `v007-${phase}-b`);
    for (let i = 0; i < first.diagnostics.length; i += 1) {
      expect(second.diagnostics[i].frames).toBeGreaterThan(first.diagnostics[i].frames);
    }
  }
  expect(await page.evaluate(() => window.__sproutMicrophoneAttempts)).toBe(0);
  await page.evaluate(() =>
    window.__sproutReviewRenderers.forEach(({ renderer }) => renderer.dispose()),
  );
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  const video = page.video();
  await context.close();
  context = null;
  videoPath = video ? await video.path() : null;
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          'Actual moving Three renderer on an owned bright background; default camera, tone mapping and Daylight profile. Selected visual phases, not live microphone/voice or production automatic-state proof. No pixel edits. Screenshots are sampled at observed wall times, not synchronized clip-frame numbers.',
        maximumConcurrentRenderers: 8,
        deviceScaleFactor: 1,
        motion: true,
        diskHashes,
        servedHashes,
        studies,
        video: videoPath,
        apiRequests,
        microphoneAttempts: 0,
        errors,
        consoleErrors,
        performanceNote:
          'Multiple diagnostic canvases and video recording add overhead. Timing diagnostics are not a single-avatar performance acceptance measurement.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      output,
      studies: studies.length,
      diskHashes,
      video: videoPath,
      apiRequests,
      errors,
      consoleErrors,
    }),
  );
} finally {
  if (context) await context.close();
  await browser.close();
}
