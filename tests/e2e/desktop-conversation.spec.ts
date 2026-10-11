import { test, expect, type Page } from '@playwright/test';

const state = { folder: null, code: null, browser: null, screen: null };
test('screen access is automatic and folder/app requests invoke the native bridge', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.nativeCalls = [];
    w.insightos = {
      platform: 'win32',
      setBuddyMode: async () => {},
      captureCurrentScreen: async () => {
        w.nativeCalls.push('capture');
        return { name: 'Main display', image: 'data:image/png;base64,fixture', captureId: 'fresh' };
      },
      activatePinnedApp: async (app: string) => {
        w.nativeCalls.push('app:' + app);
        return { clicked: true, name: 'Chrome' };
      },
      openVisibleFolder: async (name: string) => {
        w.nativeCalls.push('folder:' + name);
        return { clicked: true };
      },
    };
  });
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url === '/api/status')
      return route.fulfill({
        json: {
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: false, ttsConfigured: false },
          },
        },
      });
    if (url === '/api/computer/state' || url === '/api/computer/screen')
      return route.fulfill({ json: state });
    if (url === '/api/computer/action') {
      requests.push(route.request().postDataJSON().tool);
      return route.fulfill({
        json: {
          state,
          summary:
            route.request().postDataJSON().tool === 'describeScreen'
              ? 'File Explorer is open with your marketing folder.'
              : 'Chrome is ready.',
          tool: route.request().postDataJSON().tool,
        },
      });
    }
    if (url === '/api/computer/request')
      return route.fulfill({
        json: {
          state,
          summary: 'I opened Marketing. There is one picture I can use.',
          tool: 'openFolder',
          desktopIntent: { kind: 'openFolder', name: 'Marketing' },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await input.fill('And use my screen.');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
    'File Explorer is open',
  );
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual(['capture']);
  await input.fill('Open Chrome');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
    'I clicked Chrome',
  );
  await input.fill('Open my Marketing folder');
  await input.press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeCalls))
    .toEqual(['capture', 'app:chrome', 'capture', 'folder:Marketing', 'capture']);
  expect(requests).toEqual(['describeScreen', 'openApp']);
});

