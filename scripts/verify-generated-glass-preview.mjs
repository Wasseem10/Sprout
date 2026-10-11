// Actual opt-in panel preview; no backend, microphone, desktop capture or image edits.
// Start the existing UI separately, then run: node scripts/verify-generated-glass-preview.mjs
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag =
  process.argv.find((value) => value.startsWith('--proof-tag='))?.slice(12) ||
  'sprout-pearl-corners-v002-verification';
assert.match(tag, /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/);
const output = path.join(workspace, 'artifacts', tag);
const base = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';
const texturePath = '/buddy/sprout-glass-material-v002.png';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  base,
  texturePath,
  source: Object.fromEntries(
    await Promise.all(
      [
        'src/BuddyPanelPreview.tsx',
        'src/buddy-panel-preview.css',
        'src/DesktopBuddy.tsx',
        'src/buddy.css',
        'src/useBuddyTilt.ts',
        `public${texturePath}`,
      ].map(async (file) => [file, digest(await readFile(path.join(workspace, file)))]),
    ),
  ),
  cases: [],
  layout: [],
  tilt: [],
  preferences: [],
  apiRequests: [],
  externalRequests: [],
  pageErrors: [],
  failures: [],
  limitations: [
    'Owned browser preview backgrounds only; no Windows compositor or desktop-refraction claim.',
    'CSS zoom:2 and a 320px viewport are layout checks, not native Electron/browser zoom evidence.',
    'Paired original/glyph-hidden PNGs measure computed foreground against rendered background at glyph locations; not antialiased ink or physical-display contrast.',
    'Matched material captures use reduced motion with the real WebGL renderer. A separate normal-motion pass checks decorative-only tilt.',
  ],
};
const check = (condition, message) => {
  if (!condition) report.failures.push(message);
};
const file = (name) => path.join(output, `${name}.png`);
const luminance = (rgb) =>
  rgb
    .slice(0, 3)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

async function decode(buffer) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    rgba: context.getImageData(0, 0, image.width, image.height).data,
  };
}

