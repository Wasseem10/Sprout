// Bounded actual-HTML audit. Native compositor, zoom, timing and physical AT are separate proofs.
// API/voice responses are local fixtures; no microphone or provider session is opened.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { newEnergyState } from '../dist-server/shared/energy-calculations.js';
import { proofAssetFile, proofCanonicalFile, proofOutputPath } from './buddy-proof-options.mjs';

const reportFile = proofOutputPath('artifacts/buddy-accessibility-audit.json');
const output = path.dirname(reportFile);
await mkdir(output, { recursive: true });
const runtimeBytes = await readFile(path.join('public/buddy', proofAssetFile));
const canonicalBytes = await readFile(path.join('design/buddy/sprout', proofCanonicalFile));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const baseURL = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';

const luminance = (rgb) =>
  rgb
    .slice(0, 3)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

async function tree(page) {
  const session = await page.context().newCDPSession(page);
  const { nodes } = await session.send('Accessibility.getFullAXTree');
  await session.detach();
  return nodes
    .filter((node) => !node.ignored)
    .map((node) => ({
      id: node.nodeId,
      parent: node.parentId,
      children: node.childIds,
      role: node.role?.value,
      name: node.name?.value,
      properties: Object.fromEntries(
        (node.properties ?? []).map((property) => [property.name, property.value.value]),
      ),
    }));
}

const layout = (page) =>
  page.evaluate(() => {
    const body =
      document.querySelector('.buddy-message p') ??
      document.querySelector('.buddy-composer textarea');
    const feed = document.querySelector('.buddy-feed');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootWidth: document.documentElement.scrollWidth,
      bodyFont: getComputedStyle(body).fontSize,
      feed: { clientHeight: feed.clientHeight, scrollHeight: feed.scrollHeight },
      controls: [...document.querySelectorAll('.buddy button')]
        .filter((element) => element.checkVisibility())
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label') ?? element.textContent.trim(),
            disabled: element.disabled,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
    };
  });

