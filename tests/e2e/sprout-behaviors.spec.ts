import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const assetVersion = process.env.INSIGHTOS_PROOF_ASSET_VERSION ?? 'v005';
const output = path.resolve(
  'artifacts',
  process.env.INSIGHTOS_PROOF_TAG ?? 'glass-sprout-v005',
  'browser',
);

test('authored joy, sleep/Zs, wake and Done use actual controller states', async ({ page }) => {
  test.setTimeout(45000);
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1500, height: 1200 });
  const calls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(request.url());
  });
  await page.goto(`/?studio=buddy&asset=sprout-${assetVersion}`);
  const signal = page.locator('.studio-launcher .insight-signal');
  await expect(signal).toHaveAttribute('data-renderer', 'webgl');
  const click = async (label: string) => {
    // Keep the avatar visible while driving labelled simulation controls.
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeEnabled();
    await button.evaluate((element) => (element as HTMLButtonElement).click());
  };
  await click('Celebrate');
  await expect(signal).toHaveAttribute('data-behavior', 'joy');
  await page.waitForTimeout(460);
  await signal.screenshot({ path: path.join(output, 'joy-96.png') });
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  await click('Sleep');
  await expect(signal).toHaveAttribute('data-behavior', 'sleep');
  await expect(signal.locator('.signal-sleep-zs')).toBeVisible();
  await expect(signal.locator('.signal-sleep-zs > span')).toHaveCount(3);
  await signal.screenshot({ path: path.join(output, 'sleep-96.png') });
  await click('Pause motion');
  await expect(signal.locator('.signal-sleep-zs')).toHaveAttribute('data-moving', 'false');
  const still = await signal.screenshot();
  await page.waitForTimeout(400);
  expect(still.equals(await signal.screenshot())).toBe(true);
  await click('Resume motion');
  await click('Wake');
  await expect(signal.locator('.signal-sleep-zs')).toHaveCount(0);
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  await click('Listening');
  await expect(page.getByRole('button', { name: 'Sleep', exact: true })).toBeDisabled();
  await click('Done');
  await expect(signal).toHaveAttribute('data-done', 'true');
  await expect(signal).toHaveAttribute('data-phase', 'listening');
  await expect(signal).not.toHaveAttribute('data-done', 'true');
  await click('Speaking');
  await click('Done');
  await expect(signal).toHaveAttribute('data-done', 'true');
  await click('Thinking');
  await expect(signal).not.toHaveAttribute('data-done', 'true');
  await click('Idle');
  await click('Sleep');
  await expect(signal).toHaveAttribute('data-behavior', 'enter-sleep');
  await click('Speaking');
  await expect(signal.locator('.signal-sleep-zs')).toHaveCount(0);
  await expect(signal).toHaveAttribute('data-phase', 'speaking');
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await click('Idle');
  await click('Sleep');
  await expect(signal).toHaveAttribute('data-behavior', 'sleep');
  await expect(signal.locator('.signal-sleep-zs')).toHaveAttribute('data-moving', 'false');
  await signal.screenshot({ path: path.join(output, 'sleep-reduced-96.png') });
  const contextLoss = await signal
    .locator('canvas')
    .evaluateHandle((canvas) =>
      (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context'),
    );
  expect(await contextLoss.evaluate((extension) => Boolean(extension))).toBe(true);
  await contextLoss.evaluate((extension) => extension!.loseContext());
  await expect(signal).toHaveAttribute('data-renderer', 'fallback');
  await expect(signal.locator('.signal-authored-image')).toHaveAttribute(
    'src',
    `/buddy/sprout-${assetVersion}-sleep.png`,
  );
  await expect
    .poll(() => signal.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(640);
  await signal.screenshot({ path: path.join(output, 'sleep-context-loss-96.png') });
  await contextLoss.dispose();
  expect(calls).toEqual([]);
});

test('production adapter acknowledges fresh task completion once, including clarification results', async ({
  page,
}) => {
  test.setTimeout(45000);
  const empty = { folder: null, code: null, browser: null, screen: null };
  const task = (id: string, status = 'completed') => ({
    id,
    status,
    goal: 'Fixture task',
    message: 'Fixture',
    steps: [],
  });
  let outcome = task('fresh');
  await page.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    localStorage.setItem('insightos.buddyMotionPaused', 'false');
  });
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: true, ttsConfigured: false },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        },
      });
    if (pathname === '/api/computer/state')
      return route.fulfill({ json: { ...empty, task: task('hydrated') } });
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: {
          state: { ...empty, task: outcome },
          clarification: true,
          summary: 'A confirmed local fixture result.',
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('/?desktop=buddy');
  const signal = page.locator('.buddy .insight-signal');
  await expect(signal).toHaveAttribute('data-renderer', 'webgl');
  await expect(signal).not.toHaveAttribute('data-behavior', 'joy');
  await page.getByRole('button', { name: /^Expand buddy/ }).click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await signal.evaluate((element) => {
    const log: string[] = [];
    (window as unknown as { doneLog: string[] }).doneLog = log;
    new MutationObserver((events) => {
      if (
        events.some((event) => event.attributeName === 'data-behavior') &&
        element.getAttribute('data-behavior') === 'joy'
      )
        log.push('joy');
    }).observe(element, { attributes: true, attributeFilter: ['data-behavior'] });
  });
  const send = async () => {
    await page.getByLabel('Tell your buddy what to do').fill('Read this local fixture');
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page.locator('.buddy-message').last()).toContainText('confirmed local fixture');
  };
  const count = () =>
    page.evaluate(() => (window as unknown as { doneLog: string[] }).doneLog.length);
  await send();
  await expect.poll(count).toBe(1);
  await expect(signal).not.toHaveAttribute('data-behavior', 'joy');
  await send();
  await page.waitForTimeout(300);
  expect(await count()).toBe(1);
  outcome = task('failure', 'failed');
  await send();
  await page.waitForTimeout(300);
  expect(await count()).toBe(1);
  outcome = task('second-fresh');
  await send();
  await expect.poll(count).toBe(2);
});