// Adapted from audit-buddy-accessibility.mjs. Both evidence PNGs remain untouched.
// The pixel difference supplies only the glyph mask, never the foreground colour.
async function captureContrast(page, name, includeReading) {
  const panel = page.locator('.buddy');
  await panel.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  const original = await panel.screenshot({ path: file(`${name}-panel`), caret: 'hide' });
  if (includeReading)
    await panel.locator('.buddy-body').screenshot({ path: file(`${name}-reading`), caret: 'hide' });
  const bounds = await panel.boundingBox();
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
    const input = root.querySelector('textarea');
    if (input?.checkVisibility() && !elements.includes(input)) elements.push(input);
    const entries = elements.map((element) => {
      const input = element instanceof HTMLTextAreaElement;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element, input && !element.value ? '::placeholder' : null);
      const boxStyle = getComputedStyle(element);
      const clip = element.closest('.buddy-feed')?.getBoundingClientRect() ?? rootRect;
      const lineRects = input
        ? [
            {
              left:
                box.left + parseFloat(boxStyle.paddingLeft) + parseFloat(boxStyle.borderLeftWidth),
              top: box.top + parseFloat(boxStyle.paddingTop) + parseFloat(boxStyle.borderTopWidth),
              right:
                box.right -
                parseFloat(boxStyle.paddingRight) -
                parseFloat(boxStyle.borderRightWidth),
              bottom:
                box.bottom -
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
      let opacity = 1;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement)
        opacity *= Number(getComputedStyle(ancestor).opacity);
      return {
        text: (input ? element.value || element.placeholder : element.textContent.trim()).slice(
          0,
          120,
        ),
        color: style.color,
        opacity,
        fontSize: style.fontSize,
        reading: input || element.matches('.buddy-message p'),
        inlineStyle: element.getAttribute('style'),
        rects: lineRects.map((rect) => ({
          left: Math.max(rect.left, clip.left, rootRect.left),
          top: Math.max(rect.top, clip.top, rootRect.top),
          right: Math.min(rect.right, clip.right, rootRect.right),
          bottom: Math.min(rect.bottom, clip.bottom, rootRect.bottom),
        })),
      };
    });
    window.__pearlProofText = elements;
    for (const element of elements) {
      element.style.setProperty('color', 'transparent', 'important');
      element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    }
    return entries;
  });
  let hidden;
  let placeholder;
  try {
    placeholder = await page.addStyleTag({
      content:
        '.buddy textarea::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }',
    });
    hidden = await panel.screenshot({ path: file(`${name}-text-hidden`), caret: 'hide' });
  } finally {
    await page.evaluate((saved) => {
      window.__pearlProofText.forEach((element, index) => {
        const previous = saved[index].inlineStyle;
        if (previous === null) element.removeAttribute('style');
        else element.setAttribute('style', previous);
      });
      delete window.__pearlProofText;
    }, samples);
    if (placeholder) await placeholder.evaluate((element) => element.remove());
  }
  const painted = await decode(original);
  const background = await decode(hidden);
  assert.equal(painted.width, background.width);
  assert.equal(painted.height, background.height);
  const scaleX = background.width / bounds.width;
  const scaleY = background.height / bounds.height;
  const contrast = samples.flatMap((sample) => {
    assert.match(sample.color, /^rgba?\(/, `Supported computed text colour: ${sample.color}`);
    const foreground = sample.color.match(/[\d.]+/g).map(Number);
    const alpha = (foreground[3] ?? 1) * sample.opacity;
    let minimum = Infinity;
    let limitingBackground;
    let pixelCount = 0;
    for (const rect of sample.rects) {
      const left = Math.max(0, Math.ceil((rect.left - bounds.x) * scaleX));
      const top = Math.max(0, Math.ceil((rect.top - bounds.y) * scaleY));
      const right = Math.min(background.width, Math.floor((rect.right - bounds.x) * scaleX));
      const bottom = Math.min(background.height, Math.floor((rect.bottom - bounds.y) * scaleY));
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const offset = (y * background.width + x) * 4;
          if (
            Math.max(
              ...[0, 1, 2].map((channel) =>
                Math.abs(painted.rgba[offset + channel] - background.rgba[offset + channel]),
              ),
            ) < 2
          )
            continue;
          assert.equal(background.rgba[offset + 3], 255, 'Owned preview background is opaque.');
          const rgb = [...background.rgba.subarray(offset, offset + 3)];
          const ink = foreground
            .slice(0, 3)
            .map((value, index) => value * alpha + rgb[index] * (1 - alpha));
          const a = luminance(ink),
            b = luminance(rgb);
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < minimum) {
            minimum = ratio;
            limitingBackground = { x, y, rgb };
          }
          pixelCount++;
        }
    }
    if (!pixelCount) return [];
    const target = sample.reading ? 7 : 4.5;
    check(
      minimum >= target,
      `${name}: ${sample.text} contrast ${minimum.toFixed(2)} < ${target}:1`,
    );
    return [
      {
        text: sample.text,
        color: sample.color,
        fontSize: sample.fontSize,
        reading: sample.reading,
        target,
        minimum,
        pixelCount,
        limitingBackground,
      },
    ];
  });
  assert.ok(
    contrast.filter((sample) => sample.reading).length >= 3,
    'Both conversation messages and the composer must be sampled.',
  );
  const reading = contrast.filter((sample) => sample.reading).map((sample) => sample.minimum);
  return {
    name,
    png: `${name}-panel.png`,
    backgroundPng: `${name}-text-hidden.png`,
    readingPng: includeReading ? `${name}-reading.png` : undefined,
    minimumReadingContrast: Math.min(...reading),
    contrast,
  };
}

const materialStyle = (page) =>
  page.locator('.buddy-panel-glass').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return {
      image: style.backgroundImage,
      opacity: Number(style.opacity),
      display: style.display,
      pointerEvents: style.pointerEvents,
      glassDisplay: getComputedStyle(element).display,
      lens: getComputedStyle(element, '::after').backgroundImage,
      filter: getComputedStyle(element).backdropFilter,
    };
  });

