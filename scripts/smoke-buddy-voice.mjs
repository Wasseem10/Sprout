// An actual isolated Electron buddy with animated Sprout and voice-owned audio.
// Input is an oscillator; all speech/task endpoints return local fixtures.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const artifacts = path.resolve('artifacts');
const local = path.resolve('.local');
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
  });
  const page = await desktop.firstWindow();
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', { waitUntil: 'domcontentloaded' });
  const context = page.context();
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'true');
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
    const NativeContext = AudioContext;
    const NativeAudio = Audio;
    window.__voiceProof = { gains: [], tracks: [], playbacks: [], input: [], samples: [] };
    const proof = window.__voiceProof;
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
  });
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
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: {
          state: empty,
          summary: 'Local animated voice proof. You can interrupt this reply.',
        },
      });
    return route.fulfill({ json: empty });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  await page.evaluate(() => {
    window.__voiceProof.timer = setInterval(() => {
      const sample = window.__voicePresentation?.current;
      if (sample) window.__voiceProof.samples.push({ at: performance.now(), ...sample });
    }, 20);
  });
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
  const firstReplyIndex = await page.evaluate(() =>
    window.__voiceProof.playbacks.findLastIndex(
      (audio) => !audio.paused && !audio.ended && audio.readyState >= 2,
    ),
  );
  assert.ok(firstReplyIndex >= 0, 'The intended first reply has an actual playing element.');
  await expect.poll(() => page.evaluate(() => window.__voiceProof.gains.length)).toBe(2);
  await page.evaluate(() => {
    const gain = window.__voiceProof.gains[1];
    gain.gain.setValueAtTime(0.25, gain.context.currentTime);
    gain.gain.setValueAtTime(0, gain.context.currentTime + 0.8);
  });
  await expect
    .poll(
      () => page.evaluate((index) => window.__voiceProof.playbacks[index].paused, firstReplyIndex),
      { timeout: 5000 },
    )
    .toBe(true);
  const interrupted = await page.evaluate((index) => {
    const audio = window.__voiceProof.playbacks[index];
    return {
      paused: audio.paused,
      ended: audio.ended,
      currentTime: audio.currentTime,
      duration: audio.duration,
    };
  }, firstReplyIndex);
  assert.equal(interrupted.ended, false, 'The intended reply was interrupted before natural end.');
  await expect.poll(() => transcriptions, { timeout: 12000 }).toBe(2);
  // A slow task may produce its normal acknowledgment in addition to both replies.
  await expect
    .poll(() => spokenTexts.filter((text) => text.includes('Local animated voice proof')).length, {
      timeout: 12000,
    })
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
  assert.ok(
    stopped.samples.some(
      (sample) => sample.playbackGeneration > speaking.playbackGeneration && !sample.outputPlaying,
    ),
  );
  assert.deepEqual(errors, []);
  const encoded = await desktop.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  await writeFile(
    path.join(artifacts, 'buddy-voice-native-synthetic.png'),
    Buffer.from(encoded, 'base64'),
  );
  const report = {
    checkedAt: new Date().toISOString(),
    implementation:
      'actual useVoice, MediaRecorder, HTMLAudio, Web Audio meter and animated Sprout in isolated Electron --dev',
    input: 'local oscillator, no physical microphone capture',
    output: 'local PCM WAV fixtures, no ElevenLabs provider calls; device audibility not asserted',
    firstMeasuredOutput: speaking,
    interruption:
      'first actual HTMLAudio paused; second recorded utterance and measured output succeeded',
    interruptedElement: { index: firstReplyIndex, ...interrupted },
    cleanup: 'explicit Pause voice conversation control stopped all capture/playback',
    stopped: { ...stopped, samples: undefined },
    transcriptions,
    speechRequests,
    spokenTexts,
    localRoutes: requests,
    pageErrors: errors,
  };
  await writeFile(
    path.join(artifacts, 'buddy-voice-native-verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await desktop?.close().catch(() => {});
  await unlink(entry).catch(() => {});
}
