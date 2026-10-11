import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function preparePanel(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    const preview = window as any;
    preview.panelCalls = [];
    preview.panelWaiters = [];
    preview.delayPanel = false;
    preview.rejectPanel = false;
    preview.insightos = {
      platform: 'win32',
      desktopShortcuts: async () => ({ voice: false, stop: false }),
      onDesktopCommand: () => () => {},
      setBuddyMode: async (mode: string, requestId: number) => {
        preview.panelCalls.push(mode);
        if (mode === 'panel' && preview.rejectPanel) throw new Error('Native resize unavailable.');
        if (mode === 'panel' && preview.delayPanel)
          await new Promise<void>((resolve) => preview.panelWaiters.push(resolve));
        return {
          mode,
          requestId,
          bounds: { x: 0, y: 0, width: innerWidth, height: innerHeight },
          viewport: { width: innerWidth, height: innerHeight },
        };
      },
    };
  });
  const requests: string[] = [];
  const empty = { folder: null, code: null, browser: null, screen: null };
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') requests.push(pathname);
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true, pythonConfigured: true, editorConfigured: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: true, ttsConfigured: true },
            databricks: { configured: false },
            neon: { configured: false },
            vultr: { configured: false },
          },
        },
      });
    if (pathname === '/api/computer/request')
      return route.fulfill({
        json: { state: empty, summary: 'A local panel test response.\n'.repeat(28) },
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
  await page.goto('/?desktop=buddy');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  return requests;
}

const pet = (page: Page) => page.locator('.buddy-face');
const composer = (page: Page) => page.getByRole('textbox', { name: 'Tell your buddy what to do' });

test('native acknowledgement gates the readable panel, which preserves draft, selection and scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 408, height: 672 });
  const requests = await preparePanel(page);
  await page.evaluate(() => {
    (window as any).delayPanel = true;
  });
  await pet(page).click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'preparing-open');
  await expect(pet(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(composer(page)).toHaveCount(0);
  await page.evaluate(() => {
    const preview = window as any;
    preview.delayPanel = false;
    preview.panelWaiters.shift()();
  });
  await expect(composer(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Collapse conversation', exact: true }),
  ).toBeFocused();
  expect(await page.locator('.buddy-feed').evaluate((element) => element.scrollTop)).toBe(0);
  await composer(page).fill('Make a local summary');
  await composer(page).press('Enter');
  await expect(page.locator('.buddy-message.assistant')).toContainText(
    'A local panel test response',
  );
  await composer(page).fill('Keep this draft while we talk.');
  await composer(page).evaluate((element) =>
    (element as HTMLTextAreaElement).setSelectionRange(5, 15),
  );
  await page.locator('.buddy-feed').evaluate((element) => {
    element.scrollTop = 160;
    element.dispatchEvent(new Event('scroll'));
  });
  await composer(page).press('Escape');
  await expect(pet(page)).toBeFocused();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await expect(composer(page)).toHaveCount(0);
  await pet(page).press('Enter');
  await expect(composer(page)).toHaveValue('Keep this draft while we talk.');
  expect(
    await composer(page).evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      return [input.selectionStart, input.selectionEnd];
    }),
  ).toEqual([5, 15]);
  expect(
    await page.locator('.buddy-feed').evaluate((element) => element.scrollTop),
  ).toBeGreaterThanOrEqual(159);
  await expect(page.locator('#buddy-request')).toHaveCount(1);
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
  expect(requests).not.toContain('/api/computer/stop');
  // Accessibility scanning is independent of the renderer's active-motion proof.
  await page.getByRole('button', { name: 'Pause avatar motion' }).click();
  await expect(page.getByRole('button', { name: 'Resume avatar motion' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('cancelled opening and reversed exit converge on the last keyboard intent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 408, height: 672 });
  await preparePanel(page);
  await page.evaluate(() => {
    (window as any).delayPanel = true;
  });
  await pet(page).press('Enter');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'preparing-open');
  await pet(page).press('Space');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await page.evaluate(() => {
    const preview = window as any;
    preview.delayPanel = false;
    preview.panelWaiters.shift()();
  });
  await expect(pet(page)).toHaveAttribute('aria-expanded', 'false');
  await pet(page).press('Enter');
  await expect(composer(page)).toBeVisible();
  await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
  await pet(page).press('Enter');
  await expect(composer(page)).toBeVisible();
  await page.waitForTimeout(260); // Allow an obsolete 160ms exit to attempt its completion.
  expect(await page.evaluate(() => (window as any).panelCalls.at(-1))).toBe('panel');
  await expect(pet(page)).toHaveAttribute('aria-expanded', 'true');
});

test('a rejected native expansion stays usable and can be retried', async ({ page }) => {
  await preparePanel(page);
  await page.evaluate(() => {
    (window as any).rejectPanel = true;
  });
  await pet(page).click();
  await expect(page.getByRole('alert')).toHaveAttribute('aria-label', /Native resize unavailable/);
  await expect(page.getByRole('alert')).toHaveText('Try opening again.');
  await expect(pet(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(composer(page)).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).rejectPanel = false;
  });
  await pet(page).press('Enter');
  await expect(composer(page)).toBeVisible();
});

test('reduced-motion narrow panel remains readable without WebGL or voice calls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 480 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...options: unknown[]
    ) {
      return kind.startsWith('webgl') ? null : original.apply(this, [kind, ...options] as any);
    } as typeof original;
  });
  const requests = await preparePanel(page);
  await pet(page).click();
  await expect(composer(page)).toBeVisible();
  await composer(page).fill('A calm static companion.');
  await expect(page.locator('.buddy-face .insight-signal')).toHaveAttribute(
    'data-renderer',
    'fallback',
  );
  await page.getByRole('button', { name: 'Pause avatar motion' }).click();
  await expect(page.getByRole('button', { name: 'Resume avatar motion' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const send = await page.getByRole('button', { name: 'Send request', exact: true }).boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(480);
  expect(send!.width).toBeGreaterThanOrEqual(44);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await composer(page).press('Escape');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
});
