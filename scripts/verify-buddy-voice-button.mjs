// Actual standalone/embedded preview hosts, simulated phases, no voice/provider owner.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'artifacts/glass-panel-v005/voice-hosts';
await mkdir(output, { recursive: true });
const L = (rgb) =>
  rgb
    .map((value) => value / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (foreground, background) => {
  const rgb = (value) =>
    value
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
  const values = [L(rgb(foreground)), L(rgb(background))].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const results = [],
  api = [],
  errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
    reducedMotion: 'reduce',
  });
  context.setDefaultTimeout(5000);
  await context.addInitScript(() => {
    localStorage.setItem('insightos.buddyMotionPaused', 'true');
    window.__voiceButtonMicCalls = 0;
    if (navigator.mediaDevices)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.__voiceButtonMicCalls++;
          throw new Error('Preview must not request a microphone.');
        },
      });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind.startsWith('webgl') ? null : getContext.call(this, kind, ...args);
    };
  });
  await context.route('**/api/**', (route) => {
    api.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const base = process.env.INSIGHTOS_PROOF_URL || 'http://127.0.0.1:5173';
  for (const host of ['standalone', 'embedded']) {
    await page.goto(base + (host === 'standalone' ? '/?studio=panel' : '/?studio=buddy'));
    if (host === 'embedded')
      await page.getByRole('button', { name: 'Expand conversation preview', exact: true }).click();
    const panel = page.locator('.buddy');
    await expect(panel).toHaveAttribute('data-panel-stage', 'open');
    for (const phase of ['idle', 'listening', 'speaking']) {
      if (host === 'standalone')
        await page.getByRole('combobox').selectOption(phase);
      else
        await page
          .getByRole('button', { name: phase[0].toUpperCase() + phase.slice(1), exact: true })
          .click();
      const button = panel.locator('.buddy-play');
      await expect(button).toHaveAttribute('data-phase', phase);
      for (const interaction of ['normal', 'hover', 'focus']) {
        await page.mouse.move(0, 0);
        if (interaction === 'hover') await button.hover();
        if (interaction === 'focus') await button.focus();
        const metrics = await button.evaluate((element) => {
          const rect = element.getBoundingClientRect(),
            svg = element.querySelector('svg').getBoundingClientRect(),
            style = getComputedStyle(element);
          return {
            name: element.getAttribute('aria-label'),
            pressed: element.getAttribute('aria-pressed'),
            disabled: element.disabled,
            width: rect.width,
            height: rect.height,
            padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
            foreground: style.color,
            background: style.backgroundColor,
            centre: [
              svg.x + svg.width / 2 - rect.x - rect.width / 2,
              svg.y + svg.height / 2 - rect.y - rect.height / 2,
            ],
          };
        });
        const ratio = contrast(metrics.foreground, metrics.background);
        assert.deepEqual(metrics.centre, [0, 0]);
        assert.deepEqual(metrics.padding, ['0px', '0px', '0px', '0px']);
        assert.equal(metrics.width, 44);
        assert.equal(metrics.height, 44);
        assert.ok(ratio >= 3);
        assert.equal(metrics.disabled, false);
        assert.equal(
          metrics.name,
          phase === 'idle' ? 'Start voice conversation' : 'Pause voice conversation',
        );
        assert.equal(metrics.pressed, phase === 'idle' ? 'false' : 'true');
        results.push({ host, phase, interaction, ...metrics, iconContrast: ratio });
      }
      if (phase === 'speaking') await panel.screenshot({ path: `${output}/${host}-speaking.png` });
    }
    assert.equal(await page.evaluate(() => window.__voiceButtonMicCalls), 0);
  }
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    results,
    api,
    errors,
    limits: [
      'Actual local preview hosts and browser-computed geometry/colours. No actual microphone, AI, native compositor or physical assistive technology.',
      'Enabled icon contrast uses opaque computed foreground/background colours; antialiased edge pixels are not the contrast definition. Native and forced-colour checks remain separately scoped.',
    ],
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        checkedAt: report.checkedAt,
        cases: results.length,
        minContrast: Math.min(...results.map((result) => result.iconContrast)),
        api,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
