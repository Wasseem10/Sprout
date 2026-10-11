import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const previewStates = [
  ['Idle', 'idle'],
  ['Listening', 'listening'],
  ['Thinking', 'thinking'],
  ['Speaking', 'speaking'],
  ['Done', 'success'],
] as const;

function signal(page: Page) {
  return page.locator('.studio-launcher .insight-signal');
}

async function openStudio(page: Page) {
  await page.goto('/?studio=buddy');
  await expect(page.getByRole('button', { name: 'Expand conversation preview' })).toBeVisible();
}

async function expectWebGL(page: Page) {
  await expect(signal(page)).toHaveAttribute('data-renderer', 'webgl', { timeout: 30000 });
}

async function expectStaticFrames(visual: Locator, explanation: string) {
  const first = await visual.screenshot();
  // Compare actual rendered pixels across a meaningful animation interval, without a GPU-specific snapshot.
  await visual.page().waitForTimeout(450);
  const second = await visual.screenshot();
  expect(first.equals(second), explanation).toBe(true);
}

test('studio previews five states and preserves a keyboard-controlled conversation without API calls', async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });
  await openStudio(page);
  await expectWebGL(page);
  // This case verifies controls and semantics; animation itself is checked separately below.
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.getByText('All states are simulated.', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Insight', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Expand conversation preview' }).click();
  const close = page.getByRole('button', { name: 'Close conversation panel' });
  await expect(close).toBeFocused();
  await page.getByLabel('Preview the message field').fill('Keep this local preview draft.');
  await expect(
    page.getByRole('button', { name: 'Send unavailable in visual preview' }),
  ).toBeDisabled();
  await page.getByLabel('Preview the message field').press('Escape');
  const launcher = page.getByRole('button', { name: 'Expand conversation preview' });
  await expect(launcher).toBeFocused();
  await launcher.press('Enter');
  await expect(page.getByLabel('Preview the message field')).toHaveValue(
    'Keep this local preview draft.',
  );

  for (const [label, phase] of previewStates) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.insight-signal')).toHaveCount(2);
    for (const visual of await page.locator('.insight-signal').all()) {
      await expect(visual).toHaveAttribute('data-phase', phase);
      await expect(visual).toHaveAttribute('data-renderer', 'webgl');
    }
    await expect(page.getByRole('status')).toContainText(label);
    await expect(page.getByText(`${label} preview`, { exact: true })).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(apiCalls).toEqual([]);
});

test('pause and system reduced motion keep the authored WebGL model still', async ({ page }) => {
  await openStudio(page);
  await expectWebGL(page);
  await page.getByRole('button', { name: 'Thinking', exact: true }).click();
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.getByRole('button', { name: 'Resume motion' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectStaticFrames(
    signal(page),
    'Pausing motion must keep rendered model pixels unchanged.',
  );

  await page.getByRole('button', { name: 'Resume motion' }).click();
  const moving = await signal(page).screenshot();
  await page.waitForTimeout(450);
  expect(
    moving.equals(await signal(page).screenshot()),
    'Resuming motion must restart the model animation.',
  ).toBe(false);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectStaticFrames(
    signal(page),
    'The system reduced-motion setting must stop model animation.',
  );
  await page.getByRole('button', { name: 'Listening', exact: true }).click();
  await expect(signal(page)).toHaveAttribute('data-phase', 'listening');
  await expectStaticFrames(
    signal(page),
    'State selection must remain usable while reduced motion stays static.',
  );
});

test('a GPU failure uses the authored PNG and leaves preview controls usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, type: string, ...options: unknown[]) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
        return Reflect.apply(original, this, [type, ...options]);
      },
    });
  });
  await openStudio(page);
  const authoredImage = signal(page).locator('.signal-authored-image');
  await expect(authoredImage).toBeVisible();
  await expect
    .poll(() => authoredImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(signal(page)).toHaveAttribute('data-renderer', 'fallback');
  await page.getByRole('button', { name: 'Listening', exact: true }).click();
  await expect(signal(page)).toHaveAttribute('data-phase', 'listening');
  await page.getByRole('button', { name: 'Expand conversation preview' }).click();
  await expect(page.getByRole('button', { name: 'Close conversation panel' })).toBeFocused();
  await page.getByLabel('Preview the message field').fill('Usable without a GPU.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Done');
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.getByRole('button', { name: 'Resume motion' })).toBeVisible();
  await page.getByRole('button', { name: 'Close conversation panel' }).click();
  await expect(page.getByRole('button', { name: 'Expand conversation preview' })).toBeFocused();
  await expect(authoredImage).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('a lost WebGL context falls back to the PNG and recovers its animated model', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openStudio(page);
  await expectWebGL(page);
  const visual = signal(page);
  const contextLoss = await visual
    .locator('.signal-canvas')
    .evaluateHandle((canvas) =>
      (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context'),
    );
  expect(
    await contextLoss.evaluate((extension) => Boolean(extension)),
    'The test GPU must support controlled context loss.',
  ).toBe(true);
  await contextLoss.evaluate((extension) => extension!.loseContext());
  await expect(visual).toHaveAttribute('data-renderer', 'fallback');
  const authoredImage = visual.locator('.signal-authored-image');
  await expect(authoredImage).toBeVisible();
  await expect
    .poll(() => authoredImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Expand conversation preview' }).click();
  await expect(page.getByRole('button', { name: 'Close conversation panel' })).toBeFocused();
  await page.getByLabel('Preview the message field').fill('Still here during graphics recovery.');
  await page.getByRole('button', { name: 'Thinking', exact: true }).click();
  await expect(visual).toHaveAttribute('data-phase', 'thinking');
  await expect(visual).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('status')).toContainText('Thinking');

  await contextLoss.evaluate((extension) => extension!.restoreContext());
  await expectWebGL(page);
  await expect(authoredImage).toBeHidden();
  const recoveredFrame = await visual.screenshot();
  await page.waitForTimeout(450);
  expect(
    recoveredFrame.equals(await visual.screenshot()),
    'Restoring the GPU context must resume the rendered model animation.',
  ).toBe(false);
  await page.getByRole('button', { name: 'Close conversation panel' }).click();
  await expect(page.getByRole('button', { name: 'Expand conversation preview' })).toBeFocused();
  await page.getByRole('button', { name: 'Expand conversation preview' }).click();
  await expect(page.getByLabel('Preview the message field')).toHaveValue(
    'Still here during graphics recovery.',
  );
  expect(errors).toEqual([]);
  await contextLoss.dispose();
});
