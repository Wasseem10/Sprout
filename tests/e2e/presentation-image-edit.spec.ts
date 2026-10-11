import { expect, test, type Page } from '@playwright/test';

const command = 'Add the image in my Marketing folder on Desktop to the last slide.';
const continuation = '__insight_insert_image_browser_fixture';
const sourcePath = 'C:\\Users\\Fixture\\Desktop\\Marketing';
const oldFilename = 'declaration-of-independence.pptx';
const updatedFilename = 'declaration-of-independence-image-revision.pptx';
const addedSummary =
  'I added team.png to slide 3, beside the existing content. The other slides are unchanged.';

// Synthetic microphone audio, mocked Scribe/provider responses and native IPC.
// This verifies app orchestration; it does not operate installed PowerPoint.
async function insertionFixture(
  page: Page,
  folderOutcome: 'clicked' | 'fallback' | 'pending',
  navigationOutcome: 'verified' | 'error' = 'verified',
  editOutcome: 'inserted' | 'replaced' = 'inserted',
) {
  const outcomeSummary =
    editOutcome === 'replaced'
      ? 'I replaced the picture with team.png on slide 3. The other slides are unchanged.'
      : addedSummary;
  await page.addInitScript(
    ({ folderOutcome, filename, navigationOutcome }) => {
      const w = window as any;
      w.nativeCalls = [];
      w.sequence = [];
      w.fakeSockets = [];
      const nativeFetch = window.fetch.bind(window);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const address =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (address.includes('/api/computer/')) {
          const payload = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
          w.sequence.push({ kind: 'api', path: new URL(address, location.href).pathname, payload });
        }
        return nativeFetch(input, init);
      };
      const NativeWebSocket = window.WebSocket;
      class FakeScribeSocket {
        static OPEN = 1;
        readyState = 0;
        listeners = new Map<string, Array<(event: any) => void>>();
        constructor(readonly address: string) {
          if (!address.includes('/v1/speech-to-text/realtime'))
            return new NativeWebSocket(address) as any;
          w.fakeSockets.push(this);
          setTimeout(() => {
            this.readyState = FakeScribeSocket.OPEN;
            this.emit('open', {});
            this.emitServer({ message_type: 'session_started' });
          }, 0);
        }
        addEventListener(event: string, listener: (event: any) => void) {
          this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        }
        send() {}
        close() {
          this.readyState = 3;
          this.emit('close', { code: 1000 });
        }
        emit(event: string, payload: any) {
          for (const listener of this.listeners.get(event) ?? []) listener(payload);
        }
        emitServer(payload: object) {
          this.emit('message', { data: JSON.stringify(payload) });
        }
      }
      w.WebSocket = FakeScribeSocket;
      w.emitScribe = (text: string) =>
        w.fakeSockets.at(-1)?.emitServer({ message_type: 'committed_transcript', text });
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        return destination.stream;
      };
      w.Audio = class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play() {
          setTimeout(() => this.onended?.(), 0);
          return Promise.resolve();
        }
        pause() {
          this.onended = null;
        }
      };
      const record = (event: object) => {
        w.nativeCalls.push(event);
        w.sequence.push(event);
      };
      let captureNumber = 0;
      w.insightos = {
        platform: 'win32',
        setBuddyMode: async () => {},
        openVisibleFolder: async (name: string, path: string) => {
          record({ kind: 'folder', name, path });
          if (folderOutcome === 'pending')
            return new Promise((resolve) => {
              w.releaseFolder = () => resolve({ clicked: false, opened: false });
            });
          return folderOutcome === 'clicked'
            ? { clicked: true, opened: true }
            : { clicked: false, opened: false };
        },
        cancelPointerActions: async () => {
          record({ kind: 'cancel' });
          w.releaseFolder?.();
        },
        navigatePresentationSlide: async (slide: number, expectedFilename: string) => {
          record({ kind: 'slide', slide, filename: expectedFilename });
          if (navigationOutcome === 'error') throw new Error('PowerPoint is not responding.');
          return {
            slide: 3,
            slideCount: 3,
            filename,
            title: 'Final workflow',
            clicked: true,
            verified: true,
            method: 'slide-thumbnail',
            focusedByMouse: true,
          };
        },
        captureCurrentScreen: async () => {
          captureNumber++;
          record({ kind: 'capture', number: captureNumber });
          return {
            name: captureNumber === 1 ? 'Marketing folder' : 'PowerPoint slide 3',
            image: `data:image/png;base64,synthetic-capture-${captureNumber}`,
            captureId: `fresh-${captureNumber}`,
          };
        },
      };
    },
    { folderOutcome, filename: updatedFilename, navigationOutcome },
  );
  const originalState = {
    folder: { id: 'output-folder', name: 'Presentation outputs' },
    code: null,
    browser: null,
    screen: null,
    presentation: {
      filename: oldFilename,
      title: 'Declaration of Independence',
      slideCount: 3,
      slideTitles: ['Declaration of Independence', 'Historical context', 'Final workflow'],
      opened: true,
      sha256: 'a'.repeat(64),
    },
  };
  const updatedState = {
    ...originalState,
    presentation: {
      ...originalState.presentation,
      filename: updatedFilename,
      sha256: 'b'.repeat(64),
      imageEdits: [
        { slide: 3, filename: 'team.png', altText: 'Source picture: team.png, from Marketing.' },
      ],
    },
  };
  const commands: string[] = [];
  const actions: string[] = [];
  const selections: unknown[] = [];
  const selectionFailures: unknown[] = [];
  const captures: unknown[] = [];
  const spoken: string[] = [];
  let inserted = false;
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/status')
      return route.fulfill({
        json: {
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: true, ttsConfigured: true },
          },
        },
      });
    if (pathname === '/api/session') return route.fulfill({ json: { authenticated: true } });
    if (pathname === '/api/voice/realtime-token')
      return route.fulfill({ json: { token: 'synthetic-test-token' } });
    if (pathname === '/api/voice/speak') {
      spoken.push(route.request().postDataJSON().text);
      return route.fulfill({ body: 'synthetic-audio', contentType: 'audio/mpeg' });
    }
    if (pathname === '/api/computer/state')
      return route.fulfill({ json: inserted ? updatedState : originalState });
    if (pathname === '/api/computer/request') {
      const { request } = route.request().postDataJSON();
      commands.push(request);
      if (request === command)
        return route.fulfill({
          json: {
            state: originalState,
            tool: 'presentationHelp',
            summary: 'I found team.png. I’ll add it to slide 3 and keep your other slides.',
            desktopIntent: {
              kind: 'openFolder',
              name: 'Marketing',
              path: sourcePath,
              imageSource: true,
              continueRequest: continuation,
            },
          },
        });
      expect(request).toBe(continuation);
      inserted = true;
      return route.fulfill({
        json: {
          state: updatedState,
          tool: 'presentationHelp',
          summary: outcomeSummary,
          spokenSummary: outcomeSummary,
          desktopIntent: { kind: 'slide', slide: 3, filename: updatedFilename },
        },
      });
    }
    if (pathname === '/api/computer/action') {
      const { tool } = route.request().postDataJSON();
      actions.push(tool);
      expect(tool).toBe('openImageSourceFolder');
      return route.fulfill({
        json: { state: originalState, summary: 'The image source folder is open.' },
      });
    }
    if (pathname === '/api/computer/selected-slide') {
      selections.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          ...updatedState,
          presentation: {
            ...updatedState.presentation,
            selectedSlide: 3,
            desktopNavigation: { status: 'verified', slide: 3 },
          },
        },
      });
    }
    if (pathname === '/api/computer/presentation-navigation-failure') {
      const payload = route.request().postDataJSON();
      selectionFailures.push(payload);
      return route.fulfill({
        json: {
          ...updatedState,
          presentation: {
            ...updatedState.presentation,
            desktopNavigation: { status: 'failed', message: payload.message },
          },
        },
      });
    }
    if (pathname === '/api/computer/screen') {
      captures.push(route.request().postDataJSON());
      return route.fulfill({ json: inserted ? updatedState : originalState });
    }
    if (pathname === '/api/computer/stop' || pathname === '/api/computer/interrupt')
      return route.fulfill({ json: originalState });
    return route.fulfill({ json: {} });
  });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fakeSockets.at(-1)?.readyState))
    .toBe(1);
  await expect.poll(() => spoken.length).toBe(1);
  await page.evaluate((text) => (window as any).emitScribe(text), command);
  return {
    commands,
    actions,
    selections,
    selectionFailures,
    captures,
    spoken,
    conversation: page.getByRole('log', { name: 'Buddy conversation' }),
  };
}

