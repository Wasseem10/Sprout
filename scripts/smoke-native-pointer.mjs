// Opens an isolated Electron instance and a synthetic local button. This
// exercises the real capture token, DPI coordinate mapping and Win32 click
// without touching another application or website.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { locateAccessibleTarget } = require('../electron/native-pointer.cjs');

if (process.platform !== 'win32') throw new Error('Native pointer smoke requires Windows.');
const local = path.resolve('.local');
const liveVision = process.argv.includes('--live-vision');
await mkdir(local, { recursive: true });
const isolatedData = await mkdtemp(path.join(tmpdir(), 'insightos-pointer-smoke-'));
const entry = path.join(local, 'pointer-smoke-main.cjs');
await writeFile(
  entry,
  `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(isolatedData)});\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
);
const desktop = await electron.launch({ args: [entry, '--dev'], timeout: 30000 });
try {
  const buddy = await desktop.firstWindow();
  await expect(buddy.getByRole('region', { name: 'InsightOS desktop buddy' })).toBeVisible();
  const fixture = await desktop.evaluate(async ({ BrowserWindow, screen }) => {
    const display = screen.getPrimaryDisplay();
    const x = Math.round(display.bounds.x + display.bounds.width * 0.28);
    const y = Math.round(display.bounds.y + display.bounds.height * 0.25);
    const window = new BrowserWindow({
      width: 420,
      height: 260,
      x,
      y,
      frame: false,
      alwaysOnTop: true,
      backgroundColor: '#fff',
      title: 'Pointer smoke fixture',
    });
    await window.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          '<html><body style="margin:0;height:1800px;background:#dce9ff"><button style="position:absolute;left:130px;top:90px;width:160px;height:80px;font-size:20px" onclick="window.__clicked=true">Demo link</button><div style="position:absolute;top:1500px">Scroll destination</div><script>window.__clicked=false</script></body></html>',
        ),
    );
    window.show();
    window.focus();
    const center = { x: x + 210, y: y + 130 };
    return {
      normalizedX: (center.x - display.bounds.x) / display.bounds.width,
      normalizedY: (center.y - display.bounds.y) / display.bounds.height,
      buttonBounds: {
        left: (x + 130 - display.bounds.x) / display.bounds.width,
        right: (x + 290 - display.bounds.x) / display.bounds.width,
        top: (y + 90 - display.bounds.y) / display.bounds.height,
        bottom: (y + 170 - display.bounds.y) / display.bounds.height,
      },
      physical: screen.dipToScreenPoint(center),
    };
  });
  const capture = await buddy.evaluate(() => window.insightos.captureCurrentScreen());
  assert.match(capture.image, /^data:image\/png;base64,/);
  assert.ok(capture.captureId);
  const imageBytes = Buffer.from(capture.image.split(',')[1], 'base64');
  const imageWidth = imageBytes.readUInt32BE(16);
  const imageHeight = imageBytes.readUInt32BE(20);
  if (process.env.INSIGHTOS_VISION_DEBUG === '1') {
    await writeFile(path.join(local, 'pointer-smoke-capture.png'), imageBytes);
    const accessible = await locateAccessibleTarget('Demo link');
    console.log(
      JSON.stringify({
        screenshotSize: { width: imageWidth, height: imageHeight },
        expectedButtonPixels: {
          left: Math.round(fixture.buttonBounds.left * imageWidth),
          right: Math.round(fixture.buttonBounds.right * imageWidth),
          top: Math.round(fixture.buttonBounds.top * imageHeight),
          bottom: Math.round(fixture.buttonBounds.bottom * imageHeight),
        },
        accessibleTarget: accessible,
      }),
    );
  }
  const { config } = await import('../dist-server/server/config.js');
  const { ComputerController } = await import('../dist-server/server/computer/controller.js');
  const cfg = { ...config(), ...(liveVision ? {} : { hfToken: 'synthetic-test-token' }) };
  if (!cfg.hfToken) throw new Error('HF_TOKEN is required for --live-vision.');
  const controller = new ComputerController(cfg);
  const originalFetch = globalThis.fetch;
  let pointer;
  try {
    await controller.init();
    await controller.selectScreen(capture.name, capture.image);
    if (!liveVision)
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    found: true,
                    x: fixture.normalizedX * 1000,
                    y: fixture.normalizedY * 1000,
                    observedText: 'Demo link',
                    context: 'desktop',
                    actionType: 'navigation',
                    confidence: 0.99,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
    const located = await controller.action(
      { tool: 'locateScreenTarget', target: 'Demo link' },
      new AbortController().signal,
    );
    assert.ok(located.pointer, 'The vision model did not confidently find Demo link.');
    pointer = located.pointer;
    assert.ok(
      pointer.x >= fixture.buttonBounds.left &&
        pointer.x <= fixture.buttonBounds.right &&
        pointer.y >= fixture.buttonBounds.top &&
        pointer.y <= fixture.buttonBounds.bottom,
      `The model point (${pointer.x.toFixed(3)}, ${pointer.y.toFixed(3)}) missed the synthetic button.`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await controller.close();
  }
  await assert.rejects(
    buddy.evaluate(
      ({ id, pointer }) =>
        window.insightos.clickCapturedTarget(
          id,
          pointer.x,
          pointer.y,
          'Demo menu',
          pointer.observedText,
          pointer.context,
          pointer.authorization,
        ),
      { id: capture.captureId, pointer },
    ),
    /does not match the model result/,
  );
  const result = await buddy.evaluate(
    ({ id, pointer }) =>
      window.insightos.clickCapturedTarget(
        id,
        pointer.x,
        pointer.y,
        pointer.target,
        pointer.observedText,
        pointer.context,
        pointer.authorization,
      ),
    { id: capture.captureId, pointer },
  );
  assert.equal(result.clicked, true);
  await expect
    .poll(() =>
      desktop.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(
          (candidate) => candidate.getTitle() === 'Pointer smoke fixture',
        );
        return window?.webContents.executeJavaScript('window.__clicked');
      }),
    )
    .toBe(true);
  await assert.rejects(
    buddy.evaluate(
      ({ id, pointer }) =>
        window.insightos.clickCapturedTarget(
          id,
          pointer.x,
          pointer.y,
          pointer.target,
          pointer.observedText,
          pointer.context,
          pointer.authorization,
        ),
      { id: capture.captureId, pointer },
    ),
    /capture changed/,
  );
  const secondCapture = await buddy.evaluate(() => window.insightos.captureCurrentScreen());
  await assert.rejects(
    buddy.evaluate(
      ({ id, pointer }) =>
        window.insightos.clickCapturedTarget(
          id,
          pointer.x,
          pointer.y,
          pointer.target,
          pointer.observedText,
          pointer.context,
          pointer.authorization,
        ),
      { id: secondCapture.captureId, pointer },
    ),
    /already used/,
  );
  await desktop.evaluate(({ BrowserWindow, screen }) => {
    const display = screen.getPrimaryDisplay();
    const fixture = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.getTitle() === 'Pointer smoke fixture',
    );
    fixture.setBounds({
      x: Math.round(display.bounds.x + display.bounds.width / 2 - 210),
      y: Math.round(display.bounds.y + display.bounds.height * 0.6 - 130),
      width: 420,
      height: 260,
    });
    fixture.focus();
  });
  await buddy.evaluate(() => window.insightos.scrollCurrentScreen('down'));
  await expect
    .poll(() =>
      desktop.evaluate(({ BrowserWindow }) => {
        const fixture = BrowserWindow.getAllWindows().find(
          (candidate) => candidate.getTitle() === 'Pointer smoke fixture',
        );
        return fixture?.webContents.executeJavaScript('window.scrollY');
      }),
    )
    .toBeGreaterThan(0);
  console.log(
    JSON.stringify({
      nativeClick: 'passed on synthetic local button',
      visionLocator: liveVision ? 'passed using configured Hugging Face model' : 'not requested',
      nativeScroll: 'passed on synthetic local page',
      oneShotCapture: 'passed',
      signedPointerReplay: 'blocked',
      forgedPointer: 'blocked',
      physicalTarget: fixture.physical,
      arbitraryUserPageClicked: false,
    }),
  );
} finally {
  await desktop.close();
  await unlink(entry).catch(() => {});
}
