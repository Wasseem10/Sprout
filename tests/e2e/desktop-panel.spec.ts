import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function preparePanel(page: Page, nativeVisibility = false) {
  await page.addInitScript((withVisibility) => {
    localStorage.setItem('insightos.buddySpeech', 'false');
    const preview = window as any;
    preview.panelCalls = [];
    preview.panelWaiters = [];
    preview.delayPanel = false;
    preview.rejectPanel = false;
    preview.insightos = {
      platform: 'win32',
      desktopShortcuts: async () => ({ voice: false, stop: false }),
      onDesktopCommand: (listener: (command: string) => void) => {
        preview.desktopPanelCommand = listener;
        return () => {
          preview.desktopPanelCommand = undefined;
        };
      },
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
    if (withVisibility) {
      preview.panelVisibility = { visible: true, revision: 0 };
      preview.insightos.desktopVisibility = async () => preview.panelVisibility;
      preview.insightos.onDesktopVisibility = (callback: (snapshot: unknown) => void) => {
        preview.panelVisibilityListener = callback;
        return () => {
          preview.panelVisibilityListener = undefined;
        };
      };
    }
  }, nativeVisibility);
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
const tools = (page: Page) => page.getByRole('button', { name: 'Tools', exact: true });

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
  await tools(page).click();
  await page.getByRole('button', { name: 'Pause avatar motion' }).click();
  await tools(page).click();
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

test('workspace return preserves the compact draft, selection and manual reading position', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 408, height: 672 });
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
  await pet(page).press('Enter');
  await composer(page).fill('Make a local summary');
  await composer(page).press('Enter');
  await expect(page.locator('.buddy-message.assistant')).toContainText(
    'A local panel test response',
  );
  const draft = 'Keep this draft while we talk.';
  await composer(page).fill(draft);
  await composer(page).evaluate((element) =>
    (element as HTMLTextAreaElement).setSelectionRange(5, 15, 'backward'),
  );
  await page.locator('.buddy-feed').evaluate((element) => {
    element.scrollTop = 160;
    element.dispatchEvent(new Event('scroll'));
  });
  const readPosition = async () => ({
    selection: await composer(page).evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      return [input.selectionStart, input.selectionEnd, input.selectionDirection];
    }),
    scrollTop: await page.locator('.buddy-feed').evaluate((element) => element.scrollTop),
  });
  const before = await readPosition();
  expect(before.scrollTop).toBe(160);
  await tools(page).click();
  await page.getByRole('button', { name: 'Open full workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Return to desktop buddy ↗' }).click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await expect(composer(page)).toHaveCount(0);
  await pet(page).press('Enter');
  await expect(composer(page)).toHaveValue(draft);
  await expect(
    page.getByRole('button', { name: 'Collapse conversation', exact: true }),
  ).toBeFocused();
  const afterWorkspace = await readPosition();
  console.log('Workspace reading memory:', { before, afterWorkspace });
  expect(afterWorkspace).toEqual(before);
  // Ordinary disclosure close/reopen uses the same memory without remounting.
  await composer(page).press('Escape');
  await expect(pet(page)).toBeFocused();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await pet(page).press('Enter');
  await expect(composer(page)).toHaveValue(draft);
  expect(await readPosition()).toEqual(before);
  // A tray/native command bypasses the visible workspace action; cleanup captures it too.
  await composer(page).evaluate((element) =>
    (element as HTMLTextAreaElement).setSelectionRange(2, 11, 'forward'),
  );
  await page.locator('.buddy-feed').evaluate((element) => {
    element.scrollTop = 201;
    element.dispatchEvent(new Event('scroll'));
  });
  const beforeTray = await readPosition();
  await page.evaluate(() => (window as any).desktopPanelCommand('workspace'));
  await page.getByRole('button', { name: 'Return to desktop buddy ↗' }).click();
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await pet(page).press('Enter');
  await expect(composer(page)).toHaveValue(draft);
  await expect(
    page.getByRole('button', { name: 'Collapse conversation', exact: true }),
  ).toBeFocused();
  expect(await readPosition()).toEqual(beforeTray);
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
  expect(requests).not.toContain('/api/computer/stop');
});

