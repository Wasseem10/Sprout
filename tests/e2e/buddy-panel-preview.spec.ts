import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('actual panel preview keeps all simulated interactions local and readable', async ({
  page,
}) => {
  const apiCalls: string[] = [];
  await page.route('**/api/**', async (route) => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  // Only the actual selected binary may satisfy this WebGL panel proof.
  // An older model remains a production fallback, but cannot pass this regression.
  await page.route('**/buddy/*.glb', (route) =>
    new URL(route.request().url()).pathname === '/buddy/sprout-v003.glb'
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    localStorage.setItem('insightos.buddyMotionPaused', 'true');
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        throw new Error('The visual preview must never request microphone access.');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?studio=panel');
  const panel = page.locator('.buddy');
  await expect(panel).toHaveAttribute('data-panel-stage', 'open');
  await expect(panel.locator('.insight-signal')).toHaveAttribute('data-renderer', 'webgl');
  await page.getByLabel('Large text', { exact: true }).check();
  await expect(panel.locator('.buddy-message p').first()).toHaveCSS('font-size', '22px');
  await page.getByLabel('Large text', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Listening');
  await page.getByRole('button', { name: 'Stop task and audio' }).click();
  await expect(panel.getByRole('status')).toContainText('Ready');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Tools', exact: true }).getByRole('button'),
  ).toHaveCount(6);
  await page.getByRole('button', { name: 'Tools', exact: true }).press('Escape');
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Ideas', exact: true }).click();
  await page.getByRole('button', { name: 'Open Calculator', exact: true }).click();
  const input = page.getByLabel('Tell your buddy what to do');
  await expect(input).toHaveValue('Open Calculator');
  await input.fill('Keep this preview draft.');
  await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
  await expect(panel).toHaveAttribute('data-panel-stage', 'closed');
  await page.getByRole('button', { name: /^Expand buddy/ }).click();
  await expect(panel).toHaveAttribute('data-panel-stage', 'open');
  await expect(input).toHaveValue('Keep this preview draft.');
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByText(/Sample reply: your message stays/)).toBeVisible();

  for (const background of ['light', 'dark', 'busy']) {
    await page.getByRole('button', { name: background, exact: true }).click();
    await expect(page.locator('.panel-preview-scene')).toHaveClass(
      new RegExp(`background-${background}`),
    );
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(apiCalls).toEqual([]);
  expect(errors).toEqual([]);
});