// Read computed foreground colours, then sample the rendered background under each
// visible text line box. Removing glyph paint retains all box/background/pseudo layers.
// This includes the opaque decorative sibling; transparent ancestors do not imply black.
async function contrast(page) {
  const panel = page.locator('.buddy');
  const paintedPixels = await panel.screenshot();
  const bounds = await panel.boundingBox();
  assert.ok(bounds);
  const samples = await panel.evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const elements = [...root.querySelectorAll('*')].filter(
      (element) =>
        element.checkVisibility() &&
        !element.closest('[aria-hidden="true"]') &&
        !element.classList.contains('sr-only') &&
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
        ),
    );
    const input = root.querySelector('.buddy-composer textarea');
    if (input?.checkVisibility() && !elements.includes(input)) elements.push(input);
    const result = elements.map((element) => {
      const isInput = element instanceof HTMLTextAreaElement;
      const pseudo = isInput && !element.value ? '::placeholder' : null;
      const style = getComputedStyle(element, pseudo);
      const boxStyle = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const feed = element.closest('.buddy-feed')?.getBoundingClientRect() ?? rootRect;
      const textRects = isInput
        ? [
            {
              left:
                rect.left + parseFloat(boxStyle.paddingLeft) + parseFloat(boxStyle.borderLeftWidth),
              top: rect.top + parseFloat(boxStyle.paddingTop) + parseFloat(boxStyle.borderTopWidth),
              right:
                rect.right -
                parseFloat(boxStyle.paddingRight) -
                parseFloat(boxStyle.borderRightWidth),
              bottom:
                rect.bottom -
                parseFloat(boxStyle.paddingBottom) -
                parseFloat(boxStyle.borderBottomWidth),
            },
          ]
        : [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
            .flatMap((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              return [...range.getClientRects()];
            });
      const visibleRects = textRects.map((box) => ({
        left: Math.max(box.left, feed.left, rootRect.left),
        top: Math.max(box.top, feed.top, rootRect.top),
        right: Math.min(box.right, feed.right, rootRect.right),
        bottom: Math.min(box.bottom, feed.bottom, rootRect.bottom),
      }));
      let opacity = 1;
      for (let current = element; current; current = current.parentElement)
        opacity *= Number(getComputedStyle(current).opacity);
      return {
        tag: element.tagName,
        className: element.className,
        pseudo,
        text: (isInput
          ? element.value || element.getAttribute('placeholder')
          : element.textContent.trim()
        ).slice(0, 120),
        color: style.color,
        opacity,
        fontSize: style.fontSize,
        sustainedReading:
          isInput || element.matches('.buddy-message p, .energy-panel p, .energy-panel a'),
        disabled: !!element.closest(':disabled'),
        visibleRects,
        inlineStyle: element.getAttribute('style'),
      };
    });
    for (const element of elements) {
      element.style.setProperty('color', 'transparent', 'important');
      element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    }
    window.__buddyAuditElements = elements;
    return result;
  });
  const placeholderStyle = await page.addStyleTag({
    content:
      '.buddy textarea::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }',
  });
  let pixels;
  try {
    pixels = await panel.screenshot();
  } finally {
    await page.evaluate((saved) => {
      window.__buddyAuditElements.forEach((element, index) => {
        const previous = saved[index].inlineStyle;
        if (previous === null) element.removeAttribute('style');
        else element.setAttribute('style', previous);
      });
      delete window.__buddyAuditElements;
    }, samples);
    await placeholderStyle.evaluate((element) => element.remove());
  }
  const image = await loadImage(pixels);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
  const painted = await loadImage(paintedPixels);
  assert.equal(painted.width, image.width);
  assert.equal(painted.height, image.height);
  ctx.clearRect(0, 0, image.width, image.height);
  ctx.drawImage(painted, 0, 0);
  const originalRGBA = ctx.getImageData(0, 0, image.width, image.height).data;
  const scale = image.width / bounds.width;
  return samples.flatMap((sample) => {
    const foreground = sample.color.match(/[\d.]+/g)?.map(Number);
    assert.ok(
      foreground && sample.color.startsWith('rgb'),
      'Unsupported computed colour: ' + sample.color,
    );
    const alpha = (foreground[3] ?? 1) * sample.opacity;
    let minimum = Infinity,
      darkest = null,
      count = 0;
    for (const rect of sample.visibleRects) {
      if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
      const left = Math.max(0, Math.ceil((rect.left - bounds.x) * scale));
      const top = Math.max(0, Math.ceil((rect.top - bounds.y) * scale));
      const right = Math.min(image.width, Math.floor((rect.right - bounds.x) * scale));
      const bottom = Math.min(image.height, Math.floor((rect.bottom - bounds.y) * scale));
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const offset = (y * image.width + x) * 4;
          // Empty font bearings and unpainted line-box corners are not behind text.
          // Use the paint difference only as a mask, never as the foreground colour.
          if (
            Math.max(
              ...[0, 1, 2].map((channel) =>
                Math.abs(originalRGBA[offset + channel] - rgba[offset + channel]),
              ),
            ) < 2
          )
            continue;
          assert.equal(rgba[offset + 3], 255, 'Controlled reading composite must be fully opaque.');
          const background = [...rgba.subarray(offset, offset + 3)];
          const renderedForeground = foreground
            .slice(0, 3)
            .map((value, index) => value * alpha + background[index] * (1 - alpha));
          const a = luminance(renderedForeground),
            b = luminance(background);
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < minimum) {
            minimum = ratio;
            darkest = { x, y, rgb: background };
          }
          count++;
        }
    }
    if (!count) return [];
    return [
      {
        ...sample,
        inlineStyle: undefined,
        ratio: minimum,
        pixelCount: count,
        limitingBackground: darkest,
      },
    ];
  });
}

