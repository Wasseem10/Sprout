import { expect, test, type Page } from '@playwright/test';

// Synthetic transcription and mocked tools test routing, not physical microphone
// capture, provider reasoning, or installed PowerPoint execution.
async function fixture(page: Page, activeDeck = true) {
  const state = {
    folder: null,
    code: null,
    browser: null,
    screen: null,
    ...(activeDeck
      ? {
          presentation: {
            filename: 'test.pptx',
            title: 'Test',
            slideCount: 4,
            slideTitles: ['One', 'Two', 'Three', 'Four'],
            opened: true,
          },
        }
      : {}),
  };
  await page.addInitScript(() => {
    const w = window as any;
    w.nativeCalls = [];
    w.fakeSockets = [];
    const NativeWebSocket = window.WebSocket;
    class FakeScribeSocket {
      static OPEN = 1;
      readyState = 0;
      listeners = new Map<string, Array<(event: any) => void>>();
      constructor(address: string) {
        if (!address.includes('/v1/speech-to-text/realtime'))
          return new NativeWebSocket(address) as any;
        w.fakeSockets.push(this);
        setTimeout(() => {
          this.readyState = 1;
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
    const native = (name: string) => async () => {
      w.nativeCalls.push(name);
      return { name: 'Display', image: 'data:image/png;base64,fixture', captureId: 'fresh' };
    };
    w.insightos = {
      platform: 'win32',
      setBuddyMode: async () => {},
      captureCurrentScreen: native('capture'),
      clickCapturedTarget: native('click'),
      scrollCurrentScreen: native('scroll'),
      cancelPointerActions: async () => {},
    };
  });
  const requests: string[] = [];
  const tools: string[] = [];
  const paths: string[] = [];
  const spoken: string[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    paths.push(path);
    if (path === '/api/status')
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
    if (path === '/api/voice/realtime-token')
      return route.fulfill({ json: { token: 'synthetic' } });
    if (path === '/api/voice/speak') {
      spoken.push(route.request().postDataJSON().text);
      return route.fulfill({ body: 'synthetic-audio', contentType: 'audio/mpeg' });
    }
    if (path === '/api/computer/request') {
      const { request } = route.request().postDataJSON();
      requests.push(request);
      return route.fulfill({
        json: { state, summary: `Interpreted turn ${requests.length}.`, clarification: true },
      });
    }
    if (path === '/api/computer/action') {
      tools.push(route.request().postDataJSON().tool);
      return route.fulfill({ json: { state, summary: 'Wrong direct route.' } });
    }
    if (path.startsWith('/api/computer/')) return route.fulfill({ json: state });
    return route.fulfill({ json: {} });
  });
  await page.goto('/?desktop=buddy');
  return { requests, tools, paths, spoken, state };
}

test('presentation selection, navigation and compound screen requests reach the semantic backend unchanged', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  for (const command of [
    'Select slide two.',
    'Navigate to slide two.',
    'Read slide two on my screen.',
    'Scroll down and make slide two less wordy.',
  ]) {
    await input.fill(command);
    await input.press('Enter');
    await expect.poll(() => f.requests.at(-1)).toBe(command);
    await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
      `Interpreted turn ${f.requests.length}.`,
    );
  }
  expect(f.tools).toEqual([]);
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([]);
});

test('an unfinished presentation request is interpreted before allocating a file workspace', async ({
  page,
}) => {
  const f = await fixture(page, false);
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  const command = 'Can you create a PowerPoint for me, uh, based on, um...';
  await input.fill(command);
  await input.press('Enter');
  await expect.poll(() => f.requests).toEqual([command]);
  expect(f.paths).not.toContain('/api/computer/demo-folder');
});

test('whole-task cancellation replaces buffered hesitant speech and keeps the conversation open', async ({
  page,
}) => {
  const f = await fixture(page, false);
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fakeSockets.at(-1)?.readyState))
    .toBe(1);
  await expect.poll(() => f.spoken.length).toBe(1);
  await page.evaluate(() => {
    (window as any).emitScribe(
      'Can you create a, uh, PowerPoint about Black History Month in, um...',
    );
    (window as any).emitScribe("No, don't do that, actually.");
  });
  await expect.poll(() => f.requests).toEqual(["No, don't do that, actually."]);
  await page.evaluate(() => (window as any).emitScribe('Create a PowerPoint about Cyber Monday.'));
  await expect
    .poll(() => f.requests)
    .toEqual(["No, don't do that, actually.", 'Create a PowerPoint about Cyber Monday.']);
  expect(await page.evaluate(() => (window as any).fakeSockets.at(-1)?.readyState)).toBe(1);
});

