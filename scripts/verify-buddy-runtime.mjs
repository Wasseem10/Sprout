import { _electron as electron, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installBuddyRuntimeProbe } from './buddy-runtime-instrumentation.mjs';
import {
  proofAssetFile,
  proofAssetUrl,
  proofOutputPath,
  proofLocalDirectory,
} from './buddy-proof-options.mjs';

// One instrumented, compiled native panel run. No screenshots/video during the
// timed interaction, no microphone/provider/backend task, no product diagnostics.
const artifactDir = path.resolve(proofOutputPath('artifacts/buddy-runtime-native'));
const local = path.resolve(proofLocalDirectory, 'buddy-runtime-native');
const dist = path.resolve('dist');
const lifecycleOnly = process.argv.includes('--lifecycle-only');
await Promise.all([mkdir(artifactDir, { recursive: true }), mkdir(local, { recursive: true })]);
const rendererChunk = (await readdir(path.join(dist, 'assets'))).find((name) =>
  /^buddyRenderer-.*\.js$/.test(name),
);
if (!rendererChunk) throw new Error('Compiled buddyRenderer chunk missing; build before running.');
const asset = await readFile(path.join(dist, 'buddy', proofAssetFile));
expect(asset.toString('ascii', 0, 4)).toBe('glTF');
expect(asset.readUInt32LE(16)).toBe(0x4e4f534a);
const assetDefinition = JSON.parse(
  asset.subarray(20, 20 + asset.readUInt32LE(12)).toString('utf8'),
);
const hasTransmission = assetDefinition.materials.some(
  (material) => (material.extensions?.KHR_materials_transmission?.transmissionFactor ?? 0) > 0,
);
// This is a narrow classification of the installed implementation, not an
// allowance for arbitrary renderer leftovers or a physical-VRAM assertion.
const threeSourceEvidence = [
  {
    path: 'src/renderers/WebGLRenderer.js',
    sha256: '9e8740aad691246b31b3704014e8f3bbd38a8e7bf4b1b4d23868541b023cc63a',
    mechanism:
      'Lines459–461 create scratch/src/dst FBOs;1094 calls renderStates.dispose;2012–2044 create and size the per-camera multisampled transmission target.',
  },
  {
    path: 'src/renderers/webgl/WebGLRenderStates.js',
    sha256: '04bebc4f2eab3c34e2583e183aa5fa2a51d7afcfb5465b51eb98889d95dbcc7b',
    mechanism:
      'Lines110–113 replace the render-state WeakMap without disposing its cached transmission target.',
  },
  {
    path: 'src/renderers/webgl/WebGLTextures.js',
    sha256: 'a1947fd09ac98b3a57e40018dc8eccfce9c40f2cf4b6200b3180a00af5406451',
    mechanism:
      'Lines1974/2082/2106–2133 create the depth buffer, resolve/multisample FBOs and colour/depth RBOs;409–464 delete them only upon target disposal.',
  },
  {
    path: 'src/core/RenderTarget.js',
    sha256: 'e2d00d331e0eab1a2b5e53fbd9f2d87c69170b92b7a33c0059a8ea5eb3383820',
    mechanism:
      'Lines365–391: setSize disposes the old target allocations when its dimensions change; subsequent rendering recreates them.',
  },
  {
    path: 'src/renderers/webgl/WebGLState.js',
    sha256: 'fd6adb6c01d75a148ef6ebc8ea948a38acc1a48d3cfdbbb1d12dbde668092431',
    mechanism: 'emptyTextures contains four internal1×1 fallback texture handles.',
  },
  {
    path: 'src/renderers/shaders/DFGLUTData.js',
    sha256: '280b75b70d9d55c39d4121d5244c22ee445d27cc05ed6b134c3a5bde6b81b3da',
    mechanism:
      'getDFGLUT supplies the shared16×16 RG16F lookup texture; its exact upload prefix is asserted below.',
  },
];
expect(JSON.parse(await readFile('node_modules/three/package.json', 'utf8')).version).toBe(
  '0.186.1',
);
await Promise.all(
  threeSourceEvidence.map(async (source) => {
    const bytes = await readFile(path.join('node_modules/three', source.path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
  }),
);
const previousBytes = lifecycleOnly ? await readFile(path.join(artifactDir, 'report.json')) : null;
const previous = previousBytes ? JSON.parse(previousBytes.toString('utf8')) : null;
if (
  previous &&
  (previous.asset.rendererChunk !== rendererChunk ||
    previous.asset.sha256 !== createHash('sha256').update(asset).digest('hex') ||
    !previous.measuredPerformanceTargetsMet)
)
  throw new Error(
    'Lifecycle-only followup requires unchanged compiled renderer/asset and accepted existing timing.',
  );
const profile = await mkdtemp(path.join(tmpdir(), 'insightos-runtime-'));
const entry = path.join(local, `main-${process.pid}.cjs`);
await writeFile(
  entry,
  `const {app}=require('electron');\napp.setPath('userData',${JSON.stringify(profile)});\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
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
    LOCAL_DATA_DIR: profile,
  },
  timeout: 30000,
});
const deadline = setTimeout(() => desktop.process().kill(), 75000);
let report = {
  checkedAt: new Date().toISOString(),
  pass: false,
  asset: {
    url: proofAssetUrl,
    bytes: asset.length,
    sha256: createHash('sha256').update(asset).digest('hex'),
    binaryHeader: asset.toString('ascii', 0, 4),
    rendererChunk,
  },
  scope: {
    ui: 'Actual compiled dist served at the native shell trusted local origin; actual main/preload/security/IPC, fresh isolated profile. Initial dev avatar warms bootstrap; this is not a cold-load test.',
    interaction:
      'Real panel typing, one delayed local task response driving authoritative thinking/idle, repeated open/close and rapid reversals. No mic, TTS, provider or production backend task.',
    timing:
      'Test-only WebGL/rAF API wrappers add overhead. Document rAF and actual avatar draw callback clocks are proxies, not OS presentation. No screenshot, video, GPU info or memory dump inside the timed interaction.',
    resources:
      'Created/deleted WebGL handle counts, not allocated bytes, physical VRAM or driver reclamation. The live field means created minus explicit delete, not validity after context loss. Test-held references intentionally prevent a GC claim.',
    lifecycle:
      'Actual compiled renderer API in a separate 96px test owner after panel timing; actual IntersectionObserver offscreen and native window hide/show; actual dispose. Native pet counts remain separate.',
  },
};
let tracing = false;
const traceFile = path.join(local, 'chromium-trace.json');
if (previous) {
  const traceBytes = await readFile(traceFile);
  expect(createHash('sha256').update(traceBytes).digest('hex')).toBe(previous.trace.traceSha256);
  report = {
    ...previous,
    pass: false,
    functionalPass: false,
    error: undefined,
    scope: {
      ...previous.scope,
      runStructure:
        'Timed panel trace retained unchanged from the original native process. The accepted lifecycle followup used a second fresh isolated native profile with the same compiled renderer and GLB; it did not rerun timing or tracing.',
    },
    lifecycleFollowup: {
      checkedAt: new Date().toISOString(),
      sourceReportSha256: createHash('sha256').update(previousBytes).digest('hex'),
      previousAssertion:
        'Earlier same-size/v002 assertions did not account for v003 transmission-target resizing or its cached target after dispose. This followup allows only bounded balanced resize signatures and pinned Three-owned lost-context residuals; owned-resource checks stay strict.',
    },
  };
}

function assertNativeResourceStability(before, after, repetitions) {
  expect(before).toBeTruthy();
  expect(after).toBeTruthy();
  expect(after.id).toBe(before.id);
  expect(before.contextLost).toBe(false);
  expect(after.contextLost).toBe(false);
  expect(Object.keys(after.resources).sort()).toEqual(Object.keys(before.resources).sort());
  const deltas = {};
  for (const [kind, initial] of Object.entries(before.resources)) {
    const final = after.resources[kind];
    expect(final.live).toBe(initial.live);
    expect(initial.created - initial.deleted).toBe(initial.live);
    expect(final.created - final.deleted).toBe(final.live);
    const created = final.created - initial.created;
    const deleted = final.deleted - initial.deleted;
    expect(Number.isSafeInteger(created)).toBe(true);
    expect(created).toBeGreaterThanOrEqual(0);
    expect(deleted).toBe(created);
    deltas[kind] = { created, deleted, live: final.live - initial.live };
  }
  const resizeCount = deltas.Texture.created;
  // Five closed/open pairs, the initial reveal and at most two draws around
  // the rapid exit reversal can resize the target. No unlimited balanced churn.
  expect(resizeCount).toBeLessThanOrEqual(repetitions * 2 + 3);
  const ratios = { Texture: 1, Framebuffer: 2, Renderbuffer: 3 };
  for (const [kind, delta] of Object.entries(deltas))
    expect(delta.created).toBe(resizeCount * (ratios[kind] ?? 0));
  let transmissionDimensions = null;
  if (resizeCount > 0) {
    expect(hasTransmission).toBe(true);
    const target = (record, size) =>
      record.unmatchedTextureSignatures.filter(
        (texture) =>
          texture.storage?.target === 3553 &&
          texture.storage?.internalFormat === 34842 &&
          texture.storage?.width === size &&
          texture.storage?.height === size,
      );
    const initialTarget = target(before, 96);
    const finalTarget = target(after, 72);
    expect(initialTarget).toHaveLength(1);
    expect(finalTarget).toHaveLength(1);
    expect(initialTarget[0].storage).toEqual({
      target: 3553,
      internalFormat: 34842,
      width: 96,
      height: 96,
    });
    expect(finalTarget[0].storage).toEqual({
      target: 3553,
      internalFormat: 34842,
      width: 72,
      height: 72,
    });
    const otherTextures = (record, excluded) =>
      record.unmatchedTextureSignatures
        .filter((texture) => texture !== excluded)
        .map((texture) => JSON.stringify(texture))
        .sort();
    expect(otherTextures(after, finalTarget[0])).toEqual(otherTextures(before, initialTarget[0]));
    // Only the resolve/multisample pair advances in creation order; constructor
    // and PMREM FBOs stay identical. RBO storage is not recorded by this probe.
    expect(after.unmatchedFramebufferCreationOrders.slice(0, -2)).toEqual(
      before.unmatchedFramebufferCreationOrders.slice(0, -2),
    );
    expect(after.unmatchedFramebufferCreationOrders.slice(-2)).toEqual(
      before.unmatchedFramebufferCreationOrders.slice(-2).map((order) => order + 2 * resizeCount),
    );
    transmissionDimensions = { before: initialTarget[0].storage, after: finalTarget[0].storage };
  } else {
    // Preserve the original exact-equality gate for unchanged-size/historical runs.
    expect(after.resources).toEqual(before.resources);
    expect(after.unmatchedTextureSignatures).toEqual(before.unmatchedTextureSignatures);
    expect(after.unmatchedFramebufferCreationOrders).toEqual(
      before.unmatchedFramebufferCreationOrders,
    );
  }
  return {
    stableLiveCounts: true,
    exactEquality: resizeCount === 0,
    resizeCount,
    maxExpectedResizes: repetitions * 2 + 3,
    balancedCreatesDeletes: deltas,
    transmissionDimensions,
    classificationScope:
      'Endpoint texture dimensions and FBO creation-order accounting prove the bounded resize signature; intermediate dimensions and RBO storage formats are not recorded. All other cumulative counters and texture signatures remain equal. No total-VRAM claim.',
  };
}

async function summarizeTrace(filename) {
  const bytes = await readFile(filename);
  const events = JSON.parse(bytes.toString('utf8')).traceEvents ?? [];
  const names = new Map();
  for (const event of events) names.set(event.name, (names.get(event.name) ?? 0) + 1);
  const markers = events.filter(
    (event) => event.name === 'TimeStamp' && /INSIGHTOS_/.test(event.args?.data?.message ?? ''),
  );
  const start = markers.find((event) => event.args.data.message === 'INSIGHTOS_RUNTIME_START');
  const end = markers.find((event) => event.args.data.message === 'INSIGHTOS_RUNTIME_END');
  const feedback = events
    .filter(
      (event) =>
        event.name === 'AnimationFrame::Presentation' &&
        event.pid === start?.pid &&
        event.ts >= start?.ts &&
        event.ts <= end?.ts,
    )
    .sort((a, b) => a.ts - b.ts);
  const times = [...new Set(feedback.map((event) => event.ts))];
  const intervals = times.slice(1).map((at, index) => ({
    fromTs: times[index],
    toTs: at,
    intervalMs: (at - times[index]) / 1000,
  }));
  const sorted = [...intervals].sort((a, b) => a.intervalMs - b.intervalMs);
  const feedbackCsv = [
    'trace_timestamp_us,renderer_pid,begin_frame_source_id,begin_frame_sequence,trace_frame_id',
    ...feedback.map((event) =>
      [
        event.ts,
        event.pid,
        event.args?.begin_frame_id?.source_id ?? '',
        event.args?.begin_frame_id?.sequence_number ?? '',
        event.args?.id ?? '',
      ].join(','),
    ),
  ].join('\n');
  await writeFile(path.join(artifactDir, 'presentation-feedback.csv'), `${feedbackCsv}\n`);
  return {
    localTrace: path.relative(process.cwd(), path.join(local, 'chromium-trace.json')),
    traceBytes: bytes.length,
    traceSha256: createHash('sha256').update(bytes).digest('hex'),
    events: events.length,
    clock:
      'Trace ts/dur are Chromium monotonic microseconds across native processes; browser performance.now/rAF times are document-relative milliseconds. START/END TimeStamp events identify the timed window; different clock origins are not subtracted.',
    markers,
    relevantNames: [...names.entries()]
      .filter(([name]) => /present|swap|frame.*report|graphics\.pipeline/i.test(name))
      .map(([name, count]) => ({ name, count })),
    presentationFeedback: {
      event: 'AnimationFrame::Presentation',
      samplesFile: proofOutputPath('artifacts/buddy-runtime-native/presentation-feedback.csv'),
      rendererPid: start?.pid,
      fullTimedWindowRetained: Boolean(start && end),
      eventCount: feedback.length,
      uniqueTimestamps: times.length,
      intervalSamples: intervals.length,
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]?.intervalMs ?? null,
      maxMs: sorted.at(-1)?.intervalMs ?? null,
      above20Ms: intervals.filter((value) => value.intervalMs > 20).length,
      above50Ms: intervals.filter((value) => value.intervalMs > 50).length,
      worstIntervals: sorted.slice(-5),
      firstSamples: feedback.slice(0, 3),
      lastSamples: feedback.slice(-3),
      interpretation:
        'Chromium emits these events with presentation_feedback.timestamp, which strengthens the rAF-only evidence. Captured events include begin-frame IDs but no hardware-clock/completion flags. These are Chromium presentation-feedback timestamps; verified OS/hardware scanout is unclaimed.',
      sources: [
        {
          url: 'https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/core/frame/animation_frame_timing_monitor.cc',
          function: 'ReportPresentationTimeToTrace',
          observedSourceBlob: '889d81e50335cb65fbd6a7a507fdadb09012cf92',
          checkedAt: '2026-10-10',
          limit:
            'Current primary source; exact packaged Chromium152 source tag was unavailable to the web reader.',
        },
        {
          url: 'https://chromium.googlesource.com/chromium/src/+/e3a53f1c01e45bde54be17921f6960f22721efd5/ui/gfx/presentation_feedback.h',
          mechanism:
            'kHWClock and kHWCompletion distinguish hardware-origin/completion feedback from estimates; captured AnimationFrame events do not include these flags.',
        },
      ],
    },
    strictGates: {
      p95PresentedIntervals:
        'Chromium presentation-feedback intervals measured below; hardware-backed OS presentation remains unverified because feedback flags are absent.',
      noAppCausedOver50Ms:
        'A bounded trace with zero feedback intervals over50ms supports this run only; physical presentation and arbitrary workload attribution are unverified.',
      firstResponseWithinTwoPresentedFrames:
        'Unverified: state markers and frame IDs do not by themselves attribute the first visible pixel change to a causal input frame.',
    },
  };
}

try {
  const page = await desktop.firstWindow();
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-model',
    'sprout',
    { timeout: 30000 },
  );
  await page.goto('about:blank');
  const errors = [];
  const apiCalls = [];
  const servedAvatarAssets = [];
  const empty = { folder: null, code: null, browser: null, screen: null };
  let requestCount = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.context().route('http://127.0.0.1:5173/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname.startsWith('/api/')) {
      apiCalls.push({ pathname, method: route.request().method() });
      let body = {};
      if (pathname === '/api/status')
        body = {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true, pythonConfigured: true, editorConfigured: true },
          integrations: {
            huggingFace: { configured: true, model: 'local-fixture' },
            elevenLabs: { configured: false, ttsConfigured: false },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        };
      if (pathname === '/api/computer/state') body = empty;
      if (pathname === '/api/computer/request') {
        requestCount++;
        await new Promise((resolve) => setTimeout(resolve, 650));
        body = {
          state: empty,
          summary: 'Local timing fixture complete. This response is simulated.\n'.repeat(10),
        };
      }
      if (pathname === '/api/connections')
        body = {
          editable: false,
          defaults: {
            HF_MODEL_ID: 'local-fixture',
            HF_VISION_MODEL_ID: 'local-fixture',
            ELEVENLABS_VOICE_ID: 'local-fixture',
            DATABRICKS_HOST: '',
            DATABRICKS_WAREHOUSE_ID: '',
            DATABRICKS_CATALOG: '',
            DATABRICKS_SCHEMA: '',
            APP_MODE: 'sample',
          },
          configured: {
            huggingFace: false,
            elevenLabs: false,
            databricks: false,
            neon: false,
            vultr: false,
          },
          reports: {},
        };
      return route.fulfill({ json: body });
    }
    const filename = path.resolve(dist, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!filename.startsWith(`${dist}${path.sep}`))
      return route.fulfill({ status: 400, body: 'Invalid artifact path' });
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.glb': 'model/gltf-binary',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    };
    try {
      const bytes = await readFile(filename);
      if (pathname.endsWith('.glb'))
        servedAvatarAssets.push({
          url: pathname,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      return route.fulfill({
        contentType: mime[path.extname(filename)] ?? 'application/octet-stream',
        body: bytes,
      });
    } catch {
      return route.fulfill({ status: 404, body: 'Artifact missing' });
    }
  });
  await page.context().addInitScript(installBuddyRuntimeProbe, { rendererChunk });
  await page.goto('http://127.0.0.1:5173/?desktop=buddy', { waitUntil: 'domcontentloaded' });
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setZoomFactor(1);
    win.show();
    win.focus();
  });
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute('data-model', 'sprout');
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-renderer',
    'webgl',
  );
  const pet = page.locator('.buddy-face');
  expect(servedAvatarAssets).toContainEqual({ url: proofAssetUrl, sha256: report.asset.sha256 });
  report.asset.served = servedAvatarAssets;
  const composer = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  const close = page.getByRole('button', { name: 'Collapse conversation', exact: true });
  const buddy = page.locator('.buddy');
  const snapshot = () => page.evaluate(() => window.__buddyRuntimeProbe.snapshot());
  await pet.click();
  await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
  await composer.fill('Warm the local thinking shader before the timed run');
  await composer.press('Enter');
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-phase',
    'thinking',
  );
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute('data-phase', 'idle');
  await close.click();
  await expect(buddy).toHaveAttribute('data-panel-stage', 'closed');
  await page.waitForTimeout(300);
  const before = await snapshot();
  const currentNative = await desktop.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const p = win.webContents.getLastWebPreferences();
    return {
      bounds: win.getBounds(),
      workArea: screen.getDisplayMatching(win.getBounds()).workArea,
      preferences: {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
        webSecurity: p.webSecurity,
        backgroundThrottling: win.webContents.getBackgroundThrottling(),
      },
      versions: process.versions,
    };
  });
  currentNative.initialVisibilitySnapshot = await page.evaluate(() =>
    window.insightos.desktopVisibility(),
  );
  expect(currentNative.initialVisibilitySnapshot.visible).toBe(true);
  expect(Number.isSafeInteger(currentNative.initialVisibilitySnapshot.revision)).toBe(true);
  expect(currentNative.preferences.backgroundThrottling).toBe(false);
  if (lifecycleOnly) report.lifecycleFollowup.native = currentNative;
  else report.native = currentNative;
  let measurement;
  if (!lifecycleOnly) {
    await desktop.evaluate(({ contentTracing }) =>
      contentTracing.startRecording({
        included_categories: ['viz', 'cc', 'gpu', 'benchmark', 'devtools.timeline'],
        recording_mode: 'record-until-full',
        trace_buffer_size_in_kb: 32768,
      }),
    );
    tracing = true;
    const startedAt = await page.evaluate(() => window.__buddyRuntimeProbe.begin());
    await pet.click();
    await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
    await composer.pressSequentially(
      'Explain these options in plain language while I compare them.',
      { delay: 15 },
    );
    await composer.press('Enter');
    await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
      'data-phase',
      'thinking',
    );
    await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute('data-phase', 'idle');
    const draft = 'Keep this unsent draft through every opening and reversal.';
    await composer.pressSequentially(draft, { delay: 15 });
    for (let index = 0; index < 5; index++) {
      await close.click();
      await expect(buddy).toHaveAttribute('data-panel-stage', 'closed');
      await pet.click();
      await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
      await expect(composer).toHaveValue(draft);
    }
    // Dispatch only the real button action to reverse an in-flight exit. The
    // native preload/window bounds and panel reducer are not replaced.
    const reversalStage = await page.evaluate(async () => {
      document.querySelector('button[aria-label="Collapse conversation"]').click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const stage = document.querySelector('.buddy').dataset.panelStage;
      document.querySelector('.buddy-face').click();
      return stage;
    });
    expect(reversalStage).toBe('closing');
    await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
    await expect(composer).toHaveValue(draft);
    await page.waitForTimeout(400);
    measurement = await page.evaluate(() => window.__buddyRuntimeProbe.end());
    const after = await snapshot();
    const tracePath = await desktop.evaluate(
      ({ contentTracing }, file) => contentTracing.stopRecording(file),
      traceFile,
    );
    tracing = false;
    report.interaction = {
      startedAt,
      durationMs: measurement.endedAt - startedAt,
      ...measurement,
      repetitions: 5,
      rapidExitReversal: { atStage: reversalStage, delayMs: 25 },
      retainedDraft: await composer.inputValue(),
      before,
      after,
      fixtureTaskRequests: requestCount,
    };
    report.trace = await summarizeTrace(tracePath);
    expect(report.trace.presentationFeedback.fullTimedWindowRetained).toBe(true);
    expect(report.trace.presentationFeedback.intervalSamples).toBeGreaterThan(100);
    expect(Number.isFinite(report.trace.presentationFeedback.p95Ms)).toBe(true);
    report.measuredPerformanceTargetsMet =
      report.trace.presentationFeedback.p95Ms <= 20 &&
      report.trace.presentationFeedback.above50Ms === 0;
    report.strictHardwarePresentationAcceptance =
      'Unverified; feedback hardware flags and causal first-response pixel/frame attribution are unavailable.';
    expect(report.measuredPerformanceTargetsMet).toBe(true);
    const nativeBefore = before.contexts.find(
      (context) => context.label === 'native-pet' && !context.contextLost,
    );
    const nativeAfter = after.contexts.find((context) => context.id === nativeBefore?.id);
    expect(nativeBefore).toBeTruthy();
    assertNativeResourceStability(nativeBefore, nativeAfter, report.interaction.repetitions);
    expect(nativeAfter.pendingAvatarCallbacks).toBe(1);
    expect(after.globalPendingAvatarCallbacks).toBe(1);
    expect(after.unassignedPendingAvatarCallbacks).toBe(0);
    expect(
      measurement.avatar.find((context) => context.id === nativeBefore.id).drawCallbackClock
        .samples,
    ).toBeGreaterThan(100);
    expect(measurement.mutations.some((state) => state.phase === 'thinking')).toBe(true);
    expect(measurement.mutations.some((state) => state.panelStage === 'closing')).toBe(true);
  } else {
    measurement = report.interaction;
  }
  // The retained timed run already exercised five native open/close cycles.
  // Reassert live counts and only the pinned transmission resize allocation
  // pattern, even when this followup reruns only lifecycle.
  expect(report.interaction.repetitions).toBe(5);
  const stableNativeBefore = report.interaction.before.contexts.find(
    (context) => context.label === 'native-pet' && !context.contextLost,
  );
  const stableNativeAfter = report.interaction.after.contexts.find(
    (context) => context.id === stableNativeBefore?.id,
  );
  expect(stableNativeBefore).toBeTruthy();
  const resourceAccounting = assertNativeResourceStability(
    stableNativeBefore,
    stableNativeAfter,
    report.interaction.repetitions,
  );
  report.resourceStability = {
    scope:
      'The original timed native five-cycle panel run, retained unchanged by lifecycle-only followup. A96px closed→72px expanded avatar resizes its Three transmission target; only balanced texture:FBO:RBO1:2:3 reallocation is allowed. Historical same-size exact-equality evidence remains separate and unchanged; no create/dispose-cycle or total-VRAM claim.',
    repetitions: report.interaction.repetitions,
    before: stableNativeBefore.resources,
    after: stableNativeAfter.resources,
    ...resourceAccounting,
  };

  // A second owner isolates IntersectionObserver and disposal without unmounting
  // the native panel or adding any product-only diagnostics.
  await page.evaluate(async (chunk) => {
    const owner = document.createElement('div');
    owner.style.cssText =
      'position:fixed;left:8px;top:8px;width:96px;height:96px;pointer-events:none;z-index:9999';
    owner.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.__runtimeProbeLabel = 'isolated-lifecycle-owner';
    owner.append(canvas);
    document.body.append(owner);
    const module = await import(`/assets/${chunk}`);
    const renderer = await module.createBuddyRenderer(
      canvas,
      { phase: 'idle', motion: true },
      () => {},
    );
    if (!renderer) throw new Error('Actual compiled lifecycle renderer failed');
    window.__runtimeLifecycle = { owner, canvas, renderer };
  }, rendererChunk);
  await page.waitForTimeout(350);
  const ownerActive = await snapshot();
  const ownerId = ownerActive.contexts.find(
    (context) => context.label === 'isolated-lifecycle-owner',
  ).id;
  const ownerRecord = (value) => value.contexts.find((context) => context.id === ownerId);
  report.lifecycle = { ownerId, ownerActive };
  expect(ownerRecord(ownerActive).avatarCallbacks).toBeGreaterThan(0);
  expect(ownerActive.globalPendingAvatarCallbacks).toBe(2);
  await page.evaluate(() => {
    window.__runtimeLifecycle.owner.style.left = '2000px';
  });
  await page.waitForTimeout(180);
  const offscreenStart = await snapshot();
  await page.waitForTimeout(450);
  const offscreenEnd = await snapshot();
  Object.assign(report.lifecycle, { offscreenStart, offscreenEnd });
  expect(ownerRecord(offscreenEnd).draws).toBe(ownerRecord(offscreenStart).draws);
  expect(ownerRecord(offscreenEnd).avatarCallbacks).toBe(
    ownerRecord(offscreenStart).avatarCallbacks,
  );
  expect(ownerRecord(offscreenEnd).pendingAvatarCallbacks).toBe(0);
  expect(offscreenEnd.globalPendingAvatarCallbacks).toBe(1);
  expect(offscreenEnd.unassignedPendingAvatarCallbacks).toBe(0);
  await page.evaluate(() => {
    window.__runtimeLifecycle.owner.style.left = '8px';
  });
  await page.waitForTimeout(250);
  const restoredOwner = await snapshot();
  report.lifecycle.restoredOwner = restoredOwner;
  expect(ownerRecord(restoredOwner).avatarCallbacks).toBeGreaterThan(
    ownerRecord(offscreenEnd).avatarCallbacks,
  );
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await page.waitForTimeout(150);
  const hiddenStart = await snapshot();
  await page.evaluate(() =>
    window.__runtimeLifecycle.renderer.update({ phase: 'thinking', motion: true, reaction: 1 }),
  );
  await page.waitForTimeout(450);
  const hiddenEnd = await snapshot();
  const hiddenVisibility = await page.evaluate(() => window.insightos.desktopVisibility());
  Object.assign(report.lifecycle, {
    nativeWindowHidden: await desktop.evaluate(
      ({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    hiddenStart,
    hiddenEnd,
    hiddenSettingsUpdate: {
      phase: 'thinking',
      motion: true,
      reaction: 1,
      source: 'simulated direct compiled-owner settings',
    },
  });
  expect(report.lifecycle.nativeWindowHidden).toBe(true);
  expect(hiddenVisibility.visible).toBe(false);
  expect(hiddenVisibility.revision).toBeGreaterThan(
    currentNative.initialVisibilitySnapshot.revision,
  );
  // Native backgroundThrottling intentionally stays disabled for voice/task
  // timers. The read-only native visibility bridge, not document.hidden, must
  // cancel actual avatar work while BrowserWindow.isVisible() is false.
  expect(hiddenEnd.globalPendingAvatarCallbacks).toBe(0);
  expect(hiddenEnd.unassignedPendingAvatarCallbacks).toBe(0);
  for (const context of hiddenStart.contexts.filter((context) => !context.contextLost)) {
    const next = hiddenEnd.contexts.find((value) => value.id === context.id);
    expect(next.draws).toBe(context.draws);
    expect(next.avatarCallbacks).toBe(context.avatarCallbacks);
    expect(next.pendingAvatarCallbacks).toBe(0);
  }
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.show();
    win.focus();
  });
  await expect.poll(() => page.evaluate(() => document.hidden)).toBe(false);
  await page.waitForTimeout(250);
  const shown = await snapshot();
  const shownVisibility = await page.evaluate(() => window.insightos.desktopVisibility());
  expect(shownVisibility.visible).toBe(true);
  expect(ownerRecord(shown).draws).toBeGreaterThan(ownerRecord(hiddenEnd).draws);
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect
    .poll(() =>
      desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()),
    )
    .toBe(true);
  await page.waitForTimeout(150);
  const minimizedStart = await snapshot();
  await page.waitForTimeout(450);
  const minimizedEnd = await snapshot();
  const minimizedVisibility = await page.evaluate(() => window.insightos.desktopVisibility());
  expect(minimizedVisibility.visible).toBe(false);
  expect(minimizedVisibility.revision).toBeGreaterThan(hiddenVisibility.revision);
  Object.assign(report.lifecycle, { minimizedStart, minimizedEnd });
  expect(minimizedEnd.globalPendingAvatarCallbacks).toBe(0);
  expect(minimizedEnd.unassignedPendingAvatarCallbacks).toBe(0);
  for (const context of minimizedStart.contexts.filter((context) => !context.contextLost)) {
    const next = minimizedEnd.contexts.find((value) => value.id === context.id);
    expect(next.draws).toBe(context.draws);
    expect(next.avatarCallbacks).toBe(context.avatarCallbacks);
  }
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.restore();
    win.show();
    win.focus();
  });
  await page.waitForTimeout(250);
  const unminimized = await snapshot();
  const restoredVisibility = await page.evaluate(() => window.insightos.desktopVisibility());
  expect(restoredVisibility.visible).toBe(true);
  expect(ownerRecord(unminimized).draws).toBeGreaterThan(ownerRecord(minimizedEnd).draws);
  await page.evaluate(() => window.__runtimeLifecycle.renderer.dispose());
  await page.waitForTimeout(120);
  const disposedStart = await snapshot();
  // Previously registered listeners must not restart the disposed renderer.
  await page.evaluate(() => {
    const { owner, canvas } = window.__runtimeLifecycle;
    owner.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    document.dispatchEvent(new Event('visibilitychange'));
    owner.style.width = '92px';
  });
  await page.waitForTimeout(450);
  const disposedEnd = await snapshot();
  expect(ownerRecord(disposedEnd).draws).toBe(ownerRecord(disposedStart).draws);
  expect(ownerRecord(disposedEnd).avatarCallbacks).toBe(ownerRecord(disposedStart).avatarCallbacks);
  expect(ownerRecord(disposedEnd).pendingAvatarCallbacks).toBe(0);
  expect(disposedEnd.globalPendingAvatarCallbacks).toBe(1);
  expect(disposedEnd.unassignedPendingAvatarCallbacks).toBe(0);
  expect(ownerRecord(disposedEnd).contextLost).toBe(true);
  const disposedDiagnostics = await page.evaluate(() =>
    window.__runtimeLifecycle.renderer.diagnostics(),
  );
  expect(disposedDiagnostics.assetUrl).toBe(proofAssetUrl);
  Object.assign(report.lifecycle, {
    disposedStart,
    disposedEnd,
    disposedDiagnostics,
    nativeVisibilitySnapshots: {
      hiddenVisibility,
      shownVisibility,
      minimizedVisibility,
      restoredVisibility,
    },
  });
  // Refresh must reset the clock across all 450ms suspension windows rather
  // than include an old hidden/offscreen timestamp in the resumed delta.
  expect(disposedDiagnostics.intervalMax).toBeLessThan(450);
  expect(disposedDiagnostics.memory.geometries).toBe(0);
  expect(disposedDiagnostics.memory.textures).toBe(hasTransmission ? 2 : 1);
  const textureSignatures = ownerRecord(disposedEnd).unmatchedTextureSignatures;
  const lut = textureSignatures.filter(
    (texture) =>
      texture.storage?.width === 16 &&
      texture.storage?.height === 16 &&
      texture.storage?.internalFormat === 33327 &&
      texture.storage?.target === 3553 &&
      texture.upload?.elements === 512 &&
      texture.upload?.bytes === 1024 &&
      JSON.stringify(texture.upload.firstValues) ===
        JSON.stringify([12469, 15057, 12620, 14925, 13266, 14620, 13807, 14376]),
  );
  expect(lut).toHaveLength(1);
  const transmission = textureSignatures.filter(
    (texture) => texture.storage?.internalFormat === 34842,
  );
  expect(transmission).toHaveLength(hasTransmission ? 1 : 0);
  if (hasTransmission)
    expect(transmission[0].storage).toEqual({
      target: 3553,
      internalFormat: 34842,
      width: 96,
      height: 96,
    });
  expect(textureSignatures).toHaveLength(hasTransmission ? 6 : 5);
  expect(ownerRecord(disposedEnd).unmatchedFramebufferCreationOrders).toEqual(
    hasTransmission ? [0, 1, 2, 5, 6] : [0, 1, 2],
  );
  const fallbackTextures = textureSignatures
    .filter((texture) => texture.storage?.width === 1 && texture.storage?.height === 1)
    .map((texture) => texture.storage)
    .sort((a, b) => a.target - b.target);
  expect(fallbackTextures).toEqual([
    { target: 3553, internalFormat: 6408, width: 1, height: 1 },
    { target: 32879, internalFormat: 6408, width: 1, height: 1, depth: 1 },
    { target: 34067, internalFormat: 6408, width: 1, height: 1 },
    { target: 35866, internalFormat: 6408, width: 1, height: 1, depth: 1 },
  ]);
  const expectedUnmatchedResources = {
    Texture: hasTransmission ? 6 : 5,
    Framebuffer: hasTransmission ? 5 : 3,
    Renderbuffer: hasTransmission ? 3 : 0,
    Buffer: 0,
    Program: 0,
    Shader: 0,
    VertexArray: 0,
  };
  expect(Object.keys(ownerRecord(disposedEnd).resources).sort()).toEqual(
    Object.keys(expectedUnmatchedResources).sort(),
  );
  for (const [kind, count] of Object.entries(ownerRecord(disposedEnd).resources)) {
    expect(count.live).toBe(expectedUnmatchedResources[kind]);
    expect(count.created - count.deleted).toBe(count.live);
  }
  // Exact residual signatures above exclude every owned model map, bone/morph
  // texture and PMREM target. Record their active signatures and explicit deletes.
  const explicitlyDisposedTextures = ownerRecord(ownerActive).unmatchedTextureSignatures.filter(
    (texture) =>
      !textureSignatures.some((residual) => JSON.stringify(texture) === JSON.stringify(residual)),
  );
  expect(explicitlyDisposedTextures).toHaveLength(hasTransmission ? 5 : 3);
  expect(
    ownerRecord(disposedEnd).resources.Texture.deleted -
      ownerRecord(ownerActive).resources.Texture.deleted,
  ).toBe(explicitlyDisposedTextures.length);
  if (hasTransmission)
    expect(explicitlyDisposedTextures).toContainEqual({
      storage: { target: 3553, levels: 8, internalFormat: 35907, width: 128, height: 64 },
    });
  report.lifecycle = {
    ...report.lifecycle,
    ownerId,
    ownerActive,
    offscreenStart,
    offscreenEnd,
    restoredOwner,
    hiddenStart,
    hiddenEnd,
    shown,
    minimizedStart,
    minimizedEnd,
    unminimized,
    disposedStart,
    disposedEnd,
    disposedDiagnostics,
    nativeVisibilitySnapshots: {
      hiddenVisibility,
      shownVisibility,
      minimizedVisibility,
      restoredVisibility,
    },
    disposedHandleNote: `Pinned Three0.186.1 leaves one shared DFG_LUT16×16 RG16F texture, four internal1×1 fallback textures and three constructor scratch/src/dst FBOs unmatched by explicit delete calls.${hasTransmission ? ' Its per-camera96×96RGBA16F transmission target also remains unmatched, with two resolve/multisample FBOs and three colour/depth RBOs: WebGLRenderStates.dispose only replaces its WeakMap.' : ''} The actual forced context loss makes all these context handles unusable. Exact signatures/counts are asserted; geometry, model map/bone/morph/PMREM textures, buffers, programs, shaders and VAOs are explicitly disposed. Three info.memory.textures retains${hasTransmission ? 2 : 1} internal cached entries. The five original panel cycles show no live-handle growth; size changes permit only the bounded balanced transmission allocation signature. Driver VRAM reclamation and GC are unmeasured.`,
    disposedTextureClassification: {
      signatures: textureSignatures,
      dfgLutMatched: true,
      expectedUnmatchedHandles: hasTransmission ? 6 : 5,
      installedThreeVersion: '0.186.1',
      pinnedInstalledSource: threeSourceEvidence,
      transmission: { presentInActualGlb: hasTransmission, matched: transmission },
      expectedUnmatchedResources,
      explicitlyDisposedTextures,
      ownedModelTexturesExplicitlyDeleted: true,
      unmatchedFramebufferCreationOrders:
        ownerRecord(disposedEnd).unmatchedFramebufferCreationOrders,
      framebufferSource:
        'node_modules/three/src/renderers/WebGLRenderer.js:initGLContext creates scratch/src/dst first; dispose contains no deleteFramebuffer call.',
    },
  };
  const lifecycleStates = {
    ownerActive,
    offscreenStart,
    offscreenEnd,
    restoredOwner,
    hiddenStart,
    hiddenEnd,
    shown,
    minimizedStart,
    minimizedEnd,
    unminimized,
    disposedStart,
    disposedEnd,
  };
  await writeFile(
    path.join(local, 'lifecycle-snapshots.json'),
    `${JSON.stringify(report.lifecycle, null, 2)}\n`,
  );
  const lifecycleCsv = [
    'state,document_ms,document_hidden,context_id,label,draw_calls,avatar_callbacks,pending_avatar_callbacks,global_pending_avatar_callbacks,unassigned_pending_avatar_callbacks,context_lost',
  ];
  for (const [state, snapshot] of Object.entries(lifecycleStates)) {
    for (const context of snapshot.contexts)
      lifecycleCsv.push(
        [
          state,
          snapshot.at,
          snapshot.hidden,
          context.id,
          context.label,
          context.draws,
          context.avatarCallbacks,
          context.pendingAvatarCallbacks,
          snapshot.globalPendingAvatarCallbacks,
          snapshot.unassignedPendingAvatarCallbacks,
          context.contextLost,
        ].join(','),
      );
  }
  await writeFile(path.join(artifactDir, 'lifecycle-counts.csv'), `${lifecycleCsv.join('\n')}\n`);
  const counterDelta = (before, after) => ({
    durationMs: after.at - before.at,
    globalPendingAvatarCallbacks: after.globalPendingAvatarCallbacks,
    unassignedPendingAvatarCallbacks: after.unassignedPendingAvatarCallbacks,
    contexts: after.contexts.map((context) => {
      const previous = before.contexts.find((value) => value.id === context.id);
      return {
        id: context.id,
        label: context.label,
        drawDelta: context.draws - previous.draws,
        callbackDelta: context.avatarCallbacks - previous.avatarCallbacks,
        pending: context.pendingAvatarCallbacks,
      };
    }),
  });
  report.lifecycle = {
    ownerId,
    nativeVisibilitySnapshots: report.lifecycle.nativeVisibilitySnapshots,
    countsFile: proofOutputPath('artifacts/buddy-runtime-native/lifecycle-counts.csv'),
    localFullSnapshots: path.relative(process.cwd(), path.join(local, 'lifecycle-snapshots.json')),
    offscreen: {
      suspension: counterDelta(offscreenStart, offscreenEnd),
      restore: counterDelta(offscreenEnd, restoredOwner),
    },
    hidden: {
      nativeWindowHidden: true,
      documentHidden: hiddenEnd.hidden,
      suspension: counterDelta(hiddenStart, hiddenEnd),
      settingsUpdate: report.lifecycle.hiddenSettingsUpdate,
      restore: counterDelta(hiddenEnd, shown),
    },
    minimized: {
      nativeWindowMinimized: true,
      documentHidden: minimizedEnd.hidden,
      suspension: counterDelta(minimizedStart, minimizedEnd),
      restore: counterDelta(minimizedEnd, unminimized),
    },
    disposed: {
      suspension: counterDelta(disposedStart, disposedEnd),
      contextLost: ownerRecord(disposedEnd).contextLost,
      handles: ownerRecord(disposedEnd).resources,
      textureClassification: report.lifecycle.disposedTextureClassification,
      diagnostics: disposedDiagnostics,
      note: report.lifecycle.disposedHandleNote,
    },
  };
  await page.evaluate(() => window.__runtimeLifecycle.owner.remove());
  if (lifecycleOnly) {
    await pet.click();
    await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
    await composer.fill(report.interaction.retainedDraft);
  }

  report.errors = errors;
  if (lifecycleOnly) report.lifecycleFollowup.apiCalls = apiCalls;
  else report.apiCalls = apiCalls;
  expect(errors).toEqual([]);
  expect(apiCalls.every((call) => !/speech|transcrib|voice/.test(call.pathname))).toBe(true);
  const image = await desktop.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  await writeFile(
    path.join(artifactDir, 'native-panel-after-timing.png'),
    Buffer.from(image, 'base64'),
  );
  report.pass = true;
  report.functionalPass = true;
  console.log(
    JSON.stringify(
      {
        pass: true,
        interactionMs: report.interaction.durationMs,
        avatar: measurement.avatar,
        panel: measurement.documentRafClock,
        traceNames: report.trace.relevantNames,
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (tracing)
    await desktop
      .evaluate(({ contentTracing }, file) => contentTracing.stopRecording(file), traceFile)
      .catch(() => {});
  clearTimeout(deadline);
  await writeFile(path.join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await desktop.close().catch(() => desktop.process().kill());
  await unlink(entry).catch(() => {});
}