test('consecutive app commands resolve a newly opened window and keep taking fresh captures', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.nativeCalls = [];
    const attempts: Record<string, number> = {};
    w.insightos = {
      platform: 'win32',
      setBuddyMode: async () => {},
      activatePinnedApp: async (app: string) => {
        attempts[app] = (attempts[app] ?? 0) + 1;
        w.nativeCalls.push('app:' + app);
        if (app === 'chrome' && attempts[app] === 1) return { clicked: false, name: 'Chrome' };
        return {
          clicked: true,
          name: app === 'chrome' ? 'Chrome' : 'Notepad',
          method: app === 'chrome' ? 'titlebar' : 'taskbar',
        };
      },
      captureCurrentScreen: async () => {
        const id = w.nativeCalls.filter((x: string) => x.startsWith('capture:')).length + 1;
        w.nativeCalls.push('capture:' + id);
        return {
          name: 'Main display',
          image: 'data:image/png;base64,fixture',
          captureId: 'fresh-' + id,
        };
      },
    };
  });
  const opened: string[] = [];
  const captures: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url === '/api/status')
      return route.fulfill({
        json: {
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: false, ttsConfigured: false },
          },
        },
      });
    if (url === '/api/computer/state') return route.fulfill({ json: state });
    if (url === '/api/computer/screen') {
      captures.push(route.request().postDataJSON());
      return route.fulfill({ json: state });
    }
    if (url === '/api/computer/action') {
      opened.push(route.request().postDataJSON().app);
      return route.fulfill({
        json: {
          state,
          summary: 'The app is ready.',
          tool: 'openApp',
          desktopIntent: { kind: 'activateApp', app: route.request().postDataJSON().app },
        },
      });
    }
    if (url === '/api/computer/request') {
      expect(route.request().postDataJSON().request).toBe('Could you bring Chrome back up for me?');
      opened.push('chrome');
      return route.fulfill({
        json: {
          state,
          summary: 'Chrome is ready.',
          tool: 'openApp',
          desktopIntent: { kind: 'activateApp', app: 'chrome' },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  const log = page.getByRole('log', { name: 'Buddy conversation' });
  for (const [command, reply] of [
    ['Open Chrome', 'I clicked Chrome’s window.'],
    ['Open Notepad', 'I clicked Notepad’s taskbar icon.'],
    ['Could you bring Chrome back up for me?', 'I clicked Chrome’s window.'],
  ]) {
    await input.fill(command);
    await input.press('Enter');
    await expect.poll(() => captures.length).toBe(opened.length);
    await expect(log).toContainText(reply);
    await expect(input).toBeEnabled();
  }
  expect(opened).toEqual(['chrome', 'notepad', 'chrome']);
  expect(captures).toHaveLength(3);
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([
    'app:chrome',
    'app:chrome',
    'capture:1',
    'app:notepad',
    'capture:2',
    'app:chrome',
    'capture:3',
  ]);
});

const slideFilename = 'insight-hackathon-marketing-r1.pptx';

async function slideNavigationFixture(page: Page, outcome: 'verified' | 'unverified' | 'error') {
  await page.addInitScript(
    ({ outcome, filename }) => {
      const w = window as any;
      w.nativeCalls = [];
      w.insightos = {
        platform: 'win32',
        setBuddyMode: async () => {},
        navigatePresentationSlide: async (slide: number, expectedFilename?: string) => {
          w.nativeCalls.push({ kind: 'slide', slide, filename: expectedFilename });
          if (outcome === 'error')
            throw new Error('PowerPoint did not expose a selectable slide thumbnail.');
          return {
            slide: 2,
            slideCount: 3,
            filename,
            title: 'Hackathon marketing',
            clicked: true,
            verified: outcome === 'verified',
            method: 'slide-thumbnail',
            focusedByMouse: true,
          };
        },
        captureCurrentScreen: async () => {
          w.nativeCalls.push({ kind: 'capture' });
          return {
            name: 'PowerPoint slide 2',
            image: 'data:image/png;base64,fresh-slide-two',
            captureId: 'slide-two-capture',
          };
        },
      };
    },
    { outcome, filename: slideFilename },
  );
  const presentationState = {
    ...state,
    presentation: {
      filename: slideFilename,
      title: 'Hackathon reporting',
      slideCount: 3,
      slideTitles: ['Hackathon reporting', 'Hackathon marketing', 'Customer journey'],
      opened: true,
      sha256: 'a'.repeat(64),
    },
  };
  const actions: string[] = [];
  const uploads: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url === '/api/status')
      return route.fulfill({
        json: {
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: false, ttsConfigured: false },
          },
        },
      });
    if (url === '/api/computer/state') return route.fulfill({ json: presentationState });
    if (url === '/api/computer/selected-slide') {
      expect(route.request().postDataJSON()).toEqual({ filename: slideFilename, slide: 2 });
      return route.fulfill({
        json: {
          ...presentationState,
          presentation: { ...presentationState.presentation, selectedSlide: 2 },
        },
      });
    }
    if (url === '/api/computer/presentation-navigation-failure') {
      const payload = route.request().postDataJSON();
      expect(payload.filename).toBe(slideFilename);
      return route.fulfill({
        json: {
          ...presentationState,
          presentation: {
            ...presentationState.presentation,
            desktopNavigation: { status: 'failed', message: payload.message },
          },
        },
      });
    }
    if (url === '/api/computer/request') {
      expect(route.request().postDataJSON()).toEqual({
        request: 'Go to slide 2.',
        turnId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      });
      return route.fulfill({
        json: {
          state: presentationState,
          summary: 'Selecting slide 2 in PowerPoint.',
          tool: 'goToSlide',
          desktopIntent: { kind: 'slide', slide: 2, filename: slideFilename },
        },
      });
    }
    if (url === '/api/computer/action') {
      actions.push(route.request().postDataJSON().tool);
      return route.fulfill({ json: { state: presentationState, summary: 'I opened PowerPoint.' } });
    }
    if (url === '/api/computer/screen') {
      uploads.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          ...presentationState,
          screen: {
            name: 'PowerPoint slide 2',
            image: 'data:image/png;base64,fresh-slide-two',
            capturedAt: '2026-10-11T02:00:00.000Z',
            description: null,
          },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await input.fill('Go to slide 2.');
  await input.press('Enter');
  return {
    actions,
    uploads,
    conversation: page.getByRole('log', { name: 'Buddy conversation' }),
  };
}

test('slide navigation invokes the exact native target and captures the verified result', async ({
  page,
}) => {
  const { actions, uploads, conversation } = await slideNavigationFixture(page, 'verified');
  await expect(conversation).toContainText('Slide 2, Hackathon marketing.');
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([
    { kind: 'slide', slide: 2, filename: slideFilename },
    { kind: 'capture' },
  ]);
  expect(uploads).toEqual([
    { name: 'PowerPoint slide 2', image: 'data:image/png;base64,fresh-slide-two' },
  ]);
  expect(actions).toEqual([]);
  await expect(conversation).not.toContainText('I opened PowerPoint.');
  await expect(conversation).not.toContainText('Selecting slide 2 in PowerPoint.');
});

for (const outcome of ['unverified', 'error'] as const) {
  test(`slide navigation ${outcome} does not report a successful selection`, async ({ page }) => {
    const { actions, uploads, conversation } = await slideNavigationFixture(page, outcome);
    await expect(conversation).toContainText(
      'I couldn’t confirm the slide selection in PowerPoint.',
    );
    expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([
      { kind: 'slide', slide: 2, filename: slideFilename },
    ]);
    expect(uploads).toEqual([]);
    expect(actions).toEqual([]);
    await expect(conversation).not.toContainText('Slide 2, Hackathon marketing.');
    await expect(conversation).not.toContainText('I opened PowerPoint.');
    await expect(conversation).not.toContainText('Selecting slide 2 in PowerPoint.');
  });
}