async function orderedNativeFixture(
  page: Page,
  outcome: 'verified' | 'unverified' | 'error' | 'pending',
) {
  const f = await fixture(page);
  await page.evaluate((outcome) => {
    const w = window as any;
    w.insightos.navigatePresentationSlide = async (slide: number, filename: string) => {
      w.nativeCalls.push(`slide:${slide}`);
      if (outcome === 'error') throw new Error('PowerPoint is not responding.');
      const result = {
        slide,
        filename,
        slideCount: 4,
        title: `Title ${slide}`,
        clicked: true,
        verified: outcome !== 'unverified',
      };
      if (outcome === 'pending')
        return new Promise((resolve) => {
          w.releaseNavigation = () => resolve(result);
        });
      return result;
    };
    w.insightos.openVisibleFolder = async () => {
      w.nativeCalls.push('folder:Marketing');
      return { clicked: true, opened: true };
    };
    w.insightos.cancelPointerActions = async () => w.releaseNavigation?.();
  }, outcome);
  const requests: string[] = [];
  const events: string[] = [];
  const first = 'Go to slide two, make it less wordy, then use my Marketing image on slide three.';
  const afterSlide = '__insight_semantic_after_slide';
  const afterFolder = '__insight_semantic_after_folder';
  const firstIdentity = { projectId: 'f95c21c1-f63b-49fb-ae9a-a690990c085d', revision: 3, sha256: 'a'.repeat(64) };
  const finalIdentity = { ...firstIdentity, revision: 4, sha256: 'b'.repeat(64) };
  await page.route('**/api/computer/selected-slide', (route) => {
    const { slide, identity } = route.request().postDataJSON();
    expect(identity).toEqual(slide === 2 ? firstIdentity : finalIdentity);
    events.push(`verified:${slide}`);
    return route.fulfill({
      json: { ...f.state, presentation: { ...f.state.presentation, selectedSlide: slide } },
    });
  });
  await page.route('**/api/computer/request', (route) => {
    const { request } = route.request().postDataJSON();
    requests.push(request);
    events.push(request);
    if (request === first)
      return route.fulfill({
        json: {
          state: f.state,
          summary: 'Selecting slide two.',
          tool: 'presentationHelp',
          desktopIntent: {
            kind: 'slide',
            slide: 2,
            filename: 'test.pptx',
            identity: firstIdentity,
            continueRequest: afterSlide,
          },
        },
      });
    if (request === afterSlide)
      return route.fulfill({
        json: {
          state: f.state,
          summary: 'Slide two is shorter. Opening Marketing.',
          tool: 'presentationHelp',
          desktopIntent: {
            kind: 'openFolder',
            name: 'Marketing',
            path: 'C:\\Fixture\\Marketing',
            imageSource: true,
            continueRequest: afterFolder,
          },
        },
      });
    expect(request).toBe(afterFolder);
    return route.fulfill({
      json: {
        state: f.state,
        summary: 'The image is saved on slide three.',
        tool: 'presentationHelp',
        desktopIntent: { kind: 'slide', slide: 3, filename: 'test.pptx', identity: finalIdentity },
      },
    });
  });
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await input.fill(first);
  await input.press('Enter');
  return { ...f, requests, events, first, afterSlide, afterFolder };
}

test('an ordered plan continues only after verified native selection and handles a later folder and slide', async ({
  page,
}) => {
  const f = await orderedNativeFixture(page, 'verified');
  await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
    'Slide 3, Title 3.',
  );
  expect(f.requests).toEqual([f.first, f.afterSlide, f.afterFolder]);
  expect(f.events).toEqual([f.first, 'verified:2', f.afterSlide, f.afterFolder, 'verified:3']);
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([
    'slide:2',
    'capture',
    'folder:Marketing',
    'capture',
    'slide:3',
    'capture',
  ]);
});

for (const outcome of ['unverified', 'error'] as const) {
  test(`an ordered plan does not continue after ${outcome} native selection`, async ({ page }) => {
    const f = await orderedNativeFixture(page, outcome);
    await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
      'I couldn’t confirm the slide selection in PowerPoint.',
    );
    expect(f.requests).toEqual([f.first]);
    expect(f.events).toEqual([f.first]);
    expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual(['slide:2']);
  });
}