// Forced-colours mode owns its palette. Chromium can replace transparent glyph
// paint, so do not reuse the paired-PNG author-colour measurement in this mode.
const forcedColorPresentation = (page) =>
  page.locator('.buddy').evaluate((root) => {
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:fixed;visibility:hidden;forced-color-adjust:none;color:CanvasText;background:Canvas';
    root.append(probe);
    const palette = {
      Canvas: getComputedStyle(probe).backgroundColor,
      CanvasText: getComputedStyle(probe).color,
    };
    probe.style.color = 'ButtonText';
    probe.style.backgroundColor = 'ButtonFace';
    palette.ButtonText = getComputedStyle(probe).color;
    palette.ButtonFace = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const text = [...root.querySelectorAll('*')]
      .filter(
        (element) =>
          element.checkVisibility() &&
          !element.closest('[aria-hidden="true"]') &&
          !element.classList.contains('sr-only') &&
          (element instanceof HTMLTextAreaElement ||
            [...element.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
            )),
      )
      .map((element) => {
        const input = element instanceof HTMLTextAreaElement;
        const style = getComputedStyle(element, input && !element.value ? '::placeholder' : null);
        return {
          tag: element.tagName,
          text: (input ? element.value || element.placeholder : element.textContent.trim()).slice(
            0,
            120,
          ),
          color: style.color,
          fontSize: style.fontSize,
          disabled: !!element.closest(':disabled'),
        };
      });
    return {
      method: 'Computed forced system palette and text styles; no paired-PNG contrast claim.',
      active: matchMedia('(forced-colors: active)').matches,
      decorativeGlassHidden:
        getComputedStyle(root.querySelector('.buddy-panel-glass')).display === 'none',
      palette,
      text,
    };
  });

const assertCase = (entry, width) => {
  assert.equal(entry.layout.rootWidth, width);
  assert.ok(entry.contrast.length > 0, 'The audit must measure visible glyphs.');
  assert.ok(
    entry.contrast.some((sample) => sample.sustainedReading),
    'The audit must measure actual reading text.',
  );
  assert.ok(entry.layout.controls.every((control) => control.width >= 44 && control.height >= 44));
  for (const reading of entry.contrast.filter((result) => !result.disabled)) {
    const minimum = reading.sustainedReading ? 7 : 4.5;
    if (reading.ratio < minimum) console.log(JSON.stringify(reading));
    assert.ok(
      reading.ratio >= minimum,
      reading.tag + ' ' + reading.text + ': ' + reading.ratio.toFixed(3) + ':1 < ' + minimum + ':1',
    );
  }
};

