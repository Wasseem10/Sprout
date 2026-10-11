import { _electron as electron, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  proofAssetFile,
  proofAssetUrl,
  proofOutputPath,
  proofLocalDirectory,
} from './buddy-proof-options.mjs';

// Actual Electron shell and animated asset; this studio replay is explicitly
// simulated and makes no microphone, TTS-provider or backend task request.
const dataDir = await mkdtemp(path.join(tmpdir(), 'insightos-sprout-motion-'));
const coldLoad = process.argv.includes('--cold-load');
const edgePanelRecord = process.argv.includes('--edge-panel-record');
const productionBundle =
  coldLoad || edgePanelRecord || process.argv.includes('--production-bundle');
const recordVideo = edgePanelRecord || process.argv.includes('--record');
if (coldLoad && recordVideo) throw new Error('Cold-load measurements must run without recording.');
const artifactDir = path.resolve(
  proofOutputPath(
    coldLoad
      ? 'artifacts/sprout-native-prism-cold-load'
      : edgePanelRecord
        ? 'artifacts/sprout-native-prism-edge-panel'
        : productionBundle
          ? `artifacts/sprout-native-prism-${recordVideo ? 'video' : 'production'}`
          : `artifacts/sprout-native-clay${recordVideo ? '-video' : ''}`,
  ),
);
const distDir = path.resolve('dist');
const assetBytes = await readFile(path.join('public/buddy', proofAssetFile));
const assetSha256 = createHash('sha256').update(assetBytes).digest('hex');
await mkdir(artifactDir, { recursive: true });
const local = path.resolve(proofLocalDirectory);
await mkdir(local, { recursive: true });
const entry = path.join(local, `motion-smoke-main-${process.pid}.cjs`);
await writeFile(
  entry,
  `const { app, session } = require('electron');\napp.setPath('userData', ${JSON.stringify(dataDir)});\n${
    coldLoad
      ? `global.__coldAvatarBlocks = [];\napp.whenReady().then(() => {\n  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://127.0.0.1:5173/buddy/*.glb'] }, (details, callback) => {\n    global.__coldAvatarBlocks.push(details.url);\n    callback({ cancel: true });\n  });\n});\n`
      : ''
  }require(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
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
let bootstrap;
try {
  const page = await desktop.firstWindow();
  console.log('Native window available');
  // Electron's own initial loadURL must finish before a test navigation starts.
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  if (coldLoad) {
    // All model fallbacks fail before parse, before any avatar GPU allocation.
    // Keep the real native main/preload and all of its security preferences.
    await expect
      .poll(() => desktop.evaluate(() => global.__coldAvatarBlocks), { timeout: 20000 })
      .toEqual(
        expect.arrayContaining([
          `http://127.0.0.1:5173${proofAssetUrl}`,
          'http://127.0.0.1:5173/buddy/insight-core-v1.glb',
        ]),
      );
    const initial = page.locator('.buddy-face .insight-signal');
    await expect(initial).toHaveAttribute('data-renderer', 'fallback');
    await expect(initial.locator('.signal-authored-image')).toBeVisible();
    await expect
      .poll(() => initial.locator('.signal-authored-image').evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    bootstrap = await desktop.evaluate(({ BrowserWindow }) => {
      const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        isolatedProfile: true,
        blockedInitialAvatarAssets: global.__coldAvatarBlocks,
        initialAvatarMode: 'PNG fallback; all GLB fetches cancelled before parse/GPU allocation',
        preferences: {
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          webSecurity: preferences.webSecurity,
        },
      };
    });
    expect(bootstrap.preferences).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
    const fallbackPng = await desktop.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(
      path.join(artifactDir, 'native-bootstrap-fallback.png'),
      Buffer.from(fallbackPng, 'base64'),
    );
  } else {
    // This replay bootstrap renders the avatar first and therefore warms its
    // shader cache. Its startup numbers must not be labelled a cold load.
    await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
      'data-model',
      'sprout',
      { timeout: 30000 },
    );
  }
  // Abort remaining initial imports before installing compiled-artifact routes.
  await page.goto('about:blank', { waitUntil: 'load' });
  if (coldLoad)
    await desktop.evaluate(({ session }) =>
      session.defaultSession.webRequest.onBeforeRequest(null),
    );
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
      new URL(request.url()).pathname === proofAssetUrl &&
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
  if (!coldLoad && !edgePanelRecord) {
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
    await expect(
      page.getByRole('button', { name: 'Run simulated replay', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(visual).toHaveAttribute('data-phase', 'idle');
  }
  // Freeze clocks and take the latest published diagnostics before capturePage,
  // inspecting GPU state or opening details can introduce measurement stalls.
  const measurement = await page.evaluate(() => {
    cancelAnimationFrame(window.__sproutFrameRequest);
    const samples = window.__sproutFrameSamples ?? [];
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
  expect(diagnostics.asset).toBe('sprout');
  expect(diagnostics.assetUrl).toBe(proofAssetUrl);
  expect(diagnostics.startup.firstRenderMs).toBeGreaterThan(0);
  await capture(coldLoad ? 'native-first-model.png' : 'native-replay-end.png');
  const startup = await page.evaluate(
    (assetUrl) => ({
      webglReadyAttributeMsFromNavigation: window.__sproutWebglReadyMs ?? null,
      nextAnimationFrameMsFromNavigation: window.__sproutNextAnimationFrameMs ?? null,
      resources: performance
        .getEntriesByType('resource')
        .filter((resource) => new URL(resource.name).pathname === assetUrl)
        .map((resource) => ({
          durationMs: resource.duration,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        })),
    }),
    proofAssetUrl,
  );
  if (!coldLoad && !edgePanelRecord)
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
    kind: coldLoad
      ? 'First compiled dist avatar load in a fresh native Electron process/profile at its trusted local origin. Initial avatar assets were blocked before GPU creation. Separate from embedded production backend and real voice acceptance.'
      : edgePanelRecord
        ? 'Compiled UI in actual native Electron: bounded edge-clamping, reduced-motion and draft-preserving panel recording. No replay or performance acceptance; separate from embedded backend and live voice.'
        : productionBundle
          ? 'Compiled dist UI in the actual native Electron shell at its trusted local origin. Simulated six-clip replay; separate from embedded production backend and real voice acceptance.'
          : 'Actual native Electron development shell, simulated clip replay. Separate from production bundle and real voice acceptance.',
    recordingActive: recordVideo,
    bootstrap,
    startupScope: coldLoad
      ? 'Fresh isolated native process/profile; initial avatar GLB fetches blocked before parse/GPU, then first compiled-UI avatar load. OS/driver-wide shader caches and compositor startup are outside control. Timings start at createBuddyRenderer, after its lazy engine import; navigation timing is separate. Not a physical machine power-on cold boot.'
      : 'Warm avatar bootstrap: the initial development buddy rendered before this compiled-UI load. Fresh isolated process/profile, but avatar shaders may already be cached. Timings start at createBuddyRenderer, after its lazy engine import; navigation timing is separate.',
    timingScope: coldLoad
      ? 'First compiled-UI avatar load only; no replay or recording. Startup values are frozen internally at first model render. Clock/render-call timings do not verify operating-system presented frames.'
      : edgePanelRecord
        ? 'Recording and functional assertions only; renderer diagnostics are incidental and do not establish frame cadence or cold startup.'
        : 'Startup is separate from the 18.3s replay. Latest 1.5s-published render diagnostics and independent replay-only rAF-clock intervals are frozen before end screenshots. Not verified operating-system presented frames. Recording runs are separate from performance acceptance.',
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
    if (edgePanelRecord) {
      report.edgeClosed = await desktop.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const area = screen.getDisplayMatching(win.getBounds()).workArea;
        const bounds = win.getBounds();
        win.setPosition(area.x + area.width - bounds.width, area.y + area.height - bounds.height);
        return { bounds: win.getBounds(), workArea: area };
      });
    }
    await page.waitForTimeout(800);
    await pet.click();
    const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
    await expect(input).toBeVisible();
    await input.fill('Help me understand this document.');
    await page.waitForTimeout(1200);
    if (edgePanelRecord) {
      report.edgeOpen = await desktop.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows()[0];
        return {
          bounds: win.getBounds(),
          workArea: screen.getDisplayMatching(win.getBounds()).workArea,
        };
      });
      const { bounds, workArea } = report.edgeOpen;
      expect(bounds.x).toBeGreaterThanOrEqual(workArea.x);
      expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height);
      await capture('native-edge-open.png');
    }
    await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
    await page.waitForTimeout(700);
    if (edgePanelRecord) {
      await expect(pet).toBeFocused();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await pet.press('Enter');
      await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
      await expect(input).toHaveValue('Help me understand this document.');
      await expect(
        page.getByRole('button', { name: 'Collapse conversation', exact: true }),
      ).toBeFocused();
      const nativeVisual = page.locator('.buddy-face .insight-signal');
      const still = await nativeVisual.screenshot();
      await page.waitForTimeout(450);
      expect(still.equals(await nativeVisual.screenshot())).toBe(true);
      await capture('native-edge-reduced-reopen.png');
      report.edgeReducedReopen = {
        draftPreserved: true,
        closeFocused: true,
        reducedMotionPixelsEqualAcross450ms: true,
        physicalMonitorChangesTested: false,
      };
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
      await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
      await expect(pet).toBeFocused();
    }
    report.panelVideo = edgePanelRecord
      ? 'Actual native edge placement/clamping, open/unsent draft/collapse/keyboard reopen, focus and draft preservation, system-reduced-motion static pixels. No conversation or microphone request.'
      : 'Actual native pet/panel open, unsent draft, close. No conversation or microphone request.';
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
    const finalPath = path.join(
      artifactDir,
      edgePanelRecord ? 'native-edge-panel.webm' : 'native-replay-and-panel.webm',
    );
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
