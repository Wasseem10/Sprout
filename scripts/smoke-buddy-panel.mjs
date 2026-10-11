// Real Electron geometry and focus proof. Conversation responses are local fixtures;
// the native IPC handler, preload bridge, window resizing and renderer are unchanged.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  proofAssetFile,
  proofAssetUrl,
  proofOutputPath,
  proofLocalDirectory,
} from './buddy-proof-options.mjs';

const local = path.resolve(proofLocalDirectory);
const artifacts = path.resolve(proofOutputPath('artifacts'));
const assetSha256 = createHash('sha256')
  .update(await readFile(path.join('public/buddy', proofAssetFile)))
  .digest('hex');
await mkdir(local, { recursive: true });
await mkdir(artifacts, { recursive: true });
const isolatedData = await mkdtemp(path.join(tmpdir(), 'insightos-panel-smoke-'));
const entry = path.join(local, `panel-smoke-main-${process.pid}.cjs`);
await writeFile(
  entry,
  `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(isolatedData)});\nrequire(${JSON.stringify(path.resolve('electron/main.cjs'))});\n`,
);

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
  await page.waitForURL('http://127.0.0.1:5173/?desktop=buddy', {
    waitUntil: 'domcontentloaded',
  });
  const context = page.context();
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
  });
  const mutationRequests = [];
  const empty = { folder: null, code: null, browser: null, screen: null };
  await context.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') mutationRequests.push(pathname);
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true, pythonConfigured: true, editorConfigured: true },
          integrations: {
            huggingFace: { configured: true, model: 'local-fixture' },
            elevenLabs: { configured: true, ttsConfigured: true },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        },
      });
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: { state: empty, summary: 'A local native panel test response.\n'.repeat(28) },
      });
    if (pathname === '/api/computer/state') return route.fulfill({ json: empty });
    if (pathname === '/api/connections')
      return route.fulfill({
        json: {
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
        },
      });
    return route.fulfill({ json: {} });
  });
  const avatarResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === proofAssetUrl,
  );
  await page.reload();
  const servedAvatar = await avatarResponse;
  assert.equal(servedAvatar.status(), 200);
  assert.equal(
    createHash('sha256')
      .update(await servedAvatar.body())
      .digest('hex'),
    assetSha256,
  );
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-renderer',
    'webgl',
  );
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute('data-model', 'sprout');
  await desktop.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setZoomFactor(1);
    window.show();
    window.focus();
    globalThis.__panelBoundsEvents = [];
    window.on('resize', () => {
      globalThis.__panelBoundsEvents.push({ at: Date.now(), bounds: window.getBounds() });
    });
  });
  await page.evaluate(() => {
    window.__panelStages = [];
    new MutationObserver(() => {
      window.__panelStages.push({
        at: performance.now(),
        stage: document.querySelector('.buddy')?.getAttribute('data-panel-stage'),
        available: document.querySelector('.buddy-panel')?.getAttribute('data-available'),
        viewport: { width: innerWidth, height: innerHeight },
      });
    }).observe(document.querySelector('.buddy'), {
      attributes: true,
      attributeFilter: ['data-panel-stage'],
    });
  });

  const nativeSnapshot = () =>
    desktop.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const preferences = window.webContents.getLastWebPreferences();
      const display = screen.getDisplayMatching(window.getBounds());
      return {
        bounds: window.getBounds(),
        contentBounds: window.getContentBounds(),
        workArea: display.workArea,
        displayScale: display.scaleFactor,
        zoomFactor: window.webContents.getZoomFactor(),
        alwaysOnTop: window.isAlwaysOnTop(),
        resizable: window.isResizable(),
        preferences: {
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          webSecurity: preferences.webSecurity,
        },
      };
    });
  const capture = async (name) => {
    const encoded = await desktop.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(path.join(artifacts, name), Buffer.from(encoded, 'base64'));
  };
  const inside = (bounds, area) => {
    assert.ok(bounds.x >= area.x && bounds.y >= area.y, 'Window starts within work area.');
    assert.ok(bounds.x + bounds.width <= area.x + area.width, 'Right edge is within work area.');
    assert.ok(bounds.y + bounds.height <= area.y + area.height, 'Bottom edge is within work area.');
  };
  const sized = (bounds, mode, area) => {
    const [width, height] = mode === 'panel' ? [408, 672] : [296, 128];
    assert.equal(bounds.width, Math.min(width, area.width));
    assert.equal(bounds.height, Math.min(height, area.height));
    inside(bounds, area);
  };
  const pet = page.locator('.buddy-face');
  const composer = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  const close = page.getByRole('button', { name: 'Collapse conversation', exact: true });
  const initial = await nativeSnapshot();
  sized(initial.bounds, 'pill', initial.workArea);
  assert.deepEqual(initial.preferences, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
  });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');

  // Exercise the real public preload call and inspect the actual BrowserWindow readback.
  const acknowledgement = await page.evaluate(() => window.insightos.setBuddyMode('pill', 711));
  assert.equal(acknowledgement.mode, 'pill');
  assert.equal(acknowledgement.requestId, 711);
  assert.deepEqual(acknowledgement.bounds, (await nativeSnapshot()).bounds);
  assert.equal(acknowledgement.viewport.width, initial.contentBounds.width);
  assert.equal(acknowledgement.viewport.height, initial.contentBounds.height);
  await assert.rejects(
    page.evaluate(() => window.insightos.setBuddyMode('panel', -1)),
    /Invalid companion layout request/,
  );

  // A normal opening retains the pet's screen anchor when no edge clamp is needed.
  const freeAnchor = await desktop.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const x = area.x + Math.min(32, Math.max(0, area.width - 408));
    const y = area.y + Math.min(28, Math.max(0, area.height - 672));
    window.setPosition(x, y);
    return { x, y };
  });
  await pet.press('Enter');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await expect(close).toBeFocused();
  const freeOpen = await nativeSnapshot();
  sized(freeOpen.bounds, 'panel', freeOpen.workArea);
  assert.deepEqual({ x: freeOpen.bounds.x, y: freeOpen.bounds.y }, freeAnchor);
  await close.press('Escape');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await expect(pet).toBeFocused();

  // Put only this isolated test window on the lower-right work-area edge.
  const edgePill = await desktop.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const bounds = window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    window.setPosition(area.x + area.width - bounds.width, area.y + area.height - bounds.height);
    return window.getBounds();
  });
  await capture('buddy-panel-native-collapsed.png');
  await pet.click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await expect(close).toBeFocused();
  await expect(composer).toBeVisible();
  assert.equal(await page.locator('.buddy-feed').evaluate((element) => element.scrollTop), 0);
  const edgeOpen = await nativeSnapshot();
  sized(edgeOpen.bounds, 'panel', edgeOpen.workArea);
  assert.equal(
    edgeOpen.bounds.x + edgeOpen.bounds.width,
    edgeOpen.workArea.x + edgeOpen.workArea.width,
  );
  assert.equal(
    edgeOpen.bounds.y + edgeOpen.bounds.height,
    edgeOpen.workArea.y + edgeOpen.workArea.height,
  );
  assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), {
    width: edgeOpen.contentBounds.width,
    height: edgeOpen.contentBounds.height,
  });
  const sendBounds = await page
    .getByRole('button', { name: 'Send request', exact: true })
    .boundingBox();
  assert.ok(sendBounds && sendBounds.width >= 44 && sendBounds.height >= 44);
  assert.ok(sendBounds.y + sendBounds.height <= edgeOpen.contentBounds.height);
  await capture('buddy-panel-native-expanded.png');

  await composer.fill('A local panel request');
  await composer.press('Enter');
  await expect(page.locator('.buddy-message.assistant')).toContainText(
    'A local native panel test response',
  );
  const draft = 'Keep this native-window draft while we talk.';
  await composer.fill(draft);
  await composer.evaluate((element) => element.setSelectionRange(5, 17));
  await page.locator('.buddy-feed').evaluate((element) => {
    element.scrollTop = 160;
    element.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(240); // Ensure the preceding 220ms entrance has completed.
  await close.click();
  await expect(pet).toBeFocused();
  await pet.press('Enter');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await expect(close).toBeFocused();
  await expect(composer).toHaveValue(draft);
  assert.deepEqual(
    await composer.evaluate((element) => [element.selectionStart, element.selectionEnd]),
    [5, 17],
  );
  assert.ok(await page.locator('.buddy-feed').evaluate((element) => element.scrollTop >= 159));
  await page.waitForTimeout(280); // Let any obsolete 160ms exit attempt to finish.
  const reversedOpen = await nativeSnapshot();
  assert.deepEqual(
    reversedOpen.bounds,
    edgeOpen.bounds,
    'An obsolete exit must not shrink the reopened window.',
  );
  await expect(page.locator('#buddy-request')).toHaveCount(1);
  await capture('buddy-panel-native-reopened.png');

  await composer.press('Escape');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await expect(pet).toBeFocused();
  const finalPill = await nativeSnapshot();
  sized(finalPill.bounds, 'pill', finalPill.workArea);
  assert.deepEqual(
    { x: finalPill.bounds.x, y: finalPill.bounds.y },
    { x: edgeOpen.bounds.x, y: edgeOpen.bounds.y },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pet.press('Enter');
  await expect(composer).toHaveValue(draft);
  await expect(close).toBeFocused();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector('.buddy-panel-glass')
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
    ),
    0,
  );
  await capture('buddy-panel-native-reduced-motion.png');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Settings and connections', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings & connections' })).toBeVisible();
  assert.deepEqual((await nativeSnapshot()).bounds, edgeOpen.bounds);
  await page.getByRole('dialog', { name: 'Settings & connections' }).press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await expect(composer).toHaveValue(draft);

  // The panel coordinator must release geometry ownership when entering the existing workspace.
  const workspaceReadingPosition = {
    selection: await composer.evaluate((element) => [
      element.selectionStart,
      element.selectionEnd,
      element.selectionDirection,
    ]),
    scrollTop: await page.locator('.buddy-feed').evaluate((element) => element.scrollTop),
  };
  assert.ok(workspaceReadingPosition.scrollTop >= 159);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Open full workspace', exact: true }).click();
  const returnButton = page.getByRole('button', { name: 'Return to desktop buddy ↗' });
  await expect(returnButton).toBeVisible();
  await expect
    .poll(async () => (await nativeSnapshot()).bounds.width)
    .toBe(Math.min(1350, initial.workArea.width));
  const workspace = await nativeSnapshot();
  assert.equal(workspace.bounds.height, Math.min(900, workspace.workArea.height));
  inside(workspace.bounds, workspace.workArea);
  assert.equal(workspace.alwaysOnTop, false);
  assert.equal(workspace.resizable, true);
  await returnButton.click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  // A newly mounted panel begins closed before its initial native IPC settles.
  // Observe the OS mode, not just that initial React attribute.
  await expect
    .poll(async () => {
      const native = await nativeSnapshot();
      return native.alwaysOnTop && !native.resizable;
    })
    .toBe(true);
  const returnedPill = await nativeSnapshot();
  sized(returnedPill.bounds, 'pill', returnedPill.workArea);
  assert.equal(returnedPill.alwaysOnTop, true);
  assert.equal(returnedPill.resizable, false);
  assert.deepEqual(
    { x: returnedPill.bounds.x, y: returnedPill.bounds.y },
    { x: edgeOpen.bounds.x, y: edgeOpen.bounds.y },
  );
  await pet.press('Enter');
  await expect(composer).toHaveValue(draft);
  await expect(close).toBeFocused();
  const workspaceRestoredReadingPosition = {
    selection: await composer.evaluate((element) => [
      element.selectionStart,
      element.selectionEnd,
      element.selectionDirection,
    ]),
    scrollTop: await page.locator('.buddy-feed').evaluate((element) => element.scrollTop),
  };
  assert.deepEqual(
    workspaceRestoredReadingPosition,
    workspaceReadingPosition,
    'Workspace return must restore compact selection and manual reading position.',
  );

  let controlledBackgroundCaptures;
  let zoomReview;
  if (process.argv.includes('--controlled-backgrounds')) {
    // This owned opaque fixture covers every captured desktop pixel behind the buddy.
    // It changes only an isolated test window, never the user's desktop background.
    const backgrounds = [
      {
        name: 'bright',
        color: '#f6fafc',
        paint: '#f6fafc',
        sentinel: '#ff00a7',
        rgb: [255, 0, 167],
      },
      { name: 'dark', color: '#0b1013', paint: '#0b1013', sentinel: '#00e89b', rgb: [0, 232, 155] },
      {
        name: 'busy',
        color: '#d8ebf3',
        sentinel: '#ffb600',
        rgb: [255, 182, 0],
        paint:
          'repeating-linear-gradient(135deg,transparent 0 24px,#374d8840 24px 48px),radial-gradient(ellipse at 12% 28%,#41d5e9 0,transparent 54%),radial-gradient(ellipse at 85% 12%,#b996ef 0,transparent 50%),radial-gradient(ellipse at 70% 85%,#ffb3a1 0,transparent 55%),#d8ebf3',
      },
    ];
    controlledBackgroundCaptures = [];
    for (const background of backgrounds) {
      let result;
      try {
        result = await desktop.evaluate(
          async ({ BrowserWindow, screen, desktopCapturer }, fixture) => {
            const window = BrowserWindow.getAllWindows()[0];
            const bounds = window.getBounds();
            // Extend beyond the crop so native rounded fixture corners cannot reveal desktop pixels.
            const fixtureBounds = {
              x: bounds.x - 24,
              y: bounds.y - 24,
              width: bounds.width + 48,
              height: bounds.height + 48,
            };
            const backdrop = new BrowserWindow({
              ...fixtureBounds,
              frame: false,
              transparent: false,
              backgroundColor: fixture.color,
              resizable: false,
              alwaysOnTop: true,
              show: false,
              skipTaskbar: true,
              webPreferences: {
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: true,
              },
            });
            try {
              await backdrop.loadURL(
                'data:text/html;charset=utf-8,' +
                  encodeURIComponent(
                    `<html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${fixture.paint}}.sentinel{position:fixed;inset:0;border:16px solid ${fixture.sentinel};box-sizing:border-box;pointer-events:none}</style><body><div class="sentinel"></div></body></html>`,
                  ),
              );
              backdrop.setBounds(fixtureBounds);
              backdrop.setAlwaysOnTop(true, 'pop-up-menu');
              backdrop.showInactive();
              backdrop.moveTop();
              window.moveTop();
              window.focus();
              await new Promise((resolve) => setTimeout(resolve, 250));
              const appliedFixture = backdrop.getBounds();
              if (
                appliedFixture.x >= bounds.x ||
                appliedFixture.y >= bounds.y ||
                appliedFixture.x + appliedFixture.width <= bounds.x + bounds.width ||
                appliedFixture.y + appliedFixture.height <= bounds.y + bounds.height
              )
                throw new Error('Controlled backdrop does not cover the complete capture bounds.');
              const display = screen.getDisplayMatching(bounds);
              const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: display.bounds.width, height: display.bounds.height },
              });
              const source =
                sources.find((item) => item.display_id === String(display.id)) ||
                (sources.length === 1 ? sources[0] : null);
              if (!source || source.thumbnail.isEmpty())
                throw new Error('Display capture unavailable for controlled background review.');
              const size = source.thumbnail.getSize();
              const xScale = size.width / display.bounds.width;
              const yScale = size.height / display.bounds.height;
              const rectangle = {
                x: Math.round((bounds.x - display.bounds.x) * xScale),
                y: Math.round((bounds.y - display.bounds.y) * yScale),
                width: Math.round(bounds.width * xScale),
                height: Math.round(bounds.height * yScale),
              };
              // Unique opaque markers outside the buddy crop prove that this
              // particular fixture actually reached the captured OS compositor.
              // Never publish a screenshot merely because a BrowserWindow exists.
              const points = [
                [bounds.x - 16, bounds.y - 16],
                [bounds.x + bounds.width / 2, bounds.y - 16],
                [bounds.x + bounds.width + 16, bounds.y - 16],
                [bounds.x - 16, bounds.y + bounds.height / 2],
                [bounds.x + bounds.width + 16, bounds.y + bounds.height / 2],
                [bounds.x - 16, bounds.y + bounds.height + 16],
                [bounds.x + bounds.width / 2, bounds.y + bounds.height + 16],
                [bounds.x + bounds.width + 16, bounds.y + bounds.height + 16],
              ]
                .map(([x, y]) => ({
                  x: Math.round((x - display.bounds.x) * xScale),
                  y: Math.round((y - display.bounds.y) * yScale),
                }))
                .filter(({ x, y }) => x >= 0 && y >= 0 && x < size.width && y < size.height);
              if (points.length < 3)
                throw new Error('Insufficient visible fixture sentinel positions.');
              return {
                background: fixture.name,
                source: 'actual OS compositor; owned opaque fixture behind isolated buddy only',
                bounds,
                fixtureBounds: backdrop.getBounds(),
                size,
                rectangle,
                sentinel: {
                  expected: fixture.rgb,
                  zOrder: 'pop-up-menu',
                  samples: points.map((point) => ({
                    ...point,
                    encoded: source.thumbnail
                      .crop({ ...point, width: 1, height: 1 })
                      .toPNG()
                      .toString('base64'),
                  })),
                },
                encoded: source.thumbnail.crop(rectangle).toPNG().toString('base64'),
              };
            } finally {
              backdrop.destroy();
              window.focus();
            }
          },
          background,
        );
      } catch (error) {
        controlledBackgroundCaptures.push({
          background: background.name,
          status: 'unavailable',
          available: false,
          reason: error.message,
          source: 'No OS image published; fixture/capture validation failed.',
        });
        continue;
      }
      const canvas = createCanvas(1, 1);
      const pixels = canvas.getContext('2d');
      try {
        for (const sample of result.sentinel.samples) {
          pixels.clearRect(0, 0, 1, 1);
          pixels.drawImage(await loadImage(Buffer.from(sample.encoded, 'base64')), 0, 0);
          sample.rgba = [...pixels.getImageData(0, 0, 1, 1).data];
          delete sample.encoded;
        }
      } catch (error) {
        delete result.encoded;
        for (const sample of result.sentinel.samples) delete sample.encoded;
        result.status = 'unavailable';
        result.available = false;
        result.source = 'No OS image published; fixture sentinel could not be decoded.';
        result.reason = error.message;
        controlledBackgroundCaptures.push(result);
        continue;
      }
      result.sentinel.validated = result.sentinel.samples.every(
        (sample) =>
          sample.rgba[3] === 255 &&
          result.sentinel.expected.every(
            (value, index) => Math.abs(value - sample.rgba[index]) <= 8,
          ),
      );
      if (!result.sentinel.validated) {
        delete result.encoded;
        result.status = 'unavailable';
        result.available = false;
        result.source = 'No OS image published; owned fixture sentinel was not visible in capture.';
        result.reason =
          'Stale or occluded compositor image: unique background edge pixels did not match.';
        controlledBackgroundCaptures.push(result);
        continue;
      }
      await writeFile(
        path.join(artifacts, `buddy-panel-native-prism-${background.name}.png`),
        Buffer.from(result.encoded, 'base64'),
      );
      delete result.encoded;
      result.status = 'captured';
      result.available = true;
      controlledBackgroundCaptures.push(result);
    }
  }
  if (process.argv.includes('--zoom-review')) {
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2),
    );
    await expect
      .poll(async () => (await nativeSnapshot()).bounds.width)
      .toBe(Math.min(816, initial.workArea.width));
    await expect
      .poll(async () => (await nativeSnapshot()).bounds.height)
      .toBe(Math.min(1344, initial.workArea.height));
    await composer.press('Escape');
    await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
    await pet.press('Enter');
    await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
    await expect(composer).toHaveValue(draft);
    await expect(close).toBeFocused();
    const zoomNative = await nativeSnapshot();
    inside(zoomNative.bounds, zoomNative.workArea);
    const zoomAcknowledgement = await page.evaluate(() =>
      window.insightos.setBuddyMode('panel', 712),
    );
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.deepEqual(zoomAcknowledgement.viewport, viewport);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const target = await page
      .getByRole('button', { name: 'Send request', exact: true })
      .boundingBox();
    assert.ok(
      target &&
        target.width >= 44 &&
        target.height >= 44 &&
        target.y + target.height <= viewport.height,
    );
    zoomReview = {
      zoomFactor: 2,
      native: zoomNative,
      acknowledgement: zoomAcknowledgement,
      viewport,
      visibleSendTarget: target,
    };
    await capture('buddy-panel-native-200-percent.png');
  }

  const stages = await page.evaluate(() => window.__panelStages);
  const openStages = stages.filter((entry) => entry.stage === 'open');
  assert.ok(openStages.length >= 4);
  for (const entry of openStages) {
    assert.equal(entry.available, 'true');
    assert.equal(entry.viewport.width, edgeOpen.contentBounds.width);
    assert.equal(entry.viewport.height, edgeOpen.contentBounds.height);
  }
  assert.ok(stages.some((entry) => entry.stage === 'closing'));
  const reversedStages = stages.findIndex(
    (entry, index) =>
      entry.stage === 'closing' &&
      stages[index + 1]?.stage === 'preparing-open' &&
      stages[index + 2]?.stage === 'open' &&
      stages[index + 2].at - entry.at < 160,
  );
  assert.ok(reversedStages >= 0, 'Reopening must reverse a live exit before native shrink.');
  assert.deepEqual(
    mutationRequests.filter((url) => url.includes('/voice/')),
    [],
  );
  assert.ok(!mutationRequests.includes('/api/computer/stop'));
  const model = await page.locator('.buddy-face .insight-signal').getAttribute('data-model');
  const report = {
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    launch: 'actual Electron main and preload, --dev, isolated user-data profile',
    apiScope:
      'All API responses intercepted locally after reload; only a fixture computer request was submitted. No provider or microphone checks.',
    nativeIpc:
      'actual handler; acknowledgement matches BrowserWindow/content bounds and caller request id; invalid request id rejected',
    rendererAssetAtCapture: model,
    assetUrl: proofAssetUrl,
    assetSha256,
    initial,
    acknowledgement,
    freeAnchor,
    freeOpen,
    edgePill,
    edgeOpen,
    reversedOpen,
    finalPill,
    workspace,
    returnedPill,
    workspaceRoundTrip:
      'existing workspace receives horizontally centered/resizable bounds; returning restores dock anchor, draft, selection5..17, manually scrolled feed and focus on reopened conversation',
    workspaceReadingPosition,
    workspaceRestoredReadingPosition,
    modalFocus:
      'Escape closes Settings without collapsing the conversation and restores focus to Tools; draft retained',
    controlledBackgroundCaptures,
    zoomReview,
    focus: 'close on open/reopen, pet before hide and after collapsed',
    preservation:
      'single mounted composer, draft, selection 5..17 and manually scrolled feed retained',
    rapidReversal:
      'reopened window retained expanded native bounds after the obsolete exit deadline',
    reversalStageIntervalMs: stages[reversedStages + 2].at - stages[reversedStages].at,
    reducedMotion: 'shell has no running animation; draft and keyboard focus retained',
    visibleSendTarget: sendBounds,
    stageObservations: stages,
    nativeResizeEvents: await desktop.evaluate(() => globalThis.__panelBoundsEvents),
    interceptedMutationRequests: mutationRequests,
    untested: [
      'other physical displays and DPI scales',
      'actual 320x480 native work area',
      'live microphone/TTS',
      'production packaged launch',
      'measured active-motion frame budget',
    ],
  };
  await writeFile(
    path.join(artifacts, 'buddy-panel-native-verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await unlink(path.join(artifacts, 'buddy-panel-native-failure.png')).catch(() => {});
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (desktop) {
    const nativeFailure = await desktop
      .evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) return null;
        return {
          bounds: window.getBounds(),
          alwaysOnTop: window.isAlwaysOnTop(),
          resizable: window.isResizable(),
          visible: window.isVisible(),
          workArea: screen.getDisplayMatching(window.getBounds()).workArea,
          events: globalThis.__panelBoundsEvents,
        };
      })
      .catch(() => null);
    console.error(JSON.stringify({ nativeFailure }));
    const failure = await desktop
      .evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return window && (await window.webContents.capturePage()).toPNG().toString('base64');
      })
      .catch(() => null);
    if (failure)
      await writeFile(
        path.join(artifacts, 'buddy-panel-native-failure.png'),
        Buffer.from(failure, 'base64'),
      );
  }
  throw error;
} finally {
  await desktop?.close();
  await unlink(entry).catch(() => {});
}
