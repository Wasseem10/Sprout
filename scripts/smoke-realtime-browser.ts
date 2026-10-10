// Live SDK/worklet check on the production UI with a synthetic microphone.
// Computer actions are intercepted: no code, browser navigation or desktop action runs.
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildApp } from '../server/app.js';
import { config } from '../server/config.js';

const wav = path.resolve('.local/voice-command-test.wav');
await readFile(wav);
const cfg = { ...config(), localDir: path.resolve('.local/realtime-browser-check') };
const app = await buildApp(cfg);
let workletServed = false;
app.addHook('onResponse', async (request, reply) => {
  if (request.url === '/scribeAudioProcessor.js' && reply.statusCode === 200) workletServed = true;
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  cfg.origins.push(origin);
  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  const page = await browser.newPage({ permissions: ['microphone'] });
  const requests: string[] = [];
  let sockets = 0,
    workletLoaded = false,
    batchFallbackCalls = 0;
  const errors: string[] = [];
  page.on('websocket', (socket) => {
    if (socket.url().startsWith('wss://api.elevenlabs.io/')) sockets++;
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/scribeAudioProcessor.js' && response.ok())
      workletLoaded = true;
  });
  page.on('pageerror', (error) =>
    errors.push(error.message.replace(/https?:\/\/\S+|wss?:\/\/\S+/g, '[URL]')),
  );
  await page.route('**/api/computer/request', async (route) => {
    requests.push(route.request().postDataJSON().request);
    await route.fulfill({
      json: {
        summary: 'I heard you. The voice test is complete.',
        state: { folder: null, code: null, browser: null, screen: null },
      },
    });
  });
  await page.route('**/api/computer/demo-folder', (route) =>
    route.fulfill({
      json: {
        folder: { id: 'test-folder', name: 'Synthetic test' },
        code: null,
        browser: null,
        screen: null,
      },
    }),
  );
  await page.route('**/api/voice/transcribe', async (route) => {
    batchFallbackCalls++;
    await route.fulfill({
      status: 503,
      json: { error: 'This smoke requires realtime, not batch fallback.' },
    });
  });
  await page.goto(origin + '/?desktop=buddy');
  const play = page.getByRole('button', { name: 'Start voice conversation', exact: true });
  await play.waitFor();
  const speech = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/voice/speak' && response.ok(),
    { timeout: 30000 },
  );
  await play.click();
  await speech;
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
  assert.equal(batchFallbackCalls, 0, 'Realtime must not fall back');
  // AudioWorklet fetches do not always emit Playwright page response events.
  assert.ok(workletLoaded || workletServed, 'Same-origin production worklet must load under CSP');
  assert.equal(sockets, 1, 'One continuous transcription socket');
  assert.ok(
    requests.some((request) => /squares/i.test(request)),
    'Real streaming transcript must reach the task handler',
  );
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    productionUi: true,
    sameOriginWorklet: workletLoaded || workletServed,
    realtimeSockets: sockets,
    batchFallbackCalls,
    requests,
    javascriptErrors: errors,
    speechReply: 'Real ElevenLabs Flash response returned successfully',
    computerActions: 'Intercepted with harmless response; none executed',
    microphone: 'Chromium fake microphone using a synthetic WAV; physical microphone not tested',
    speakers: 'Headless playback; physical speakers not tested',
  };
  await writeFile(
    'artifacts/realtime-browser-verification.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await app.close();
}