const contentGeometry = (page) =>
  page.locator('.buddy').evaluate((root) =>
    [
      '.buddy-bar',
      '.buddy-identity strong',
      '.buddy-message p',
      '.buddy-composer',
      'textarea',
      'button',
      '.buddy-face .insight-signal',
    ].map((selector) => ({
      selector,
      elements: [...root.querySelectorAll(selector)]
        .filter((element) => element.checkVisibility())
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const transformedAncestors = [];
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (
              [style.transform, style.rotate, style.scale, style.translate].some(
                (value) => value !== 'none',
              )
            )
              transformedAncestors.push(ancestor.className || ancestor.tagName);
            if (ancestor === root) break;
          }
          return {
            bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            transformedAncestors,
          };
        }),
    })),
  );

async function checkLayout(page, name) {
  const metrics = await page.locator('.buddy').evaluate((root) => {
    const panel = root.getBoundingClientRect();
    const input = root.querySelector('textarea').getBoundingClientRect();
    const feed = root.querySelector('.buddy-feed');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      zoom: getComputedStyle(document.documentElement).zoom,
      panel: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
      input: { x: input.x, y: input.y, width: input.width, height: input.height },
      bodyFont: getComputedStyle(root.querySelector('.buddy-message p')).fontSize,
      feed: {
        clientWidth: feed.clientWidth,
        scrollWidth: feed.scrollWidth,
        clientHeight: feed.clientHeight,
        scrollHeight: feed.scrollHeight,
      },
      controls: [...root.querySelectorAll('button,textarea')]
        .filter((element) => element.checkVisibility())
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label') || element.textContent.trim(),
            left: rect.left - panel.left,
            right: rect.right - panel.right,
            top: rect.top - panel.top,
            bottom: rect.bottom - panel.bottom,
          };
        }),
    };
  });
  check(
    metrics.documentWidth <= metrics.viewport.width + 1,
    `${name}: document has horizontal overflow`,
  );
  check(
    metrics.feed.scrollWidth <= metrics.feed.clientWidth + 1,
    `${name}: reading region has horizontal overflow`,
  );
  check(metrics.feed.clientHeight > 40, `${name}: reading region remains usable`);
  for (const control of metrics.controls)
    check(
      control.left >= -1 && control.right <= 1 && control.top >= -1 && control.bottom <= 1,
      `${name}: control escapes panel: ${control.name}`,
    );
  await page.locator('.buddy').screenshot({ path: file(name), caret: 'hide' });
  report.layout.push({ name, ...metrics });
}