try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 480 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    localStorage.setItem('insightos.buddyMotionPaused', 'true');
    localStorage.setItem('insightos.largeText', 'false');
    window.__buddyAuditMicCalls = 0;
    if (navigator.mediaDevices)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.__buddyAuditMicCalls++;
          return Promise.reject(new Error('The HTML audit must not start a microphone.'));
        },
      });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
      return kind.startsWith('webgl') ? null : original.apply(this, [kind, ...options]);
    };
  });
  await context.route('**/buddy/*.glb', (route) =>
    route.fulfill({ body: runtimeBytes, contentType: 'model/gltf-binary' }),
  );
  const empty = { folder: null, code: null, browser: null, screen: null };
  const energy = newEnergyState();
  const requests = [];
  let hold = false,
    release;
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requests.push({ pathname, method: route.request().method() });
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true, pythonConfigured: false, editorConfigured: false },
          integrations: {
            huggingFace: { configured: false },
            elevenLabs: { configured: false, ttsConfigured: false },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        },
      });
    if (pathname === '/api/computer/state')
      return route.fulfill({
        json:
          new URL(route.request().frame().url()).searchParams.get('workspace') === 'energy'
            ? { ...empty, energy }
            : empty,
      });
    if (pathname === '/api/computer/request') {
      if (hold)
        await new Promise((resolve) => {
          release = resolve;
        });
      return route
        .fulfill({
          json: {
            state: empty,
            summary: 'A local HTML audit response. ' + 'LongUnbrokenText'.repeat(20),
          },
        })
        .catch(() => {});
    }
    if (pathname === '/api/connections')
      return route.fulfill({
        json: {
          editable: false,
          defaults: {
            HF_MODEL_ID: 'fixture',
            HF_VISION_MODEL_ID: 'fixture',
            ELEVENLABS_VOICE_ID: 'fixture',
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
  const page = await context.newPage();
  await page.goto(baseURL + '/?desktop=buddy');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  const closedTree = await tree(page);
  assert.ok(!closedTree.some((node) => node.role === 'textbox' || node.role === 'log'));
  await page.locator('.buddy-face').press('Enter');
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await expect(input).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Collapse conversation', exact: true }),
  ).toBeFocused();
  const initialPanel = {
    layout: await layout(page),
    contrast: await contrast(page),
    tree: await tree(page),
  };
  await input.fill('A local audit request');
  await input.press('Enter');
  await expect(page.locator('.buddy-message.assistant')).toContainText(
    'A local HTML audit response',
  );
  await input.fill('Preserve this audit draft.');
  const conversation = {
    layout: await layout(page),
    contrast: await contrast(page),
    tree: await tree(page),
  };
  await input.press('Escape');
  await expect(page.locator('.buddy-face')).toBeFocused();
  const collapsedAfterConversation = await tree(page);
  assert.ok(
    !collapsedAfterConversation.some((node) => node.role === 'textbox' || node.role === 'log'),
  );
  await page.locator('.buddy-face').press('Enter');
  await expect(input).toHaveValue('Preserve this audit draft.');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Settings and connections', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Large text', exact: true }).check();
  const settingsTree = await tree(page);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  await expect(page.locator('.buddy-shell')).toHaveClass(/large-text/);
  const largeText = { layout: await layout(page), contrast: await contrast(page) };
  hold = true;
  await input.fill('A bounded busy-state audit');
  await input.press('Enter');
  const stop = page.getByRole('button', { name: 'Stop task and audio', exact: true });
  await expect(stop).toBeVisible();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  const popup = page.getByRole('region', { name: 'Tools', exact: true });
  const popupBounds = await popup.boundingBox();
  const stopBounds = await stop.boundingBox();
  const feedBounds = await page.locator('.buddy-feed').boundingBox();
  assert.ok(popupBounds && stopBounds && feedBounds);
  await page.screenshot({ path: path.join(output, 'panel-320-large-tools-stop.png') });
  assert.ok(popupBounds.y >= feedBounds.y - 1, 'Tools must remain inside the reading well.');
  assert.ok(popupBounds.y >= stopBounds.y + stopBounds.height, 'Tools must not cover direct Stop.');
  await stop.click();
  release?.();
  hold = false;
  await expect(page.locator('.buddy-identity [role="status"]')).toHaveText('Ready to talk');
  const energyPage = await context.newPage();
  await energyPage.goto(baseURL + '/?desktop=buddy&workspace=energy');
  await energyPage.locator('.buddy-face').press('Enter');
  await expect(energyPage.locator('.energy-panel')).toBeVisible();
  await energyPage.locator('.energy-panel summary').click();
  const energyDetails = {
    layout: await layout(energyPage),
    contrast: await contrast(energyPage),
    tree: await tree(energyPage),
  };
  await energyPage.close();
  await page.emulateMedia({ forcedColors: 'active' });
  const forcedColors = {
    layout: await layout(page),
    presentation: await forcedColorPresentation(page),
    tree: await tree(page),
  };
  assert.equal(forcedColors.layout.rootWidth, 320);
  assert.ok(
    forcedColors.layout.controls.every((control) => control.width >= 44 && control.height >= 44),
  );
  assert.ok(forcedColors.presentation.active && forcedColors.presentation.decorativeGlassHidden);
  assert.ok(
    forcedColors.presentation.text.length > 0,
    'Forced-colours text styles must be recorded.',
  );
  await page.screenshot({ path: path.join(output, 'panel-320-forced-colors.png') });
  await page.emulateMedia({ forcedColors: 'none' });
  for (const entry of [initialPanel, conversation, largeText, energyDetails])
    assertCase(entry, 320);
  assert.equal(initialPanel.layout.bodyFont, '18px');
  assert.equal(largeText.layout.bodyFont, '22px');
  const apiCount = requests.length;
  const preview = await context.newPage();
  await preview.setViewportSize({ width: 1000, height: 1100 });
  await preview.goto(baseURL + '/?studio=panel');
  await expect(preview.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  const glass = [];
  for (const width of [392, 320]) {
    if (width === 320) await preview.setViewportSize({ width: 320, height: 1000 });
    for (const background of ['light', 'dark', 'busy']) {
      await preview.getByRole('button', { name: background, exact: true }).click();
      await preview
        .locator('.buddy')
        .screenshot({ path: path.join(output, 'panel-' + width + '-' + background + '.png') });
      const entry = {
        panelWidth: width,
        background,
        layout: await layout(preview),
        contrast: await contrast(preview),
      };
      assertCase(entry, width === 392 ? 1000 : 320);
      assert.equal(
        Math.round((await preview.locator('.buddy').boundingBox()).width),
        width === 392 ? 392 : 304,
      );
      glass.push(entry);
    }
  }
  await preview.getByLabel('Large text', { exact: true }).check();
  const previewLarge = { layout: await layout(preview), contrast: await contrast(preview) };
  assertCase(previewLarge, 320);
  await preview
    .locator('.buddy')
    .screenshot({ path: path.join(output, 'panel-320-large-reading.png') });
  assert.equal(requests.length, apiCount, 'The visual preview must not request any API.');
  for (const target of [page, preview])
    assert.equal(await target.evaluate(() => window.__buddyAuditMicCalls), 0);
  assert.ok(!requests.some((request) => request.pathname.includes('/voice/')));
  const report = {
    checkedAt: new Date().toISOString(),
    asset: {
      runtime: proofAssetFile,
      canonical: proofCanonicalFile,
      runtimeSha256: digest(runtimeBytes),
      canonicalSha256: digest(canonicalBytes),
      rendering: 'Authored PNG fallback; WebGL deliberately disabled for this HTML-only audit.',
    },
    browser: browser.version(),
    scope:
      'Actual current DesktopBuddy HTML/CSS, 320CSSpx local API fixtures, actual same-component local preview at392px and320CSSpx on controlled light/dark/busy backgrounds. No native/provider/microphone session.',
    method:
      'W3C sRGB luminance from computed foreground (including inherited opacity) against the rendered PNG background under actual glyph paint. Paired original/glyph-hidden PNGs supply a difference mask within direct-text Range line boxes; the mask only locates painted text, never supplies its foreground colour. Native textarea content boxes use the same mask. Every masked background pixel is checked; unused font bearings and rounded-rim corners outside text are excluded. Glyph paint temporarily removed while preserving layout, borders, surfaces and decorative sibling/pseudo layers; exact inline styles restored. Minimum ratio per text element. Main reading target7:1; labels4.5:1 separately. This is not a physical-display or antialiased-glyph measurement.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html',
      'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
      'https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/',
    ],
    closedTree,
    initialPanel,
    conversation,
    collapsedAfterConversation,
    settingsTree,
    largeText,
    energyDetails,
    forcedColors,
    disclosureBounds: {
      popup: popupBounds,
      stop: stopBounds,
      feed: feedBounds,
      pointerStopPassed: true,
    },
    glass,
    previewLarge,
    requests,
    limits: [
      'Browser accessibility tree and keyboard evidence, not a physical screen-reader session.',
      'Native200% zoom/compositing must be checked by a separate current Electron proof. This run checks320CSSpx and the actual Large setting.',
      'Offscreen text is excluded; optional data table can scroll horizontally within its own region.',
      'These are the recorded states, not blanket WCAG certification or every hover/pressed/error state.',
      'Forced-colours evidence records the selected system palette, styles, accessibility tree and unchanged screenshot; its contrast is not measured by the normal-mode paired-PNG method and is excluded from the author-palette7:1 result.',
      'Screenshots show the actual panel with labelled fixture data, not real AI replies or backend actions. The selected GLB receives no GPU/material validation here.',
    ],
  };
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        report: reportFile,
        checkedAt: report.checkedAt,
        minimumReadingContrast: Math.min(
          ...[initialPanel, conversation, largeText, energyDetails, ...glass, previewLarge].flatMap(
            (entry) =>
              entry.contrast
                .filter((result) => result.sustainedReading && !result.disabled)
                .map((result) => result.ratio),
          ),
        ),
        snapshots: glass.map((entry) => ({
          width: entry.panelWidth,
          background: entry.background,
          font: entry.layout.bodyFont,
        })),
        disclosureBounds: report.disclosureBounds,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