test('voice image insertion opens the named source before continuation and verifies the updated last slide', async ({
  page,
}) => {
  const fixture = await insertionFixture(page, 'clicked');
  await expect(fixture.conversation).toContainText(addedSummary);
  await expect
    .poll(() => fixture.spoken.some((text) => text.includes('I added team.png to slide 3')))
    .toBe(true);
  expect(fixture.commands).toEqual([command, continuation]);
  expect(fixture.actions).toEqual([]);
  expect(fixture.selections).toEqual([{ filename: updatedFilename, slide: 3 }]);
  expect(fixture.captures).toEqual([
    { name: 'Marketing folder', image: 'data:image/png;base64,synthetic-capture-1' },
    { name: 'PowerPoint slide 3', image: 'data:image/png;base64,synthetic-capture-2' },
  ]);
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([
    { kind: 'folder', name: 'Marketing', path: sourcePath },
    { kind: 'capture', number: 1 },
    { kind: 'slide', slide: 3, filename: updatedFilename },
    { kind: 'capture', number: 2 },
  ]);
  const sequence = await page.evaluate(() => (window as any).sequence);
  const folderIndex = sequence.findIndex((event: any) => event.kind === 'folder');
  const continuationIndex = sequence.findIndex(
    (event: any) => event.payload?.request === continuation,
  );
  expect(folderIndex).toBeLessThan(continuationIndex);
  await expect(fixture.conversation).not.toContainText('Slide 3, Final workflow.');
});

