/** Actual moving v008 renderer and original Blender still, without pose/material substitution. */
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = 'artifacts/sprout-soft-v008/verification';
const origin = process.env.SPROUT_REVIEW_BASE_URL ?? 'http://127.0.0.1:5173';
const expectedProfiles = { v007: 'daylight', v008: 'soft' };
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = {
  checkedAt: new Date().toISOString(),
  pass: false,
  scope:
    'Actual Three renderer using shipped v007/v008 assets and default appearance profiles; original v005 PNG displayed separately as a labelled still reference. Selected animation/controller inputs, actual pointer events, and real frame progress. This is no live voice/provider/native-window or automatic-state integration claim. No image edits, overridden mixer clock, camera, pose, shader or material.',
  limitations:
    'Blink/click stills sample wall time, not an exact closed-eye or bounce peak; inspect the recorded moving sequence and separate actual-GLB replay. Multiple canvases/video are not single-avatar performance measurements.',
  sizes: [240, 96],
  samples: [],
  pointer: [],
  apiRequests: [],
  errors: [],
  consoleErrors: [],
};
let context;
let video;
try {
  context = await browser.newContext({
    viewport: { width: 1100, height: 710 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: `${output}/raw-video`, size: { width: 1100, height: 710 } },
  });
  await context.route('**/api/**', (route) => {
    report.apiRequests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(() => {
    window.__microphoneAttempts = 0;
    if (navigator.mediaDevices)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.__microphoneAttempts++;
          throw Error('No microphone in the visual material review.');
        },
      });
  });
  const page = await context.newPage();
  video = page.video();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  await page.route('**/__sprout-soft-review', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Sprout Soft Original verification</title></head><body></body></html>',
    }),
  );
  await page.goto(`${origin}/__sprout-soft-review`);
  await page.evaluate(async () => {
    document.body.innerHTML =
      '<main><h1>Sprout · Soft Original live appearance</h1><p id="state">Idle · still material comparison</p><div id="board"></div><footer>Shipped assets · 240 px diagnostic / 96 px desktop · selected visual states, no microphone</footer></main>';
    const style = document.createElement('style');
    style.textContent = `html,body{margin:0;color:#193148;font-family:Arial,sans-serif;background:#edf5fb}main{box-sizing:border-box;padding:24px;width:1100px;min-height:710px;background:radial-gradient(at 4% 55%,#fff,transparent 55%),radial-gradient(at 100% 80%,#dce9f8,transparent 65%),#edf5fb}h1{font-size:22px;margin:0 0 12px}#state{font-size:16px;margin:0 0 22px}#board{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.study{padding:16px;background:#ffffff60;border:1px solid #ffffffaa;border-radius:24px}.study h2{font-size:17px;margin:0 0 14px}.size{display:flex;align-items:center;flex-direction:column}.slot{position:relative;flex:none}.slot canvas,.slot img{display:block;width:100%;height:100%}.caption{margin:8px 0 12px;font-size:12px;color:#486078}footer{font-size:12px;color:#486078;margin-top:18px}`;
    document.head.append(style);
    const { createBuddyRenderer } = await import('/src/buddyRenderer.ts');
    window.__softReview = [];
    window.__reviewGeneration = 0;
    window.__reviewSequence = 0;
    for (const [version, label] of [
      ['v005', 'Original · Blender still reference'],
      ['v007', 'Daylight · retained live 3D'],
      ['v008', 'Soft Original · new live 3D'],
    ]) {
      const study = document.createElement('section');
      study.className = 'study';
      const heading = document.createElement('h2');
      heading.textContent = label;
      study.append(heading);
      document.querySelector('#board').append(study);
      for (const size of [240, 96]) {
        const group = document.createElement('div');
        group.className = 'size';
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.version = version;
        slot.dataset.size = String(size);
        slot.style.width = slot.style.height = `${size}px`;
        group.append(slot);
        const caption = document.createElement('p');
        caption.className = 'caption';
        caption.textContent = `${size} px${version === 'v005' ? ' · no animation' : ''}`;
        group.append(caption);
        study.append(group);
        if (version === 'v005') {
          const image = new Image();
          image.alt = 'Original Sprout Blender still reference';
          image.src = '/buddy/sprout-v005.png';
          slot.append(image);
          await image.decode();
          continue;
        }
        const canvas = document.createElement('canvas');
        slot.append(canvas);
        const settings = {
          assetUrl: `/buddy/sprout-${version}.glb`,
          phase: 'idle',
          motion: false,
          reaction: 0,
          blink: 0,
          behavior: { generation: 0, manualEligible: true },
        };
        const renderer = await createBuddyRenderer(canvas, settings, () => {});
        if (!renderer) throw Error(`Could not create actual renderer ${version}/${size}.`);
        window.__softReview.push({ version, size, settings, renderer });
      }
    }
  });
  const diagnostics = () =>
    page.evaluate(() =>
      window.__softReview.map(({ renderer, version, size }) => ({
        version,
        cssSize: size,
        ...renderer.diagnostics(),
      })),
    );
  const capture = async (name) => {
    const entries = await diagnostics();
    for (const entry of entries) {
      expect(entry.assetUrl).toBe(`/buddy/sprout-${entry.version}.glb`);
      expect(entry.reflectionProfile).toBe(expectedProfiles[entry.version]);
      expect(entry.assetIssues).toEqual([]);
      expect(entry.eyeProfile).toBe('happy-eyes-v005');
      expect(entry.clips).toHaveLength(11);
      expect(entry.behavior.visible).toBe(true);
    }
    const screenshot = `${output}/${name}.png`;
    await page.locator('main').screenshot({ path: screenshot });
    report.samples.push({ name, screenshot, diagnostics: entries });
    return entries;
  };
  const update = (kind, value) =>
    page.evaluate(
      ({ kind, value }) => {
        const generation =
          kind === 'phase' ? ++window.__reviewGeneration : window.__reviewGeneration;
        const id = ++window.__reviewSequence;
        for (const item of window.__softReview) {
          const next = { ...item.settings };
          if (kind === 'phase') {
            next.phase = value;
            next.motion = true;
            next.behavior = { generation, manualEligible: value === 'idle' };
          } else if (kind === 'behavior') {
            next.behavior = { ...next.behavior, done: null, request: { id, action: value } };
          } else if (kind === 'done') {
            next.behavior = {
              ...next.behavior,
              request: undefined,
              done: { id: `soft-review-${id}`, generation, issuedAt: performance.now() },
            };
          } else if (kind === 'motion') next.motion = value;
          else next[kind] = (next[kind] ?? 0) + 1;
          item.settings = next;
          item.renderer.update(next);
        }
        document.querySelector('#state').textContent =
          `${kind} · ${value ?? 'selected preview cue'}`;
      },
      { kind, value },
    );
  const waitMode = (mode) =>
    page.waitForFunction(
      (mode) =>
        window.__softReview.every(({ renderer }) => renderer.diagnostics().behavior.mode === mode),
      mode,
    );

  await page.mouse.move(1080, 690);
  await capture('comparison-idle-static');
  for (const phase of ['idle', 'listening', 'thinking', 'speaking']) {
    await update('phase', phase);
    await page.waitForTimeout(1000);
    const first = await capture(`${phase}-a`);
    await page.waitForTimeout(1300);
    const second = await capture(`${phase}-b`);
    for (let i = 0; i < first.length; i++) {
      expect(second[i].frames).toBeGreaterThan(first[i].frames);
      expect(second[i].behavior.moving).toBe(true);
    }
  }
  await update('phase', 'idle');
  await page.waitForTimeout(500);
  const softSlot = page.locator('.slot[data-version="v008"][data-size="240"]');
  const bounds = await softSlot.boundingBox();
  for (const [name, x, y] of [
    ['left-up', 0.15, 0.2],
    ['right-down', 0.85, 0.8],
    ['neutral', 0.5, 0.5],
  ]) {
    await page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
    await page.waitForTimeout(600);
    if (name === 'neutral')
      // Four canvases/video can consume more than 600ms of wall time before the
      // damped renderer receives its settling frames. Observe state, not a timer.
      await expect
        .poll(async () => {
          const entry = (await diagnostics()).find(
            (item) => item.version === 'v008' && item.cssSize === 240,
          );
          return Math.abs(entry.attention.x) + Math.abs(entry.attention.y);
        })
        .toBeLessThan(0.035);
    const entries = await capture(`pointer-${name}`);
    const attention = entries.find(
      (entry) => entry.version === 'v008' && entry.cssSize === 240,
    ).attention;
    if (name === 'left-up') {
      expect(attention.x).toBeLessThan(-0.5);
      expect(attention.yaw).toBeLessThan(-0.08);
      expect(attention.pitch).toBeLessThan(-0.035);
    } else if (name === 'right-down') {
      expect(attention.x).toBeGreaterThan(0.5);
      expect(attention.yaw).toBeGreaterThan(0.08);
      expect(attention.pitch).toBeGreaterThan(0.035);
    } else {
      expect(Math.abs(attention.x) + Math.abs(attention.y)).toBeLessThan(0.035);
    }
    report.pointer.push({ name, attention });
  }
  await page.mouse.move(1080, 690);
  for (const kind of ['blink', 'reaction']) {
    await update(kind);
    await page.waitForTimeout(kind === 'blink' ? 70 : 160);
    await capture(`${kind}-wall-time-sample`);
    await page.waitForTimeout(1100);
    await capture(`${kind}-settled`);
  }
  await update('behavior', 'joy');
  await waitMode('joy');
  await page.waitForTimeout(350);
  await capture('joy-jump');
  await waitMode('normal');
  await update('behavior', 'sleep');
  await waitMode('sleep');
  await capture('sleep-closed-eyes');
  await page.waitForTimeout(1100);
  await capture('sleep-loop');
  await update('behavior', 'wake');
  await waitMode('wake');
  await capture('wake');
  await waitMode('normal');
  await capture('awake');
  await update('phase', 'listening');
  await page.waitForTimeout(400);
  await update('done');
  await page.waitForFunction(() =>
    window.__softReview.every(({ renderer }) => renderer.diagnostics().behavior.doneActive),
  );
  await capture('done-while-listening');
  await page.waitForFunction(() =>
    window.__softReview.every(({ renderer }) => !renderer.diagnostics().behavior.doneActive),
  );
  await update('phase', 'idle');
  await update('motion', false);
  const still = await softSlot.screenshot();
  await page.waitForTimeout(500);
  expect(still.equals(await softSlot.screenshot())).toBe(true);
  report.pausedPixelsStable = true;
  await update('motion', true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const reduced = await softSlot.screenshot();
  await page.waitForTimeout(500);
  expect(reduced.equals(await softSlot.screenshot())).toBe(true);
  report.reducedMotionPixelsStable = true;
  await capture('reduced-motion');

  report.hashes = {};
  for (const file of ['sprout-v005.png', 'sprout-v007.glb', 'sprout-v008.glb']) {
    const disk = createHash('sha256')
      .update(await readFile(`public/buddy/${file}`))
      .digest('hex');
    const served = await page.evaluate(async (file) => {
      const response = await fetch(`/buddy/${file}`);
      if (!response.ok) throw Error(`Missing ${file}: ${response.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
    }, file);
    expect(served).toBe(disk);
    report.hashes[file] = { disk, served };
  }
  report.microphoneAttempts = await page.evaluate(() => window.__microphoneAttempts);
  expect(report.microphoneAttempts).toBe(0);
  expect(report.apiRequests).toEqual([]);
  expect(report.errors).toEqual([]);
  expect(report.consoleErrors).toEqual([]);
  await page.evaluate(() => window.__softReview.forEach(({ renderer }) => renderer.dispose()));
  report.pass = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  throw error;
} finally {
  if (context) await context.close();
  if (video) {
    report.video = `${output}/actual-motion-review.webm`;
    await video.saveAs(report.video);
    await video.delete();
  }
  await browser.close();
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      output,
      pass: report.pass,
      samples: report.samples.length,
      failure: report.failure,
    }),
  );
}
