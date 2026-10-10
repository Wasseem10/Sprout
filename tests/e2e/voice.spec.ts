import { test, expect, type Page } from '@playwright/test';

const empty = { folder: null, code: null, browser: null, screen: null };
async function setup(page: Page, pendingPermission = false) {
  // An oscillator stream exercises actual MediaRecorder without opening the user's microphone.
  await page.addInitScript((pending) => {
    localStorage.setItem('insightos.speech', 'false');
    const w = window as any;
    navigator.mediaDevices.getUserMedia = async () => {
      w.micCalls = (w.micCalls ?? 0) + 1;
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      w.testTracks = destination.stream.getTracks();
      w.releaseMic = () => destination.stream;
      if (pending)
        return new Promise<MediaStream>((resolve) => {
          w.releaseMic = () => resolve(destination.stream);
        });
      return destination.stream;
    };
  }, pendingPermission);
  const commands: string[] = [];
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (pathname === '/api/status')
      json = {
        mode: 'sample',
        hosted: false,
        sessionRequired: false,
        computer: { local: true, pythonConfigured: true, editorConfigured: true },
        integrations: {
          huggingFace: { configured: true },
          elevenLabs: { configured: true, ttsConfigured: true },
        },
      };
    if (pathname === '/api/computer/state' || pathname === '/api/computer/stop') json = empty;
    if (pathname === '/api/computer/request') {
      commands.push(route.request().postDataJSON().request);
      json = { state: empty, summary: 'Your voice command reached the task handler.' };
    }
    await route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start voice recording' })).toBeEnabled();
  return commands;
}

test('keyboard recording produces audio and dispatches exactly one recognized command', async ({
  page,
}) => {
  const commands = await setup(page);
  let recordings = 0;
  await page.route('**/api/voice/transcribe', async (route) => {
    recordings++;
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    expect(route.request().postDataBuffer()!.length).toBeGreaterThan(100);
    await route.fulfill({ json: { text: 'Run my program', provider: 'elevenlabs' } });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('button', { name: 'Finish recording' })).toBeEnabled();
  await page.keyboard.press('Control+Shift+Space');
  await expect(
    page.getByText('Your voice command reached the task handler.', { exact: true }).first(),
  ).toBeVisible();
  expect(recordings).toBe(1);
  expect(commands).toEqual(['Run my program']);
  expect(
    await page.evaluate(() =>
      (window as any).testTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
    ),
  ).toBe(true);
});

test('Escape cancels pending microphone permission and stops a stream arriving later', async ({
  page,
}) => {
  const commands = await setup(page, true);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Opening microphone…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice recording' })).toBeDisabled();
  await page.keyboard.press('Control+Shift+Space');
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start voice recording' })).toBeEnabled();
  await page.evaluate(() => (window as any).releaseMic());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).testTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  expect(commands).toEqual([]);
});

test('canceled transcription cannot submit a late command', async ({ page }) => {
  const commands = await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/voice/transcribe', async (route) => {
    await gate;
    await route.fulfill({ json: { text: 'Run my program' } }).catch(() => {});
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('button', { name: 'Finish recording' })).toBeEnabled();
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Transcribing your request…')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start voice recording' })).toBeEnabled();
  release();
  await expect(page.getByText('Stopped.', { exact: false }).first()).toBeVisible();
  expect(commands).toEqual([]);
});
