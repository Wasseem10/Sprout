// Real isolated Electron app and authored v004 clips. Only API/audio inputs are local fixtures.
// This recording is a functional proof, never a frame-performance measurement.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const output = path.resolve('artifacts/glass-sprout-v004/native-behaviors');
const local = path.resolve('.local/glass-sprout-v004');
const compiled = !process.argv.includes('--development');
const recording = !process.argv.includes('--no-record');
const assetUrl = '/buddy/sprout-v004.glb';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assetBytes = await readFile(path.resolve('public/buddy/sprout-v004.glb'));
const assetSha256 = sha(assetBytes);
assert.equal(assetSha256, sha(await readFile('design/buddy/sprout/sprout-prism-v004.glb')));
const gltf = JSON.parse(assetBytes.subarray(20, 20 + assetBytes.readUInt32LE(12)).toString());
const requiredClips = [
  'Sprout_JoyJump',
  'Sprout_SleepEnter',
  'Sprout_SleepLoop',
  'Sprout_Wake',
  'Sprout_Done',
];
for (const name of requiredClips)
  assert.ok(
    gltf.animations.some((clip) => clip.name === name),
    name,
  );
const dist = path.resolve('dist');
if (compiled)
  assert.equal(
    sha(await readFile(path.join(dist, assetUrl))),
    assetSha256,
    'Build final v004 dist first.',
  );