test('cancellation during native selection prevents its semantic continuation', async ({
  page,
}) => {
  const f = await orderedNativeFixture(page, 'pending');
  await expect.poll(() => page.evaluate(() => (window as any).nativeCalls)).toEqual(['slide:2']);
  await page.getByRole('button', { name: 'Stop task and audio', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText('Stopped.');
  expect(f.requests).toEqual([f.first]);
  expect(f.events).toEqual([f.first]);
});

test('a stale same-filename native receipt refreshes current state without continuing or claiming selection', async ({ page }) => {
  const f = await fixture(page);
  const identity = { projectId: 'f95c21c1-f63b-49fb-ae9a-a690990c085d', revision: 3, sha256: 'a'.repeat(64) };
  const requests: string[] = [];
  const receipts: unknown[] = [];
  let refreshed = 0;
  await page.evaluate(() => {
    (window as any).insightos.navigatePresentationSlide = async () => ({ slide: 2, filename: 'test.pptx', title: 'Old title', verified: true, clicked: true });
  });
  await page.route('**/api/computer/request', (route) => {
    requests.push(route.request().postDataJSON().request);
    return route.fulfill({ json: {
      state: f.state, tool: 'goToSlide', summary: 'Selecting slide two.',
      desktopIntent: { kind: 'slide', slide: 2, filename: 'test.pptx', identity, continueRequest: '__obsolete_continuation' },
    } });
  });
  for (const endpoint of ['selected-slide', 'presentation-navigation-failure']) {
    await page.route(`**/api/computer/${endpoint}`, (route) => {
      receipts.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, json: { error: 'The current presentation changed before slide selection could be confirmed.' } });
    });
  }
  await page.route('**/api/computer/state', (route) => {
    refreshed++;
    return route.fulfill({ json: { ...f.state, presentation: { ...f.state.presentation, title: 'Current revision', selectedSlide: 3, sha256: 'b'.repeat(64) } } });
  });
  await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await input.fill('Go to slide two then read it.');
  await input.press('Enter');
  const conversation = page.getByRole('log', { name: 'Buddy conversation' });
  await expect(conversation).toContainText('The current presentation changed');
  await expect(input).toBeEnabled();
  expect(requests).toEqual(['Go to slide two then read it.']);
  expect(receipts).toHaveLength(2);
  for (const receipt of receipts) expect(receipt).toMatchObject({ identity });
  expect(refreshed).toBeGreaterThan(0);
  await expect(conversation).not.toContainText('Slide 2, Old title');
  expect(await page.evaluate(() => (window as any).nativeCalls)).toEqual([]);
});

for (const outcome of ['verified', 'error'] as const) {
  test(`a saved text revision is reported separately from ${outcome} native selection`, async ({
    page,
  }) => {
    const f = await fixture(page);
    await page.evaluate((outcome) => {
      (window as any).insightos.navigatePresentationSlide = async () => {
        if (outcome === 'error') throw new Error('PowerPoint is not responding.');
        return {
          slide: 2,
          filename: 'test-r2.pptx',
          slideCount: 4,
          title: 'Shorter content',
          clicked: true,
          verified: true,
        };
      };
    }, outcome);
    await page.route('**/api/computer/request', (route) =>
      route.fulfill({
        json: {
          state: {
            ...f.state,
            presentation: { ...f.state.presentation, filename: 'test-r2.pptx' },
          },
          summary: 'I shortened slide two and saved the new revision.',
          spokenSummary: 'Slide two is shorter. Your revision is saved.',
          tool: 'presentationHelp',
          desktopIntent: { kind: 'slide', slide: 2, filename: 'test-r2.pptx' },
        },
      }),
    );
    await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
    await input.fill('Make slide two less wordy.');
    await input.press('Enter');
    const transcript = page.getByRole('log', { name: 'Buddy conversation' });
    await expect(transcript).toContainText('I shortened slide two and saved the new revision.');
    if (outcome === 'error')
      await expect(transcript).toContainText(
        'I couldn’t confirm the slide selection in PowerPoint.',
      );
    else
      await expect
        .poll(() => f.spoken.at(-1))
        .toBe('Slide two is shorter. Your revision is saved.');
  });
}

for (const failureEndpoint of ['available', 'unavailable'] as const) {
  test(`failed slide-two navigation uses its own target despite an older slide-one picture, with ${failureEndpoint} failure recording`, async ({ page }) => {
    const f = await fixture(page);
    const active = {
      ...f.state,
      presentation: {
        ...f.state.presentation!,
        imageEdits: [{ slide: 1, filename: 'old-picture.jpg', altText: 'Earlier picture' }],
      },
    };
    const failures: unknown[] = [];
    await page.evaluate(() => {
      (window as any).insightos.navigatePresentationSlide = async () => {
        throw new Error('PowerPoint view verification was interrupted.');
      };
    });
    await page.route('**/api/computer/request', (route) => route.fulfill({ json: {
      state: active,
      summary: 'I’ll select slide 2.',
      tool: 'goToSlide',
      desktopIntent: { kind: 'slide', slide: 2, filename: 'test.pptx' },
    } }));
    await page.route('**/api/computer/presentation-navigation-failure', (route) => {
      const payload = route.request().postDataJSON();
      failures.push(payload);
      if (failureEndpoint === 'unavailable') return route.fulfill({ status: 503, json: { error: 'Backend restarting.' } });
      return route.fulfill({ json: {
        ...active,
        presentation: { ...active.presentation, desktopNavigation: { status: 'failed', requestedSlide: payload.requestedSlide, message: payload.message } },
      } });
    });
    await page.getByRole('button', { name: 'Expand buddy', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
    await input.fill('Go to slide two.');
    await input.press('Enter');
    const conversation = page.getByRole('log', { name: 'Buddy conversation' });
    await expect(conversation).toContainText('go to slide 2');
    await expect(conversation).not.toContainText('slide 1');
    await expect(conversation).not.toContainText('Your picture is saved');
    await expect.poll(() => f.spoken.at(-1)).toContain('go to slide 2');
    expect(f.spoken.at(-1)).not.toMatch(/slide 1|picture|saved/);
    expect(failures).toEqual([{ filename: 'test.pptx', message: 'PowerPoint view verification was interrupted.', requestedSlide: 2 }]);
    await expect(input).toBeEnabled();
  });
}
