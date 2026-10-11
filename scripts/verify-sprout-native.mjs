import { _electron as electron, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Actual Electron shell and animated asset; this studio replay is explicitly
// simulated and makes no microphone, TTS-provider or backend task request.
const dataDir = await mkdtemp(path.join(tmpdir(), 'insightos-sprout-motion-'));
const productionBundle = process.argv.includes('--production-bundle');
const recordVideo = process.argv.includes('--record');
const artifactDir = path.resolve(
  productionBundle
    ? `artifacts/sprout-native-prism-${recordVideo ? 'video' : 'production'}`
    : `artifacts/sprout-native-clay${recordVideo ? '-video' : ''}`,
);
const distDir = path.resolve('dist');
const assetBytes = await readFile('public/buddy/sprout-v002.glb');
const assetSha256 = createHash('sha256').update(assetBytes).digest('hex');
await mkdir(artifactDir, { recursive: true });
const local = path.resolve('.local');
await mkdir(local, { recursive: true });
const entry = path.join(local, `motion-smoke-main-${process.pid}.cjs`);
await writeFile(
  entry,
  `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(dataDir)});\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
);
const desktop = await electron.launch({
  args: [entry, '--dev'],
  env: {
    ...process.env,
    INSIGHTOS_APP_URL: '',
    APP_MODE: 'sample',
    SESSION_PASSPHRASE: '',
    HF_TOKEN: '',
    DATABRICKS_TOKEN: '',
    ELEVENLABS_API_KEY: '',
    DATABASE_URL: '',
    LOCAL_DATA_DIR: dataDir,
  },
  timeout: 30000,
  recordVideo: recordVideo ? { dir: artifactDir, size: { width: 1280, height: 900 } } : undefined,
});
console.log('Native shell launched');
const deadline = setTimeout(() => {
  console.error('Native proof exceeded its 60-second harness deadline');
  desktop.process().kill();
}, 60000);
let report = { checkedAt: new Date().toISOString(), assetSha256, pass: false };
let video;
try {
  const page = await desktop.firstWindow();
  console.log('Native window available');
  // Electron's own initial loadURL must finish before a test navigation starts.
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  // Resolve the initial development document's lazy UI before switching routes.
  // The blank document aborts remaining imports and tears down its renderer, so
  // neither initial-page errors nor GPU work bleed into compiled-UI acceptance.
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-model',
    'sprout',
    { timeout: 30000 },
  );
  await page.goto('about:blank', { waitUntil: 'load' });
  const errors = [];
  const apiCalls = [];
  const servedAssets = [];
  const responseInspections = [];
  const trackedAssets = new Set();
  let trackStudio = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      trackStudio &&
      new URL(request.url()).pathname === '/buddy/sprout-v002.glb' &&
      new URL(request.frame().url()).searchParams.get('studio') === 'buddy'
    )
      trackedAssets.add(request);
  });
  page.on('response', (response) => {
    if (!trackedAssets.has(response.request())) return;
    const inspection = (async () => {
      const bytes = await response.body();
      const headers = await response.allHeaders();
      const binaryHeader = bytes.subarray(0, 4).toString('ascii');
      const version = bytes.length >= 12 ? bytes.readUInt32LE(4) : null;
      const declaredBytes = bytes.length >= 12 ? bytes.readUInt32LE(8) : null;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      servedAssets.push({
        url: response.url(),
        status: response.status(),
        contentType: headers['content-type'],
        contentEncoding: headers['content-encoding'] ?? 'none',
        bodyBytes: bytes.length,
        binaryHeader,
        version,
        declaredBytes,
        sha256,
        timing: response.request().timing(),
      });
      expect(response.status()).toBe(200);
      expect(binaryHeader).toBe('glTF');
      expect(version).toBe(2);
      expect(declaredBytes).toBe(bytes.length);
      expect(sha256).toBe(assetSha256);
    })();
    // The eventual awaited inspection still fails the proof, while this handler
    // prevents a rejected callback promise from bypassing native teardown.
    void inspection.catch(() => {});
    responseInspections.push(inspection);
  });
  if (productionBundle) {
    // The exact compiled UI is served at the native shell's trusted origin.
    // This does not launch or claim to verify the embedded production backend.
    await page.context().route('http://127.0.0.1:5173/**', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      if (pathname.startsWith('/api/')) return route.continue();
      const filename = path.resolve(distDir, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (filename !== distDir && !filename.startsWith(`${distDir}${path.sep}`))
        return route.fulfill({ status: 400, body: 'Invalid artifact path' });
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };
      try {
        const body = await readFile(filename);
        return route.fulfill({
          status: 200,
          contentType: types[path.extname(filename)] ?? 'application/octet-stream',
          body,
        });
      } catch {
        // An asset error must remain an error, never a successful SPA HTML response.
        return route.fulfill({ status: 404, body: 'Artifact missing' });
      }
    });
  }
  await page.context().addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (
        !document.querySelector(
          '.studio-launcher .insight-signal[data-renderer="webgl"][data-model="sprout"]',
        )
      )
        return;
      window.__sproutWebglReadyMs = performance.now();
      observer.disconnect();
      requestAnimationFrame((at) => {
        window.__sproutNextAnimationFrameMs = at;
      });
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-renderer', 'data-model'],
    });
  });
  trackStudio = true;
  await page.goto('http://127.0.0.1:5173/?studio=buddy', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  console.log('Native studio loaded');
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setBounds({ x: 60, y: 60, width: 1280, height: 900 });
    win.webContents.setZoomFactor(1);
    win.show();
    win.focus();
  });
  console.log('Native bounds applied');
  page.on('request', (request) => {
    if (trackStudio && new URL(request.url()).pathname.startsWith('/api/'))
      apiCalls.push(request.url());
  });
  const visual = page.locator('.studio-launcher .insight-signal');
  await expect(visual).toHaveAttribute('data-renderer', 'webgl', { timeout: 30000 });
  await expect(visual).toHaveAttribute('data-model', 'sprout');
  console.log('Actual Sprout rendered');
  await Promise.all(responseInspections);
  expect(servedAssets.length).toBeGreaterThan(0);
  await expect(visual).toHaveCSS('width', '96px');
  await visual.scrollIntoViewIfNeeded();
  const capture = async (name) => {
    const png = await desktop.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(path.join(artifactDir, name), Buffer.from(png, 'base64'));
  };
  await capture('native-idle.png');
  console.log('Idle capture saved');
  const gpuInfo = await desktop.evaluate(async ({ app }) => ({
    features: app.getGPUFeatureStatus(),
    info: await Promise.race([
      app.getGPUInfo('complete').catch((error) => ({ error: error.message })),
      new Promise((resolve) =>
        setTimeout(() => resolve({ unavailable: 'Driver read exceeded 2s' }), 2000),
      ),
    ]),
  }));
  // Independent rAF-clock samples; neither these nor render calls prove which
  // frames the operating system actually presented on the display.
  await page.evaluate(() => {
    window.__sproutFrameSamples = [];
    window.__sproutFrameStartAt = performance.now();
    let previous = 0;
    const tick = (at) => {
      if (previous)
        window.__sproutFrameSamples.push({
          at,
          interval: at - previous,
          phase: document
            .querySelector('.studio-launcher .insight-signal')
            ?.getAttribute('data-phase'),
        });
      previous = at;
      if (window.__sproutFrameSamples.length < 1800)
        window.__sproutFrameRequest = requestAnimationFrame(tick);
    };
    window.__sproutFrameRequest = requestAnimationFrame(tick);
  });
  await page
    .getByRole('button', { name: 'Run simulated replay', exact: true })
    .evaluate((button) => button.click());
  await expect(
    page.getByRole('button', { name: 'Stop simulated replay', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run simulated replay', exact: true })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(visual).toHaveAttribute('data-phase', 'idle');
  // Freeze clocks and take the latest published diagnostics before capturePage,
  // inspecting GPU state or opening details can introduce measurement stalls.
  const measurement = await page.evaluate(() => {
    cancelAnimationFrame(window.__sproutFrameRequest);
    const samples = window.__sproutFrameSamples;
    const intervals = samples.map((sample) => sample.interval);
    const sorted = [...intervals].sort((a, b) => a - b);
    const element = document.querySelector('.studio-render-report');
    return {
      rendererReport: element.textContent,
      diagnostics: JSON.parse(element.getAttribute('data-diagnostics')),
      animationFrameClock: {
        samples: samples.length,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        max: Math.max(0, ...intervals),
        over18ms: intervals.filter((duration) => duration > 18).length,
        intervalSamples: intervals,
        outliers: samples
          .filter((sample) => sample.interval > 18)
          .map((sample) => ({
            fromReplayStartMs: sample.at - window.__sproutFrameStartAt,
            intervalMs: sample.interval,
            phase: sample.phase,
          })),
      },
    };
  });
  const { rendererReport, diagnostics, animationFrameClock } = measurement;
  await capture('native-replay-end.png');
  const startup = await page.evaluate(() => ({
    webglReadyAttributeMsFromNavigation: window.__sproutWebglReadyMs ?? null,
    nextAnimationFrameMsFromNavigation: window.__sproutNextAnimationFrameMs ?? null,
    resources: performance
      .getEntriesByType('resource')
      .filter((resource) => new URL(resource.name).pathname === '/buddy/sprout-v002.glb')
      .map((resource) => ({
        durationMs: resource.duration,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,
      })),
  }));
  expect(
    Number(rendererReport.match(/([\d,]+) rendered frames/)?.[1].replaceAll(',', '')),
  ).toBeGreaterThan(100);
  const gpu = await visual.locator('canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      width: canvas.width,
      height: canvas.height,
    };
  });
  report = {
    ...report,
    checkedAt: new Date().toISOString(),
    assetSha256,
    kind: productionBundle
      ? 'Compiled dist UI in the actual native Electron shell at its trusted local origin. Simulated six-clip replay; separate from embedded production backend and real voice acceptance.'
      : 'Actual native Electron development shell, simulated clip replay. Separate from production bundle and real voice acceptance.',
    recordingActive: recordVideo,
    timingScope:
      'Startup is separate from the 18.3s replay. Latest 1.5s-published render diagnostics and independent replay-only rAF-clock intervals are frozen before end screenshots. Not verified operating-system presented frames. Recording runs are separate from performance acceptance.',
    servedAssets,
    startup,
    diagnostics,
    rendererReport,
    animationFrameClock,
    gpu,
    gpuInfo,
    errors,
    apiCalls,
  };
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
  if (recordVideo) {
    video = page.video();
    trackStudio = false;
    await page.goto('http://127.0.0.1:5173/?desktop=buddy', { waitUntil: 'domcontentloaded' });
    const pet = page.getByRole('button', { name: /^Expand buddy\./ });
    await expect(pet).toBeVisible();
    await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
      'data-model',
      'sprout',
    );
    await page.waitForTimeout(800);
    await pet.click();
    const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
    await expect(input).toBeVisible();
    await input.fill('Help me understand this document.');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
    await page.waitForTimeout(700);
    report.panelVideo =
      'Actual native pet/panel open, unsent draft, close. No conversation or microphone request.';
  }
  report.pass = true;
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await desktop.close();
  clearTimeout(deadline);
  await unlink(entry).catch(() => {});
  if (video && report) {
    const recordedPath = await video.path();
    const finalPath = path.join(artifactDir, 'native-replay-and-panel.webm');
    await rename(recordedPath, finalPath);
    report.video = finalPath;
  }
  if (report) {
    await writeFile(path.join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          rendererReport: report.rendererReport,
          animationFrameClock: { ...report.animationFrameClock, intervalSamples: undefined },
          gpu: report.gpu,
          errors: report.errors,
          apiCalls: report.apiCalls,
        },
        null,
        2,
      ),
    );
  }
}