await Promise.all([mkdir(output, { recursive: true }), mkdir(local, { recursive: true })]);
const isolatedData = await mkdtemp(path.join(tmpdir(), 'insightos-behaviors-native-'));
const entry = path.join(local, `behaviors-main-${process.pid}.cjs`);
await writeFile(
  entry,
  `const { app, session } = require('electron');\napp.setPath('userData', ${JSON.stringify(isolatedData)});\nglobal.__behaviorBootstrapBlocked = [];\napp.whenReady().then(() => { session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://127.0.0.1:5173/api/*'] }, (details, callback) => { global.__behaviorBootstrapBlocked.push(details.url); callback({ cancel: true }); }); });\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
);

function wav() {
  const rate = 16000;
  const count = Math.round(rate * 1.2);
  const result = Buffer.alloc(44 + count * 2);
  result.write('RIFF');
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write('data', 36);
  result.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    result.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 880) * 0.12 * 32767),
      44 + i * 2,
    );
  return result;
}

let desktop;
let page;
let video;
let deadline;
const report = {
  startedAt: new Date().toISOString(),
  pass: false,
  implementation: compiled
    ? 'compiled dist in actual isolated Electron main/preload at trusted 5173 origin'
    : 'actual isolated Electron development app',
  assetSha256,
  assetBytes: assetBytes.length,
  requiredClips,
  compiledIndexSha256: compiled ? sha(await readFile(path.join(dist, 'index.html'))) : null,
  recording,
  apiFixtures: [],
  servedAssets: [],
  sequence: [],
  errors: [],
  limits: [
    'Real Character settings and task/voice adapters; task completion is an explicitly local API fixture, not a successful provider task.',
    'Continuous voice uses a controlled oscillator stream, local transcription fixture and short local PCM WAV; no physical microphone, live provider, device audibility or spoken interruption claim.',
    'CapturePage/Playwright video record actual Electron content and alpha, not underlying desktop pixels or operating-system compositor presentation.',
    'Bounds/readback prove the current monitor work area; not physical multi-monitor/DPI coverage.',
    'HTML avatar/Z bounds are checked at named checkpoints. Exhaustive animated-mesh camera containment belongs to the separate exported-vertex proof; framebuffer sampling is excluded because non-preserved WebGL buffers are cleared by Chromium.',
    'Collapse/hide intentionally interrupt cosmetic actions; 96px collapsed stills therefore show the real normal pose, while the Character actions run at the actual 72px expanded size.',
  ],
};

try {
  desktop = await electron.launch({
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
      LOCAL_DATA_DIR: isolatedData,
    },
    timeout: 30000,
    recordVideo: recording ? { dir: output, size: { width: 600, height: 800 } } : undefined,
  });
  deadline = setTimeout(() => desktop.process().kill('SIGKILL'), 65000);
  page = await desktop.firstWindow();
  page.setDefaultTimeout(6000);
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  // Native security accepts the trusted origin; keep it and reload after fixture installation.
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-model',
    'sprout',
    { timeout: 15000 },
  );
  video = recording ? page.video() : undefined;
  const context = page.context();
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'true');
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
    const NativeContext = AudioContext;
    const NativeAudio = Audio;
    window.__behaviorProof = {
      tracks: [],
      contexts: [],
      inputs: [],
      playbacks: [],
      done: [],
      modes: [],
      pixelSamples: [],
      active: true,
    };
    const proof = window.__behaviorProof;
    window.Audio = class {
      constructor(src) {
        const audio = new NativeAudio(src);
        proof.playbacks.push(audio);
        return audio;
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const audioContext = new NativeContext();
      const destination = audioContext.createMediaStreamDestination();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0; // Silent until the proof deliberately schedules its one utterance.
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      await audioContext.resume();
      proof.contexts.push(audioContext);
      proof.tracks.push(...destination.stream.getTracks());
      proof.inputs.push({ gain, context: audioContext, stream: destination.stream });
      return destination.stream;
    };
  });
  if (compiled)
    await context.route('http://127.0.0.1:5173/**', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      if (pathname.startsWith('/api/')) return route.continue();
      const filename = path.resolve(dist, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (filename !== dist && !filename.startsWith(`${dist}${path.sep}`))
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
        return await route.fulfill({
          status: 200,
          contentType: mime[path.extname(filename)] ?? 'application/octet-stream',
          body: await readFile(filename),
        });
      } catch {
        return route.fulfill({ status: 404, body: 'Artifact missing' });
      }
    });
  const empty = { folder: null, code: null, browser: null, screen: null };
  const task = (id) => ({
    id,
    status: 'completed',
    goal: 'Local demonstration task',
    message: 'A confirmed local fixture task completed.',
    steps: [],
  });
  let taskCount = 0;
  let transcriptions = 0;
  const pcm = wav();
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    report.apiFixtures.push({ pathname, method: route.request().method() });
    if (pathname === '/api/session') return route.fulfill({ json: { ok: true } });
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true, pythonConfigured: true, editorConfigured: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: true, ttsConfigured: true },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        },
      });
    if (pathname === '/api/computer/state')
      return route.fulfill({ json: { ...empty, task: task('hydrated-before-proof') } });
    if (pathname === '/api/connections')
      return route.fulfill({
        json: {
          editable: false,
          defaults: {
            HF_MODEL_ID: 'local-fixture',
            HF_VISION_MODEL_ID: 'local-fixture',
            ELEVENLABS_VOICE_ID: 'local-fixture',
            APP_MODE: 'sample',
          },
          configured: {},
          reports: {},
        },
      });
    if (pathname === '/api/voice/realtime-token')
      return route.fulfill({ status: 503, json: { error: 'Local oscillator fallback fixture' } });
    if (pathname === '/api/voice/transcribe') {
      transcriptions++;
      return route.fulfill({ json: { text: 'Complete a local demonstration task.' } });
    }
    if (pathname === '/api/voice/speak')
      return route.fulfill({ contentType: 'audio/wav', body: pcm });
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: {
          state: { ...empty, task: task(`fresh-native-fixture-${++taskCount}`) },
          clarification: true,
          summary: 'A confirmed local fixture task completed.',
        },
      });
    // Fail closed. No unknown provider/task route can escape the local fixture boundary.
    return route.fulfill({
      status: 400,
      json: { error: `Unexpected native behavior fixture endpoint: ${pathname}` },
    });
  });
  const inspections = [];
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('response', (response) => {
    if (new URL(response.url()).pathname !== assetUrl) return;
    const inspection = (async () => {
      const bytes = await response.body();
      const served = {
        url: response.url(),
        status: response.status(),
        bytes: bytes.length,
        sha256: sha(bytes),
      };
      report.servedAssets.push(served);
      assert.equal(served.status, 200);
      assert.equal(served.sha256, assetSha256);
      assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
    })();
    void inspection.catch(() => {});
    inspections.push(inspection);
  });
  report.bootstrap = await desktop.evaluate(({ session }) => {
    session.defaultSession.webRequest.onBeforeRequest(null);
    return { existingApiRequestsCancelled: global.__behaviorBootstrapBlocked };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const buddy = page.locator('.buddy');
  const signal = page.locator('.buddy-face .insight-signal');
  const pet = page.locator('.buddy-face');
  const composer = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  const collapse = page.getByRole('button', { name: 'Collapse conversation', exact: true });
  await expect(signal).toHaveAttribute('data-renderer', 'webgl', { timeout: 15000 });
  await expect(signal).toHaveAttribute('data-model', 'sprout');
  await Promise.all(inspections);
  assert.ok(report.servedAssets.length > 0);
  await expect(buddy).toHaveAttribute('data-panel-stage', 'closed');
  await expect(signal).toHaveCSS('width', '96px');
  await expect(signal).not.toHaveAttribute('data-done', 'true');
  await expect(page.locator('.buddy-message.error')).toHaveCount(0);
  report.security = await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const p = win.webContents.getLastWebPreferences();
    win.webContents.setZoomFactor(1);
    win.show();
    win.focus();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      webSecurity: p.webSecurity,
    };
  });
  assert.deepEqual(report.security, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  });
  const native = () =>
    desktop.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        bounds: win.getBounds(),
        contentBounds: win.getContentBounds(),
        workArea: screen.getDisplayMatching(win.getBounds()).workArea,
        scaleFactor: screen.getDisplayMatching(win.getBounds()).scaleFactor,
        visible: win.isVisible(),
        minimized: win.isMinimized(),
        zoomFactor: win.webContents.getZoomFactor(),
      };
    });
  const checkpoint = async (step) => {
    const geometry = await native();
    const { bounds: b, workArea: a } = geometry;
    assert.ok(
      b.x >= a.x &&
        b.y >= a.y &&
        b.x + b.width <= a.x + a.width &&
        b.y + b.height <= a.y + a.height,
      'Actual window must stay inside monitor work area.',
    );
    const html = await signal.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const z = [...element.querySelectorAll('.signal-sleep-zs > span')]
        .filter((e) => Number(getComputedStyle(e).opacity) > 0.05)
        .map((e) => {
          const b = e.getBoundingClientRect();
          return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        });
      return {
        at: performance.now(),
        width: r.width,
        height: r.height,
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        viewport: { width: innerWidth, height: innerHeight },
        mode: element.getAttribute('data-behavior'),
        done: element.getAttribute('data-done'),
        phase: element.getAttribute('data-phase'),
        stage: document.querySelector('.buddy').getAttribute('data-panel-stage'),
        z,
        draft: document.querySelector('#buddy-request')?.value,
      };
    });
    for (const r of [html, ...html.z])
      assert.ok(
        r.left >= 0 &&
          r.top >= 0 &&
          r.right <= html.viewport.width &&
          r.bottom <= html.viewport.height,
        'Avatar/Z HTML bounds must remain inside native content viewport.',
      );
    report.sequence.push({ step, native: geometry, html });
    console.log(`Native behavior: ${step}`);
  };
  const capture = async (name) => {
    const png = await desktop.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(path.join(output, `${name}.png`), Buffer.from(png, 'base64'));
  };
  const settings = async () => {
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('button', { name: 'Settings and connections', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings & connections' })).toBeVisible();
  };
  const character = async (label) => {
    await settings();
    const action = page.getByRole('button', { name: label, exact: true });
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  };
  // Read the actual controller-published HTML state without modifying its render loop.
  await signal.evaluate((element) => {
    const proof = window.__behaviorProof;
    new MutationObserver(() => {
      proof.modes.push({
        at: performance.now(),
        mode: element.getAttribute('data-behavior'),
        phase: element.getAttribute('data-phase'),
      });
      if (element.getAttribute('data-done') === 'true')
        proof.done.push({ at: performance.now(), phase: element.getAttribute('data-phase') });
    }).observe(element, { attributes: true, attributeFilter: ['data-behavior', 'data-done'] });
  });

  await desktop.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const a = screen.getDisplayMatching(win.getBounds()).workArea;
    const b = win.getBounds();
    win.setPosition(a.x + a.width - b.width, a.y + a.height - b.height);
  });
  await checkpoint('96-collapsed-bottom-right');
  await capture('01-collapsed-96-edge');
  await pet.press('Enter');
  await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
  await expect(signal).toHaveCSS('width', '72px');
  const draft = 'Keep this draft while Sprout celebrates, rests and wakes.';
  await composer.fill(draft);
  await checkpoint('72-expanded-native-clamped');
  await capture('02-expanded-72');
  await character('Celebrate');
  await expect(signal).toHaveAttribute('data-behavior', 'joy');
  await page.waitForTimeout(420);
  await checkpoint('joy-real-character-control');
  await capture('03-joy-72');
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  await character('Rest Sprout');
  await expect(signal).toHaveAttribute('data-behavior', 'enter-sleep');
  await expect(signal).toHaveAttribute('data-behavior', 'sleep');
  await expect(signal.locator('.signal-sleep-zs > span')).toHaveCount(3);
  await page.waitForTimeout(1000);
  await checkpoint('lying-down-sleep-with-head-anchored-Zs');
  await capture('04-sleep-72');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pause avatar motion', exact: true }).click();
  await expect(signal.locator('.signal-sleep-zs')).toHaveAttribute('data-moving', 'false');
  await page.waitForTimeout(120);
  const paused = await signal.screenshot();
  await page.waitForTimeout(350);
  assert.ok(
    paused.equals(await signal.screenshot()),
    'Paused sleep and Z pixels must remain identical.',
  );
  await expect(composer).toHaveValue(draft);
  await checkpoint('paused-sleep-static350ms-draft-preserved');
  await capture('05-sleep-paused');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Resume avatar motion', exact: true }).click();
  await character('Wake Sprout');
  await expect(signal).toHaveAttribute('data-behavior', 'wake');
  await expect(signal.locator('.signal-sleep-zs')).toHaveCount(0);
  await page.waitForTimeout(300);
  await capture('06-wake-72');
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  await expect(composer).toHaveValue(draft);

  // Genuine production voice owner, locally recorded oscillator utterance and local TTS.
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  const pauseVoice = page.getByRole('button', { name: 'Pause voice conversation', exact: true });
  await expect(pauseVoice).toHaveAttribute('aria-pressed', 'true');
  await expect(signal).toHaveAttribute('data-phase', 'listening', { timeout: 8000 });
  await expect(composer).toHaveValue(draft);
  await settings();
  await expect(page.getByRole('button', { name: 'Celebrate', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rest Sprout', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const doneBefore = await page.evaluate(() => window.__behaviorProof.done.length);
  report.syntheticUtterance = await page.evaluate(() => {
    const input = window.__behaviorProof.inputs.findLast((candidate) =>
      candidate.stream.getTracks().some((track) => track.readyState === 'live'),
    );
    if (!input) throw new Error('Need the real active recorder stream before the local utterance.');
    const start = input.context.currentTime;
    input.gain.gain.setValueAtTime(0.22, start);
    input.gain.gain.setValueAtTime(0, start + 0.7);
    return { at: performance.now(), durationSeconds: 0.7, amplitude: 0.22 };
  });
  await expect(signal).toHaveAttribute('data-done', 'true', { timeout: 10000 });
  await expect(signal).toHaveAttribute('data-phase', 'speaking');
  await expect(pauseVoice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.buddy-task')).toContainText('Task finished');
  await expect(composer).toHaveValue(draft);
  await checkpoint('fresh-completed-task-Done-with-continuous-voice');
  await capture('07-done-speaking-local-fixture');
  await expect(signal).not.toHaveAttribute('data-done', 'true');
  await expect(signal).toHaveAttribute('data-phase', 'listening', { timeout: 8000 });
  assert.ok((await page.evaluate(() => window.__behaviorProof.done.length)) > doneBefore);
  assert.ok(
    await page.evaluate(() =>
      window.__behaviorProof.playbacks.some((audio) => audio.currentTime > 0.1),
    ),
    'Local PCM must actually advance, not merely set speaking phase.',
  );
  await pauseVoice.click();
  await expect(signal).toHaveAttribute('data-phase', 'idle');
  assert.ok(
    await page.evaluate(
      () =>
        window.__behaviorProof.tracks.length > 0 &&
        window.__behaviorProof.tracks.every((track) => track.readyState === 'ended'),
    ),
    'Pause must end local synthetic input tracks.',
  );
  assert.ok(
    await page.evaluate(() =>
      window.__behaviorProof.playbacks.every((audio) => audio.paused || audio.ended),
    ),
  );
  await composer.fill(draft);

  await desktop.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setPosition(area.x, area.y);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await character('Rest Sprout');
  await expect(signal).toHaveAttribute('data-behavior', 'sleep');
  await expect(signal.locator('.signal-sleep-zs')).toHaveAttribute('data-moving', 'false');
  const reduced = await signal.screenshot();
  await page.waitForTimeout(350);
  assert.ok(
    reduced.equals(await signal.screenshot()),
    'Reduced-motion sleep and Z pixels must be static.',
  );
  await checkpoint('top-left-edge-reduced-motion-authored-static-sleep');
  await capture('08-sleep-reduced');
  await character('Wake Sprout');
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  await collapse.click();
  await expect(buddy).toHaveAttribute('data-panel-stage', 'closed');
  await expect(pet).toBeFocused();
  await expect(signal).toHaveCSS('width', '96px');
  await checkpoint('reduced-collapsed-96');
  await capture('09-reduced-collapsed-96');
  await page.getByRole('button', { name: 'Hide to system tray', exact: true }).click();
  await expect.poll(async () => (await native()).visible).toBe(false);
  report.hidden = await native();
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.show();
    win.focus();
  });
  await expect.poll(async () => (await native()).visible).toBe(true);
  await pet.press('Enter');
  await expect(buddy).toHaveAttribute('data-panel-stage', 'open');
  await expect(composer).toHaveValue(draft);
  await expect(collapse).toBeFocused();
  await expect(signal.locator('.signal-sleep-zs')).toHaveCount(0);
  await checkpoint('show-keyboard-reopen-draft-focus-preserved');
  await capture('10-reopen-after-hide');
  assert.equal(taskCount, 1);
  assert.equal(transcriptions, 1, 'Exactly one deliberately recorded utterance must reach STT.');
  await expect(page.locator('.buddy-message.error')).toHaveCount(0);
  assert.deepEqual(report.errors, []);
  report.browserProof = await page.evaluate(() => ({
    modes: window.__behaviorProof.modes,
    done: window.__behaviorProof.done,
    tracks: window.__behaviorProof.tracks.map((track) => ({
      kind: track.kind,
      readyState: track.readyState,
    })),
    playbacks: window.__behaviorProof.playbacks.map((audio) => ({
      currentTime: audio.currentTime,
      paused: audio.paused,
      ended: audio.ended,
    })),
  }));
  report.pass = true;
  console.log('Native v004 Character/task/voice behavior proof passed.');
} catch (error) {
  report.failure = error.stack ?? error.message;
  throw error;
} finally {
  if (page && !page.isClosed())
    await page
      .evaluate(() => {
        const p = window.__behaviorProof;
        if (p) {
          p.active = false;
          p.contexts.forEach((context) => void context.close());
        }
      })
      .catch(() => {});
  clearTimeout(deadline);
  if (desktop) {
    let closeDeadline;
    await Promise.race([
      desktop.close(),
      new Promise((resolve) => {
        closeDeadline = setTimeout(() => {
          report.forcedTeardown = true;
          report.pass = false;
          desktop.process().kill('SIGKILL');
          resolve();
        }, 5000);
      }),
    ]).catch((error) => {
      report.teardownError = error.message;
      report.pass = false;
    });
    clearTimeout(closeDeadline);
  }
  await unlink(entry).catch(() => {});
  if (video) {
    const source = await video.path();
    const filename = path.join(output, 'native-character-task-voice.webm');
    await rename(source, filename);
    report.video = filename;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      pass: report.pass,
      output,
      assetSha256,
      sequence: report.sequence.map((item) => item.step),
      failure: report.failure,
    }),
  );
}