test('native visibility finishes an in-flight panel exit while document visibility stays unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 408, height: 672 });
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
  const requests = await preparePanel(page, true);
  await pet(page).press('Enter');
  await expect(composer(page)).toBeVisible();
  await composer(page).fill('Keep the native-hidden draft.');
  const beforeHide = await page.evaluate(async () => {
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Collapse conversation"]')!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const stage = document.querySelector<HTMLElement>('.buddy')!.dataset.panelStage;
    const preview = window as any;
    preview.panelVisibility = { visible: false, revision: 1 };
    preview.panelVisibilityListener(preview.panelVisibility);
    return { stage, documentHidden: document.hidden };
  });
  expect(beforeHide).toEqual({ stage: 'closing', documentHidden: false });
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  expect(
    await page
      .locator('.buddy-panel-glass')
      .evaluate(
        (element) =>
          element.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
  ).toBe(0);
  await page.evaluate(() => {
    const preview = window as any;
    preview.panelVisibility = { visible: true, revision: 2 };
    preview.panelVisibilityListener(preview.panelVisibility);
  });
  await pet(page).press('Enter');
  await expect(composer(page)).toHaveValue('Keep the native-hidden draft.');
  await expect(
    page.getByRole('button', { name: 'Collapse conversation', exact: true }),
  ).toBeFocused();
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
  expect(requests).not.toContain('/api/computer/stop');
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
  await tools(page).click();
  await page.getByRole('button', { name: 'Pause avatar motion' }).click();
  await tools(page).click();
  await expect(page.getByRole('button', { name: 'Resume avatar motion' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const send = await page.getByRole('button', { name: 'Send request', exact: true }).boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(480);
  expect(send!.width).toBeGreaterThanOrEqual(44);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Resume avatar motion' }).press('Escape');
  await composer(page).press('Escape');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
});

test('Ideas and Tools preserve actions with ordinary keyboard navigation and modal return focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 408, height: 672 });
  const requests = await preparePanel(page);
  await pet(page).press('Enter');
  await expect(page.getByRole('heading', { name: 'Conversation', exact: true })).toHaveCount(1);
  await expect(page.getByText('HERE WITH YOU', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Let’s figure it out.', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start voice conversation', exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .locator('.buddy-composer')
      .getByRole('button', { name: 'Start voice conversation', exact: true }),
  ).toBeVisible();
  await composer(page).fill('An unsent draft stays here.');
  await tools(page).press('Enter');
  const toolRegion = page.getByRole('region', { name: 'Tools', exact: true });
  await expect(toolRegion.getByRole('button')).toHaveCount(7);
  await tools(page).press('Tab');
  await expect(toolRegion.getByRole('button', { name: 'Choose a window to see' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tools(page)).toBeFocused();
  await expect(tools(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
  await tools(page).press('Enter');
  await toolRegion.getByRole('button', { name: 'Settings and connections' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings & connections' })).toBeVisible();
  await expect(tools(page)).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Close dialog' }).press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(tools(page)).toBeFocused();
  await expect(composer(page)).toHaveValue('An unsent draft stays here.');
  const ideas = page.getByRole('button', { name: 'Ideas', exact: true });
  await ideas.press('Enter');
  const ideaRegion = page.getByRole('region', { name: 'Ideas', exact: true });
  await expect(ideaRegion.getByRole('button')).toHaveCount(4);
  await ideas.press('Tab');
  await expect(ideaRegion.getByRole('button', { name: 'Understand my finances' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ideas).toBeFocused();
  await ideas.press('Escape');
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'closed');
  await expect(pet(page)).toBeFocused();
  await pet(page).press('Enter');
  await expect(composer(page)).toHaveValue('An unsent draft stays here.');
  await expect(ideas).toHaveAttribute('aria-expanded', 'false');
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
  expect(requests).not.toContain('/api/computer/stop');
});

test('an Ideas request keeps direct Stop available and preserves busy permissions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 480 });
  const requests = await preparePanel(page);
  let release: (() => void) | undefined;
  let submitted: unknown;
  await page.route('**/api/computer/request', async (route) => {
    submitted = route.request().postDataJSON();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        json: {
          state: { folder: null, code: null, browser: null, screen: null },
          summary: 'A bounded fixture result.',
        },
      })
      .catch(() => {});
  });
  await pet(page).click();
  const ideas = page.getByRole('button', { name: 'Ideas', exact: true });
  await ideas.click();
  await page.getByRole('button', { name: 'Open Calculator', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop task and audio', exact: true }),
  ).toBeVisible();
  await expect(ideas).toHaveAttribute('aria-expanded', 'false');
  expect(submitted).toMatchObject({ request: 'Open Calculator' });
  await ideas.click();
  for (const button of await page
    .getByRole('region', { name: 'Ideas', exact: true })
    .getByRole('button')
    .all())
    await expect(button).toBeDisabled();
  await page.keyboard.press('Escape');
  await tools(page).click();
  await expect(page.getByRole('button', { name: 'Choose a window to see' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Change save folder' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Stop task and audio', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Stop task and audio', exact: true }).click();
  release?.();
  await expect(page.getByRole('status')).toHaveText('Ready to talk');
  expect(requests).toContain('/api/computer/stop');
  expect(requests.filter((path) => path.includes('/voice/'))).toEqual([]);
});
