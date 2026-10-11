// An actual isolated Electron buddy with animated Sprout and voice-owned audio.
// Input is an oscillator; all speech/task endpoints return local fixtures.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  proofAssetFile,
  proofCanonicalFile,
  proofAssetUrl,
  proofOutputPath,
  proofLocalDirectory,
} from './buddy-proof-options.mjs';

const recordVideo = process.argv.includes('--record');
const nativeVisibilityProof = process.argv.includes('--native-visibility');
const artifacts = path.resolve(
  proofOutputPath(
    nativeVisibilityProof
      ? 'artifacts/buddy-voice-native-visibility'
      : 'artifacts/buddy-voice-native-final',
  ),
);
const assetBytes = await readFile(path.join('public/buddy', proofAssetFile));
const assetSha256 = createHash('sha256').update(assetBytes).digest('hex');
assert.equal(
  assetSha256,
  createHash('sha256')
    .update(await readFile(path.join('design/buddy/sprout', proofCanonicalFile)))
    .digest('hex'),
  'Runtime and canonical Sprout exports must match.',
);
const local = path.resolve(proofLocalDirectory);
await mkdir(local, { recursive: true });
await mkdir(artifacts, { recursive: true });
const isolatedData = await mkdtemp(path.join(tmpdir(), 'insightos-voice-smoke-'));
const entry = path.join(local, `voice-smoke-main-${process.pid}.cjs`);
await writeFile(
  entry,
  `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(isolatedData)});\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
);

function localWav() {
  const rate = 16000;
  const count = rate * 4;
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 880) * 0.15 * 32767),
      44 + i * 2,
    );
  return buffer;
}

let desktop;
let video;
let deadline;
let report = {
  checkedAt: new Date().toISOString(),
  pass: false,
  assetSha256,
  assetBytes: assetBytes.length,
  recordingActive: recordVideo,
  nativeVisibilityProof,
  implementation:
    'actual useVoice, MediaRecorder, HTMLAudio, Web Audio meter and final animated Sprout in isolated Electron --dev',
  input: 'local oscillator, no physical microphone capture',
  output: 'local PCM WAV fixtures, no ElevenLabs provider calls; device audibility not asserted',
  scope:
    'All API endpoints are local fixtures. Native layout and production voice/renderer modules are unchanged; the read-only presentation ref is exposed only in this test window. Recording is not a frame-performance measurement.',
  recordingScope:
    'Video-only Playwright capture. Actual synthetic PCM playback, interruption and cleanup are asserted by the audio elements, tracks and meter; this is not recorded live speech.',
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
    recordVideo: recordVideo ? { dir: artifacts, size: { width: 1280, height: 900 } } : undefined,
  });
  deadline = setTimeout(() => {
    console.error('Native synthetic voice proof exceeded its 60-second harness deadline');
    desktop.process().kill();
  }, 60000);
  const page = await desktop.firstWindow();
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', { waitUntil: 'domcontentloaded' });
  video = recordVideo ? page.video() : undefined;
  const context = page.context();
  await context.addInitScript((inspectVisibility) => {
    localStorage.setItem('insightos.buddySpeech', 'true');
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
    const NativeContext = AudioContext;
    const NativeAudio = Audio;
    window.__voiceProof = {
      gains: [],
      tracks: [],
      playbacks: [],
      input: [],
      samples: [],
      recorders: [],
    };
    const proof = window.__voiceProof;
    if (inspectVisibility) {
      // Retain read-only handles to the real recorder; capture behavior is unchanged.
      const NativeRecorder = MediaRecorder;
      window.MediaRecorder = class extends NativeRecorder {
        constructor(...args) {
          super(...args);
          proof.recorders.push(this);
        }
      };
    }
    window.Audio = class {
      constructor(src) {
        const audio = new NativeAudio(src);
        proof.playbacks.push(audio);
        return audio;
      }
    };
    window.AudioContext = class extends NativeContext {
      createAnalyser() {
        const analyser = super.createAnalyser();
        const read = analyser.getByteTimeDomainData.bind(analyser);
        analyser.getByteTimeDomainData = (data) => {
          read(data);
          let sum = 0;
          for (const value of data) sum += ((value - 128) / 128) ** 2;
          proof.input.push({ at: performance.now(), rms: Math.sqrt(sum / data.length) });
        };
        return analyser;
      }
    };
    // This replaces microphone capture before the conversation starts.
    navigator.mediaDevices.getUserMedia = async () => {
      const audioContext = new NativeContext();
      const destination = audioContext.createMediaStreamDestination();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain).connect(destination);
      proof.gains.push(gain);
      proof.tracks.push(...destination.stream.getTracks());
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      if (proof.gains.length === 1) {
        gain.gain.setValueAtTime(0.25, audioContext.currentTime + 0.2);
        gain.gain.setValueAtTime(0, audioContext.currentTime + 0.9);
      }
      oscillator.start();
      await audioContext.resume();
      return destination.stream;
    };
  }, nativeVisibilityProof);
  // Expose only the existing read-only presentation ref in this test window.
  await context.route('**/src/audioPresentation.ts*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('export function createAudioPresentation('));
    const body =
      source.replace(
        'export function createAudioPresentation(',
        'function proofCreateAudioPresentation(',
      ) +
      '\nexport function createAudioPresentation(...args) { const owner = proofCreateAudioPresentation(...args); window.__voicePresentation = owner.ref; return owner; }\n';
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  const empty = { folder: null, code: null, browser: null, screen: null };
  const requests = [];
  const computerRequests = [];
  let transcriptions = 0;
  let speechRequests = 0;
  const spokenTexts = [];
  const wav = localWav();
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') requests.push(pathname);
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
          },
        },
      });
    if (pathname === '/api/voice/realtime-token')
      return route.fulfill({ status: 503, json: { error: 'Synthetic recorded voice proof' } });
    if (pathname === '/api/voice/transcribe')
      return route.fulfill({
        json: { text: ++transcriptions === 1 ? 'First synthetic turn' : 'Second synthetic turn' },
      });
    if (pathname === '/api/voice/speak') {
      speechRequests++;
      spokenTexts.push(route.request().postDataJSON().text);
      await new Promise((resolve) => setTimeout(resolve, 250));
      return route.fulfill({ body: wav, contentType: 'audio/wav' });
    }
    if (pathname === '/api/computer/request') {
      computerRequests.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          state: empty,
          summary: 'Local animated voice proof. You can interrupt this reply.',
        },
      });
    }
    return route.fulfill({ json: empty });
  });
  const errors = [];
  const servedAssets = [];
  const assetInspections = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (new URL(response.url()).pathname !== proofAssetUrl) return;
    const inspection = (async () => {
      const bytes = await response.body();
      const served = {
        status: response.status(),
        bytes: bytes.length,
        header: bytes.subarray(0, 4).toString('ascii'),
        version: bytes.readUInt32LE(4),
        declaredBytes: bytes.readUInt32LE(8),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      servedAssets.push(served);
      assert.equal(served.status, 200);
      assert.equal(served.header, 'glTF');
      assert.equal(served.version, 2);
      assert.equal(served.declaredBytes, assetBytes.length);
      assert.equal(served.sha256, assetSha256);
    })();
    void inspection.catch(() => {});
    assetInspections.push(inspection);
  });
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await desktop.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setZoomFactor(1);
    window.show();
    window.focus();
  });
  await expect(page.locator('.insight-signal').first()).toHaveAttribute('data-renderer', 'webgl', {
    timeout: 15000,
  });
  await expect(page.locator('.insight-signal').first()).toHaveAttribute('data-model', 'sprout');
  await Promise.all(assetInspections);
  assert.ok(servedAssets.length > 0, 'The exact final GLB must be observed on this proof load.');
  const sequence = [];
  const capture = async (name) => {
    const encoded = await desktop.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(encoded, 'base64'));
  };
  const checkpoint = async (step) => {
    sequence.push(
      await page.evaluate(
        (step) => ({
          step,
          at: performance.now(),
          panelStage: document.querySelector('.buddy')?.getAttribute('data-panel-stage'),
          draft: document.querySelector('#buddy-request')?.value,
          sample: window.__voicePresentation ? { ...window.__voicePresentation.current } : null,
        }),
        step,
      ),
    );
  };
  await page.evaluate(() => {
    window.__voiceProof.timer = setInterval(() => {
      const sample = window.__voicePresentation?.current;
      if (sample) window.__voiceProof.samples.push({ at: performance.now(), ...sample });
    }, 20);
  });
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await checkpoint('collapsed-final-sprout');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Expand buddy\./ }).click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  const composer = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  const collapse = page.getByRole('button', { name: 'Collapse conversation', exact: true });
  const draft = 'Keep this unsent draft while we talk.';
  await composer.pressSequentially(draft, { delay: 30 });
  await expect(composer).toHaveValue(draft);
  await checkpoint('open-and-type-unsent-draft');
  await capture('open-draft');
  await page.keyboard.press('Control+Shift+Space');
  await expect
    .poll(() => spokenTexts.filter((text) => text.includes('Local animated voice proof')).length, {
      timeout: 12000,
    })
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__voicePresentation.current.outputLevel), {
      timeout: 12000,
    })
    .toBeGreaterThan(0.1);
  const speaking = await page.evaluate(() => ({ ...window.__voicePresentation.current }));
  assert.equal(speaking.outputPlaying, true);
  await expect(composer).toHaveValue(draft);
  await checkpoint('first-measured-reply-draft-preserved');
  await capture('first-reply');
  const firstReplyIndex = await page.evaluate(() =>
    window.__voiceProof.playbacks.findLastIndex(
      (audio) => !audio.paused && !audio.ended && audio.readyState >= 2,
    ),
  );
  assert.ok(firstReplyIndex >= 0, 'The intended first reply has an actual playing element.');
  let interrupted;
  let secondMeasuredOutput;
  let visibilityCheck;
  await expect.poll(() => page.evaluate(() => window.__voiceProof.gains.length)).toBe(2);
  if (nativeVisibilityProof) {
    const inspect = async () =>
      page.evaluate(async (index) => {
        const audio = window.__voiceProof.playbacks[index];
        return {
          at: performance.now(),
          native: await window.insightos.desktopVisibility(),
          documentHidden: document.hidden,
          phase: document.querySelector('.insight-signal')?.getAttribute('data-phase'),
          sample: { ...window.__voicePresentation.current },
          playback: {
            index,
            paused: audio.paused,
            ended: audio.ended,
            currentTime: audio.currentTime,
            duration: audio.duration,
          },
          liveTrackIds: window.__voiceProof.tracks
            .filter((track) => track.readyState === 'live')
            .map((track) => track.id),
          recorderStates: window.__voiceProof.recorders.map((recorder) => recorder.state),
          draft: document.querySelector('#buddy-request')?.value,
        };
      }, firstReplyIndex);
    const before = await inspect();
    assert.equal(before.native.visible, true);
    assert.equal(before.phase, 'speaking');
    assert.equal(before.playback.paused, false);
    assert.ok(before.liveTrackIds.length > 0, 'Capture must be live before native hide.');
    assert.ok(before.recorderStates.includes('recording'));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    await expect
      .poll(() => page.evaluate(async () => (await window.insightos.desktopVisibility()).visible))
      .toBe(false);
    await checkpoint('native-hidden-with-active-voice');
    await page.waitForTimeout(650);
    const hidden = await inspect();
    assert.equal(hidden.native.visible, false);
    assert.ok(hidden.native.revision > before.native.revision);
    assert.equal(hidden.playback.paused, false);
    assert.equal(hidden.playback.ended, false);
    assert.ok(
      hidden.playback.currentTime - before.playback.currentTime > 0.35,
      'Actual HTMLAudio time must advance while the native window is hidden.',
    );
    assert.deepEqual(hidden.liveTrackIds, before.liveTrackIds);
    assert.deepEqual(hidden.recorderStates, before.recorderStates);
    assert.equal(hidden.sample.playbackGeneration, before.sample.playbackGeneration);
    assert.equal(hidden.sample.outputPlaying, true);
    assert.ok(hidden.sample.outputLevel > 0.1);
    assert.ok(
      hidden.sample.outputSampledAt > before.sample.outputSampledAt,
      'Voice-owned output metering must continue while visuals are hidden.',
    );
    assert.equal(hidden.draft, draft);
    await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.show();
      window.focus();
    });
    await expect
      .poll(() => page.evaluate(async () => (await window.insightos.desktopVisibility()).visible))
      .toBe(true);
    await expect(page.locator('.insight-signal').first()).toHaveAttribute('data-phase', 'speaking');
    await expect(page.locator('.insight-signal').first()).toHaveAttribute('data-renderer', 'webgl');
    await page.waitForTimeout(250);
    const restored = await inspect();
    assert.ok(restored.native.revision > hidden.native.revision);
    assert.equal(restored.phase, 'speaking');
    assert.equal(restored.playback.paused, false);
    assert.ok(restored.playback.currentTime > hidden.playback.currentTime);
    assert.equal(restored.sample.playbackGeneration, before.sample.playbackGeneration);
    assert.equal(restored.sample.outputPlaying, true);
    assert.deepEqual(restored.liveTrackIds, before.liveTrackIds);
    assert.deepEqual(restored.recorderStates, before.recorderStates);
    await expect(composer).toHaveValue(draft);
    visibilityCheck = {
      before,
      hidden,
      restored,
      hiddenPlaybackAdvanceSeconds: hidden.playback.currentTime - before.playback.currentTime,
      scope:
        'Actual isolated BrowserWindow hide/show with production visibility IPC/helper and animated renderer. Local oscillator capture and PCM reply use real MediaRecorder/HTMLAudio/Web Audio; no physical microphone/provider or OS-presentation proof.',
    };
    await checkpoint('native-show-restored-current-speaking-phase');
    await capture('visibility-restored-speaking');
  } else {
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const gain = window.__voiceProof.gains[1];
      gain.gain.setValueAtTime(0.25, gain.context.currentTime);
      gain.gain.setValueAtTime(0, gain.context.currentTime + 0.8);
    });
    await expect
      .poll(
        () =>
          page.evaluate((index) => window.__voiceProof.playbacks[index].paused, firstReplyIndex),
        { timeout: 5000 },
      )
      .toBe(true);
    interrupted = await page.evaluate((index) => {
      const audio = window.__voiceProof.playbacks[index];
      return {
        paused: audio.paused,
        ended: audio.ended,
        currentTime: audio.currentTime,
        duration: audio.duration,
      };
    }, firstReplyIndex);
    assert.equal(
      interrupted.ended,
      false,
      'The intended reply was interrupted before natural end.',
    );
    await checkpoint('actual-playing-reply-interrupted');
    await expect.poll(() => transcriptions, { timeout: 12000 }).toBe(2);
    // A slow task may produce its normal acknowledgment in addition to both replies.
    await expect
      .poll(
        () => spokenTexts.filter((text) => text.includes('Local animated voice proof')).length,
        {
          timeout: 12000,
        },
      )
      .toBe(2);
    await expect
      .poll(() => page.evaluate(() => window.__voicePresentation.current.outputLevel), {
        timeout: 12000,
      })
      .toBeGreaterThan(0.1);
    assert.ok(
      (await page.evaluate(() => window.__voicePresentation.current.playbackGeneration)) >
        speaking.playbackGeneration,
    );
    await expect(composer).toHaveValue(draft);
    secondMeasuredOutput = await page.evaluate(() => ({
      ...window.__voicePresentation.current,
    }));
    assert.equal(secondMeasuredOutput.outputPlaying, true);
    await checkpoint('second-measured-output-draft-preserved');
    await capture('second-reply');
    await collapse.click();
    await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
    // The collapsed panel remains mounted but is deliberately excluded from the AX tree.
    await expect(page.locator('#buddy-request')).toHaveValue(draft);
    await checkpoint('collapse-with-original-unsent-draft');
    await capture('collapsed-during-conversation');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^Expand buddy\./ }).click();
    await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
    await expect(composer).toHaveValue(draft);
    await expect(collapse).toBeFocused();
    await checkpoint('reopen-with-original-unsent-draft');
    await capture('reopened-draft');
    await page.waitForTimeout(600);
  }
  assert.equal(
    await page.evaluate(() => window.__voicePresentation.current.outputPlaying),
    true,
    'Explicit Pause must stop the newly playing reply, not only an idle conversation.',
  );
  // Escape belongs to the panel's collapse control; pause explicitly owns voice cleanup.
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
  const stopped = await page.evaluate(() => {
    clearInterval(window.__voiceProof.timer);
    return {
      sample: { ...window.__voicePresentation.current },
      tracksEnded: window.__voiceProof.tracks.every((track) => track.readyState === 'ended'),
      audioPaused: window.__voiceProof.playbacks.every((audio) => audio.paused),
      inputReads: window.__voiceProof.input.length,
      samples: window.__voiceProof.samples,
      renderer: document.querySelector('.insight-signal')?.dataset.renderer,
      motionReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      documentFits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  assert.equal(stopped.tracksEnded, true);
  assert.equal(stopped.audioPaused, true);
  assert.equal(stopped.motionReduced, false);
  assert.equal(stopped.documentFits, true);
  assert.equal(stopped.sample.outputPlaying, false);
  assert.equal(stopped.sample.outputLevel, null);
  assert.equal(stopped.sample.inputLevel, null);
  await expect(composer).toHaveValue(draft);
  if (nativeVisibilityProof)
    assert.ok(stopped.sample.playbackGeneration > speaking.playbackGeneration);
  else
    assert.ok(
      computerRequests.every((request) => !JSON.stringify(request).includes(draft)),
      'The typed draft must never be submitted as a task.',
    );
  assert.ok(
    stopped.samples.some(
      (sample) => sample.playbackGeneration > speaking.playbackGeneration && !sample.outputPlaying,
    ),
  );
  assert.deepEqual(errors, []);
  await checkpoint('explicit-pause-cleared-capture-and-playback');
  await capture('cleanup');
  await page.waitForTimeout(700);
  report = {
    ...report,
    checkedAt: new Date().toISOString(),
    pass: true,
    servedAssets,
    sequence,
    draft,
    draftPreservedAcrossVoiceAndPanel: nativeVisibilityProof ? undefined : true,
    draftPreservedAcrossHideShow: nativeVisibilityProof ? true : undefined,
    visibilityCheck,
    firstMeasuredOutput: speaking,
    secondMeasuredOutput,
    interruption: nativeVisibilityProof
      ? undefined
      : 'first actual HTMLAudio paused; second recorded utterance and measured output succeeded',
    interruptedElement: nativeVisibilityProof
      ? undefined
      : { index: firstReplyIndex, ...interrupted },
    cleanup: 'explicit Pause voice conversation control stopped all capture/playback',
    stopped: { ...stopped, samples: undefined },
    transcriptions,
    speechRequests,
    spokenTexts,
    localRoutes: requests,
    interceptedComputerRequests: computerRequests,
    pageErrors: errors,
  };
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await desktop?.close().catch(() => {});
  clearTimeout(deadline);
  await unlink(entry).catch(() => {});
  if (video) {
    const finalPath = path.join(
      artifacts,
      nativeVisibilityProof
        ? 'synthetic-voice-native-visibility.webm'
        : 'synthetic-voice-interrupt-panel.webm',
    );
    await rename(await video.path(), finalPath);
    report.video = finalPath;
  }
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