test('a saved image edit remains acknowledged when native slide selection fails', async ({
  page,
}) => {
  const fixture = await insertionFixture(page, 'clicked', 'error');
  await expect(fixture.conversation).toContainText(addedSummary);
  await expect(fixture.conversation).toContainText(
    'I couldn’t confirm the slide selection in PowerPoint.',
  );
  await expect
    .poll(() => fixture.spoken.some((text) => text.includes(addedSummary)))
    .toBe(true);
  expect(fixture.commands).toEqual([command, continuation]);
  expect(fixture.selections).toEqual([]);
  expect(fixture.selectionFailures).toEqual([
    { filename: updatedFilename, message: 'PowerPoint is not responding.', requestedSlide: 3 },
  ]);
  expect(fixture.captures).toHaveLength(1);
  await expect(fixture.conversation).not.toContainText('Slide 3, Final workflow.');
  await expect(fixture.conversation).not.toContainText('LET’S FIX THAT');
});

test('a replacement confirmation survives native navigation and is spoken as an edit', async ({
  page,
}) => {
  const fixture = await insertionFixture(page, 'clicked', 'verified', 'replaced');
  await expect(fixture.conversation).toContainText(
    'I replaced the picture with team.png on slide 3.',
  );
  await expect
    .poll(() => fixture.spoken.some((text) => text.includes('I replaced the picture')))
    .toBe(true);
  expect(fixture.selections).toEqual([{ filename: updatedFilename, slide: 3 }]);
  await expect(fixture.conversation).not.toContainText('Slide 3, Final workflow.');
});

test('a missing visible folder opens the image source without changing the presentation output folder', async ({
  page,
}) => {
  const fixture = await insertionFixture(page, 'fallback');
  await expect(fixture.conversation).toContainText(addedSummary);
  expect(fixture.actions).toEqual(['openImageSourceFolder']);
  expect(fixture.commands).toEqual([command, continuation]);
  expect(fixture.selections).toEqual([{ filename: updatedFilename, slide: 3 }]);
  const sequence = await page.evaluate(() => (window as any).sequence);
  const fallbackIndex = sequence.findIndex(
    (event: any) => event.payload?.tool === 'openImageSourceFolder',
  );
  const continuationIndex = sequence.findIndex(
    (event: any) => event.payload?.request === continuation,
  );
  expect(fallbackIndex).toBeGreaterThan(-1);
  expect(fallbackIndex).toBeLessThan(continuationIndex);
  expect(sequence.some((event: any) => event.payload?.tool === 'openSelectedFolder')).toBe(false);
});

test('Stop during folder opening cancels the continuation before any file insertion request', async ({
  page,
}) => {
  const fixture = await insertionFixture(page, 'pending');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).nativeCalls.some((event: any) => event.kind === 'folder'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Stop task and audio', exact: true }).click();
  await expect(fixture.conversation).toContainText(
    'Stopped. Completed file writes remain on disk.',
  );
  expect(fixture.commands).toEqual([command]);
  expect(fixture.actions).toEqual([]);
  expect(fixture.selections).toEqual([]);
  expect(fixture.captures).toEqual([]);
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([
    { kind: 'folder', name: 'Marketing', path: sourcePath },
    { kind: 'cancel' },
  ]);
  await expect(fixture.conversation).not.toContainText(addedSummary);
});
