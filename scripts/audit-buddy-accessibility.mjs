// Bounded HTML audit. Native bounds and the actual GPU asset are proved separately.
// All API responses are local fixtures; this script opens no microphone/provider session.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { newEnergyState } from '../dist-server/shared/energy-calculations.js';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ args: ['--disable-gpu'] });
try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 480 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    localStorage.setItem('insightos.buddyMotionPaused', 'true');
    localStorage.setItem('insightos.largeText', 'false');
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
      return kind.startsWith('webgl') ? null : original.apply(this, [kind, ...options]);
    };
  });
  const empty = { folder: null, code: null, browser: null, screen: null };
  const energy = newEnergyState();
  const requests = [];
  await context.route('**/api/**', (route) => {
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
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: {
          state: empty,
          summary: 'A local HTML audit response. ' + 'LongUnbrokenText'.repeat(20),
        },
      });
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
  const tree = async (target) => {
    const session = await context.newCDPSession(target);
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
  };
  const layout = (target) =>
    target.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      rootWidth: document.documentElement.scrollWidth,
      bodyFont: getComputedStyle(
        document.querySelector('.buddy-welcome p') ?? document.querySelector('.buddy-message p'),
      ).fontSize,
      feed: (() => {
        const e = document.querySelector('.buddy-feed');
        return { clientHeight: e.clientHeight, scrollHeight: e.scrollHeight };
      })(),
      controls: [...document.querySelectorAll('.buddy button')]
        .filter((e) => e.checkVisibility())
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            name: e.getAttribute('aria-label') ?? e.textContent.trim(),
            disabled: e.disabled,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
        }),
    }));
  const contrast = (target) =>
    target.evaluate(() => {
      const rgba = (value) => {
        const v = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
        return [v[0], v[1], v[2], v[3] ?? 1];
      };
      const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      const luminance = (rgb) =>
        rgb
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (fg, bg) => {
        const a = luminance(fg),
          b = luminance(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      function measure(element, pseudo) {
        const style = getComputedStyle(element, pseudo);
        let backgrounds = [
          [0, 0, 0],
          [255, 255, 255],
        ];
        const layers = [],
          ancestors = [];
        for (let current = element; current; current = current.parentElement)
          ancestors.unshift(current);
        let opacity = 1;
        for (const current of ancestors) {
          const s = getComputedStyle(current);
          opacity *= Number(s.opacity);
          const color = rgba(s.backgroundColor);
          if (color[3] > 0) backgrounds = backgrounds.map((bg) => blend(color, bg));
          if (s.backgroundImage !== 'none') {
            const colors = [...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) =>
              rgba(m[0]),
            );
            // A conservative channel envelope for these pale gradients, not a glyph-pixel sample.
            if (colors.length && colors.every((c) => c[3] === 1))
              backgrounds = [[0, 1, 2].map((i) => Math.min(...colors.map((c) => c[i])))];
            layers.push({ node: current.className, backgroundImage: s.backgroundImage });
          }
        }
        const foreground = rgba(style.color);
        foreground[3] *= opacity;
        const ratios = backgrounds.map((bg) => ratio(blend(foreground, bg), bg));
        return {
          tag: element.tagName,
          className: element.className,
          pseudo: pseudo ?? null,
          text: (pseudo ? element.getAttribute('placeholder') : element.textContent.trim()).slice(
            0,
            120,
          ),
          color: style.color,
          opacity,
          backgrounds,
          fontSize: style.fontSize,
          ratio: Math.min(...ratios),
          sustainedReading:
            !!pseudo ||
            element.matches(
              '.buddy-welcome p, .buddy-message p, .buddy-composer textarea, .energy-panel p, .energy-panel a',
            ),
          gradientEnvelope: layers,
          disabled: !!element.closest(':disabled'),
        };
      }
      const elements = [...document.querySelectorAll('.buddy *')].filter(
        (e) =>
          e.checkVisibility() &&
          !e.closest('[aria-hidden="true"]') &&
          [...e.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
          ) &&
          !e.classList.contains('sr-only'),
      );
      const results = elements.map((e) => measure(e));
      const input = document.querySelector('.buddy-composer textarea');
      if (input && input.checkVisibility())
        results.push(measure(input), measure(input, '::placeholder'));
      return results;
    });
  await page.goto('http://127.0.0.1:5173/?desktop=buddy');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  const closedTree = await tree(page);
  assert.ok(!closedTree.some((n) => n.role === 'textbox' || n.role === 'log'));
  await page.locator('.buddy-face').press('Enter');
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await expect(input).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Collapse conversation', exact: true }),
  ).toBeFocused();
  const welcome = {
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
  assert.ok(!collapsedAfterConversation.some((n) => n.role === 'textbox' || n.role === 'log'));
  await page.locator('.buddy-face').press('Enter');
  await expect(input).toHaveValue('Preserve this audit draft.');
  await page.getByRole('button', { name: 'Settings and connections', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Large text', exact: true }).check();
  const settingsTree = await tree(page);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.buddy-shell')).toHaveClass(/large-text/);
  const largeText = { layout: await layout(page), contrast: await contrast(page) };
  const energyPage = await context.newPage();
  await energyPage.goto('http://127.0.0.1:5173/?desktop=buddy&workspace=energy');
  await energyPage.locator('.buddy-face').press('Enter');
  await expect(energyPage.locator('.energy-panel')).toBeVisible();
  await energyPage.locator('.energy-panel summary').click();
  const energyDetails = {
    layout: await layout(energyPage),
    contrast: await contrast(energyPage),
    tree: await tree(energyPage),
  };
  await page.emulateMedia({ forcedColors: 'active' });
  const forcedColors = await page.locator('.buddy-panel').evaluate((e) => ({
    color: getComputedStyle(e).color,
    background: getComputedStyle(e).backgroundColor,
  }));
  for (const entry of [welcome, conversation, largeText, energyDetails]) {
    assert.equal(entry.layout.rootWidth, 320);
    assert.ok(entry.layout.controls.every((c) => c.width >= 44 && c.height >= 44));
    for (const reading of entry.contrast.filter((r) => r.sustainedReading && !r.disabled))
      assert.ok(reading.ratio >= 7, `${reading.tag} ${reading.text}: ${reading.ratio}:1 < 7:1`);
  }
  assert.ok(!requests.some((r) => r.pathname.includes('/voice/')));
  const report = {
    checkedAt: new Date().toISOString(),
    assetSha256: createHash('sha256')
      .update(await readFile('public/buddy/sprout-v002.glb'))
      .digest('hex'),
    browser: browser.version(),
    scope:
      'Actual current HTML/styles in Chromium at320CSSpx, noWebGL static fallback, localAPI fixtures, no microphone/provider calls.',
    method:
      'W3C sRGB relative luminance from computed foreground and ancestor backgrounds; alpha composited against black/white envelope; pale gradient channel envelope is conservative. This is not a glyph-antialiasing or physical-display measurement.',
    references: [
      'https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html',
      'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
      'https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/',
    ],
    closedTree,
    welcome,
    conversation,
    collapsedAfterConversation,
    settingsTree,
    largeText,
    energyDetails,
    forcedColors,
    requests,
    limits: [
      'Browser AX-tree and keyboard focus evidence, not a physical screen-reader session.',
      'Native200% zoom is covered by the separate Electron proof; this run covers320CSSpx and the actual Large text setting.',
      'Optional data table is intentionally horizontally scrollable; global two-axis overflow is forbidden.',
      'This run measures presented states; it is not a blanket WCAG certification or every hover/pressed/error state.',
    ],
  };
  await writeFile(
    'artifacts/buddy-accessibility-audit.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        checkedAt: report.checkedAt,
        cases: [welcome, conversation, largeText, energyDetails].map((c) => ({
          width: c.layout.rootWidth,
          fontSize: c.layout.bodyFont,
          below7: c.contrast
            .filter((r) => !r.disabled && r.ratio < 7)
            .map((r) => ({ text: r.text, ratio: r.ratio })),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