const browser = await chromium.launch();
let context;
let page;
try {
  context = await browser.newContext({
    viewport: { width: 1040, height: 1280 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
    window.__pearlMicCalls = 0;
    if (navigator.mediaDevices)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.__pearlMicCalls++;
          throw Error('No microphone in the visual preview.');
        },
      });
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      report.apiRequests.push(url.href);
      return route.abort();
    }
    if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) {
      report.externalRequests.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  const root = page.locator('.buddy');
  const wrapper = page.locator('.buddy-panel-preview');
  const plane = root.locator('.buddy-visual-plane');
  const material = page.getByRole('group', { name: 'Glass material', exact: true });
  const ready = async () => {
    await expect(root).toHaveAttribute('data-panel-stage', 'open');
    await expect(root.locator('.insight-signal')).toHaveAttribute('data-renderer', 'webgl', {
      timeout: 15000,
    });
    await page.evaluate(() => document.fonts.ready);
  };
  await page.goto(`${base}/?studio=panel`);
  await ready();
  await expect(wrapper).not.toHaveClass(/has-pearl-material/);
  await expect(material.getByRole('button', { name: 'Current', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const currentStyle = await materialStyle(page);
  check(!currentStyle.image.includes(texturePath), 'Default route must keep the current glass.');
  report.defaultMaterial = currentStyle;

  await page.goto(`${base}/?studio=panel&material=pearl`);
  await ready();
  await expect(wrapper).toHaveClass(/has-pearl-material/);
  const slider = page.getByRole('slider', { name: 'Texture strength', exact: true });
  await expect(slider).toHaveValue('40');
  await expect(slider).toHaveAttribute('min', '12');
  await expect(slider).toHaveAttribute('max', '40');
  const setStrength = async (strength) => {
    await slider.press('Home');
    for (let value = 12; value < strength; value++) await slider.press('ArrowRight');
    await expect(slider).toHaveValue(String(strength));
  };
  const input = page.getByLabel('Tell your buddy what to do', { exact: true });
  await input.fill('Keep this pearl preview draft.');
  await input.evaluate((element) => {
    window.__pearlDraftInput = element;
  });
  await material.getByRole('button', { name: 'Current', exact: true }).click();
  await expect(input).toHaveValue('Keep this pearl preview draft.');
  await material.getByRole('button', { name: 'Pearl study', exact: true }).click();
  await setStrength(18);
  await expect(input).toHaveValue('Keep this pearl preview draft.');
  assert.equal(
    await input.evaluate((element) => element === window.__pearlDraftInput),
    true,
    'Material and strength changes preserve the mounted panel and typed draft.',
  );
  await page.evaluate(() => {
    delete window.__pearlDraftInput;
  });
  await input.fill('');
  await setStrength(40);
  report.draftPreservation = { materialToggle: true, strengthChange: true, sameMountedInput: true };
  const textureResponse = await context.request.get(`${base}${texturePath}`);
  assert.ok(textureResponse.ok(), 'Generated material asset is served.');
  const served = await textureResponse.body();
  assert.equal(digest(served), report.source[`public${texturePath}`]);
  report.servedTexture = {
    status: textureResponse.status(),
    bytes: served.length,
    sha256: digest(served),
  };
  await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
  }, texturePath);

  for (const background of ['light', 'dark', 'busy']) {
    await page.getByRole('button', { name: background, exact: true }).click();
    await expect(page.locator('.panel-preview-scene')).toHaveClass(
      new RegExp(`background-${background}`),
    );
    for (const strength of [0, 18, 26, 34, 40]) {
      await material
        .getByRole('button', { name: strength ? 'Pearl study' : 'Current', exact: true })
        .click();
      if (strength) await setStrength(strength);
      const style = await materialStyle(page);
      if (strength) {
        check(
          style.image.includes(texturePath),
          `${background}/${strength}: texture must be present`,
        );
        check(
          Math.abs(style.opacity - strength / 100) < 0.001,
          `${background}/${strength}: requested texture opacity`,
        );
        check(
          style.pointerEvents === 'none',
          `${background}/${strength}: texture cannot intercept input`,
        );
      } else
        check(
          !style.image.includes(texturePath),
          `${background}: current comparison excludes texture`,
        );
      const name = `${background}-${strength ? `pearl-${strength}` : 'current'}`;
      const evidence = await captureContrast(page, name, strength === 0 || strength === 40);
      report.cases.push({ background, strength, style, ...evidence });
      console.log(
        `${name}: minimum reading contrast ${evidence.minimumReadingContrast.toFixed(2)}:1`,
      );
    }
  }

  await setStrength(40);
  await page.getByRole('button', { name: 'light', exact: true }).click();
  await input.focus();
  await page.keyboard.press('Tab');
  await expect(root.getByRole('button', { name: 'Ideas', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const toolsButton = root.getByRole('button', { name: 'Tools', exact: true });
  await expect(toolsButton).toBeFocused();
  report.keyboardFocus = await toolsButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });
  check(
    report.keyboardFocus.focusVisible &&
      report.keyboardFocus.outlineStyle !== 'none' &&
      parseFloat(report.keyboardFocus.outlineWidth) >= 2,
    'Keyboard focus has a visible outline.',
  );
  await root.screenshot({ path: file('keyboard-focus') });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Tools', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolsButton).toBeFocused();

  await page.setViewportSize({ width: 320, height: 1100 });
  await checkLayout(page, 'narrow-320');
  await page.getByLabel('Large text', { exact: true }).check();
  await expect(root.locator('.buddy-message p').first()).toHaveCSS('font-size', '22px');
  await checkLayout(page, 'narrow-320-large-text');
  await page.getByLabel('Large text', { exact: true }).uncheck();
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await checkLayout(page, 'css-zoom-200-percent');
  await input.fill('A readable draft at 200 percent.');
  await expect(input).toHaveValue('A readable draft at 200 percent.');
  await input.fill('');
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('zoom');
  });
  await page.setViewportSize({ width: 1040, height: 1280 });

  // Real WebGL stays present. Only the decorative plane may change geometry.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'busy', exact: true }).click();
  await root.scrollIntoViewIfNeeded();
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  await page.mouse.move(1, 1);
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  const neutral = await contentGeometry(page);
  for (const sample of neutral) {
    assert.ok(sample.elements.length, `${sample.selector} has content to check.`);
    for (const element of sample.elements) assert.deepEqual(element.transformedAncestors, []);
  }
  const bounds = await root.boundingBox();
  for (const direction of ['left', 'right']) {
    await page.mouse.move(
      bounds.x + (direction === 'left' ? 8 : bounds.width - 8),
      bounds.y + bounds.height / 2,
    );
    await expect(plane).toHaveAttribute('data-tilt', 'active');
    await expect.poll(() => plane.evaluate((element) => element.style.willChange)).toBe('');
    const geometry = await contentGeometry(page);
    assert.deepEqual(
      geometry,
      neutral,
      'Tilt cannot move text, controls or the live Sprout canvas.',
    );
    const transform = await plane.evaluate((element) => getComputedStyle(element).transform);
    assert.notEqual(transform, 'none');
    await root.screenshot({ path: file(`tilt-${direction}`) });
    report.tilt.push({ direction, transform, contentGeometryUnchanged: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(plane).toHaveAttribute('data-tilt', 'neutral');
  check(
    await plane.evaluate((element) => element.style.transform === 'none'),
    'Reduced motion stops decorative tilt.',
  );
  report.reducedMotion = { tilt: 'neutral', material: await materialStyle(page) };

  const cdp = await context.newCDPSession(page);
  for (const feature of [
    { name: 'prefers-reduced-transparency', value: 'reduce' },
    { name: 'prefers-contrast', value: 'more' },
    { name: 'forced-colors', value: 'active' },
  ]) {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [feature, { name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    assert.equal(
      await page.evaluate(({ name, value }) => matchMedia(`(${name}: ${value})`).matches, feature),
      true,
    );
    const style = await materialStyle(page);
    check(
      style.image === 'none' ||
        style.opacity === 0 ||
        style.display === 'none' ||
        style.glassDisplay === 'none',
      `${feature.name}: accessibility preference hides generated texture`,
    );
    await root.screenshot({ path: file(feature.name) });
    report.preferences.push({ feature, style });
  }
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await cdp.detach();

  report.microphoneCalls = await page.evaluate(() => window.__pearlMicCalls);
  check(report.microphoneCalls === 0, 'Preview must not request microphone access.');
  check(report.apiRequests.length === 0, 'Preview must not call an API.');
  check(report.externalRequests.length === 0, 'Preview must not request an external service.');
  check(report.pageErrors.length === 0, 'Preview must have no page errors.');
  report.status = report.failures.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  if (page) {
    try {
      await page.screenshot({ path: file('failure-context'), fullPage: true });
    } catch {}
  }
} finally {
  if (page) {
    try {
      report.microphoneCalls = await page.evaluate(() => window.__pearlMicCalls);
    } catch {}
  }
  await browser.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      status: report.status,
      report: path.join(output, 'report.json'),
      materialCases: report.cases.length,
      failures: report.failures,
      error: report.error,
    },
    null,
    2,
  ),
);
if (report.status !== 'passed') process.exitCode = 1;
