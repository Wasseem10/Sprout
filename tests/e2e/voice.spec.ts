import { test, expect, type Page } from '@playwright/test';

const empty = { folder: null, code: null, browser: null, screen: null };
async function setup(
  page: Page,
  pendingPermission = false,
  initialSpeech = true,
  noAnalysis = false,
) {
  // An oscillator stream exercises actual MediaRecorder without opening the user's microphone.
  await page.addInitScript(
    ({ pending, initialSpeech, noAnalysis }) => {
      localStorage.setItem('insightos.speech', String(initialSpeech));
      const w = window as any;
      const TestAudioContext = AudioContext;
      if (noAnalysis) w.AudioContext = undefined;
      w.trackSets = [];
      w.gains = [];
      w.playbackPauses = 0;
      w.playbackStarts = 0;
      w.Audio = class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play() {
          w.playbackStarts++;
          setTimeout(() => this.onended?.(), w.playbackMs ?? 80);
          return Promise.resolve();
        }
        pause() {
          w.playbackPauses++;
          this.onended = null;
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        w.micCalls = (w.micCalls ?? 0) + 1;
        const context = new TestAudioContext();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain).connect(destination);
        w.gains.push(gain);
        if (w.micCalls === 1) {
          gain.gain.setValueAtTime(0, context.currentTime);
          gain.gain.setValueAtTime(0.25, context.currentTime + 0.2);
          gain.gain.setValueAtTime(0, context.currentTime + 0.7);
        } else gain.gain.setValueAtTime(0, context.currentTime);
        oscillator.start();
        w.trackSets.push(destination.stream.getTracks());
        w.releaseMic = () => destination.stream;
        if (pending)
          return new Promise<MediaStream>((resolve) => {
            w.releaseMic = () => resolve(destination.stream);
          });
        return destination.stream;
      };
    },
    { pending: pendingPermission, initialSpeech, noAnalysis },
  );
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
    if (['/api/computer/state', '/api/computer/stop', '/api/computer/interrupt'].includes(pathname))
      json = empty;
    // The batch-recorder tests must never request a real, billable Scribe socket.
    if (pathname === '/api/voice/realtime-token')
      return route.fulfill({ status: 503, json: { error: 'Realtime mocked offline' } });
    if (pathname === '/api/computer/request') {
      commands.push(route.request().postDataJSON().request);
      json = { state: empty, summary: 'Your voice command reached the task handler.' };
    }
    if (pathname === '/api/voice/speak')
      return route.fulfill({ body: 'mock-audio', contentType: 'audio/mpeg' });
    await route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  return commands;
}

async function setupRealtime(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.fakeSockets = [];
    class FakeScribeSocket {
      static OPEN = 1;
      readyState = 0;
      listeners = new Map<string, Array<(event: any) => void>>();
      constructor(readonly address: string) {
        w.fakeSockets.push(this);
        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = FakeScribeSocket.OPEN;
          this.emit('open', {});
          this.emitServer({ message_type: 'session_started' });
        }, 0);
      }
      addEventListener(event: string, listener: (event: any) => void) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      }
      send() {
        w.realtimeAudioChunks = (w.realtimeAudioChunks ?? 0) + 1;
      }
      close() {
        if (this.readyState === 3) return;
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
    w.emitScribe = (payload: object) => w.fakeSockets.at(-1)?.emitServer(payload);
  });
  const commands = await setup(page);
  await page.route('**/api/voice/realtime-token', (route) =>
    route.fulfill({ json: { token: 'test-realtime-token' } }),
  );
  return commands;
}

test('buddy greets generally on Play and never narrates an old code artifact', async ({ page }) => {
  await setupRealtime(page);
  const oldState = {
    ...empty,
    code: {
      filename: 'old.py',
      code: 'print(1)',
      output: '1',
      status: 'completed',
      editorOpened: true,
      exitCode: 0,
      sha256: 'old',
      provider: 'hugging-face',
    },
  };
  const spoken: string[] = [];
  await page.route('**/api/computer/state', (route) => route.fulfill({ json: oldState }));
  await page.route('**/api/computer/request', (route) =>
    route.fulfill({
      json: {
        state: oldState,
        summary: 'Hi, I am here. Tell me what you want to do on your computer.',
        clarification: true,
      },
    }),
  );
  await page.route('**/api/voice/speak', (route) => {
    spoken.push(route.request().postDataJSON().text);
    return route.fulfill({ body: 'audio', contentType: 'audio/mpeg' });
  });
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect.poll(() => spoken.length).toBe(1);
  expect(spoken[0]).toBe("Hi, I'm Insight. What would you like to do?");
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Hi' }),
  );
  await expect.poll(() => spoken.length).toBe(2);
  expect(spoken.join(' ')).not.toMatch(/python|vs code/i);
  await expect(
    page.getByRole('button', { name: 'Pause voice conversation', exact: true }),
  ).toBeVisible();
});

test('a voice follow-up interrupts work through the page-preserving endpoint', async ({ page }) => {
  await setupRealtime(page);
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/computer/request', async (route) => {
    const text = route.request().postDataJSON().request;
    calls.push(text);
    if (text === 'Find a notebook') await gate;
    await route.fulfill({ json: { state: empty, summary: 'Ready.' } }).catch(() => {});
  });
  await page.route('**/api/computer/interrupt', (route) => {
    calls.push('interrupt');
    release();
    return route.fulfill({ json: empty });
  });
  await page.route('**/api/computer/stop', (route) => {
    calls.push('closed');
    return route.fulfill({ json: empty });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Find a notebook' }),
  );
  await expect.poll(() => calls.length).toBe(1);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Read this page' }),
  );
  await expect.poll(() => calls.length).toBe(3);
  expect(calls).toEqual(['Find a notebook', 'interrupt', 'Read this page']);
});

test('realtime mic stays open during processing and delayed speech; a new utterance wins', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  let releaseFirst!: () => void;
  const firstSpeechGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  let speechRequests = 0;
  await page.route('**/api/voice/speak', async (route) => {
    speechRequests++;
    if (speechRequests === 1) await firstSpeechGate;
    await route.fulfill({ body: 'mock-audio', contentType: 'audio/mpeg' }).catch(() => {});
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).fakeSockets.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Find jobs' }),
  );
  await expect.poll(() => commands.length).toBe(1);
  await expect.poll(() => speechRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);

  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'Open result one' }),
  );
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open result one' }),
  );
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => speechRequests).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  releaseFirst();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(1);
  expect(commands).toEqual(['Find jobs', 'Open result one']);

  await page.getByRole('button', { name: 'Pause conversation' }).click();
  expect(
    await page.evaluate(() =>
      (window as any).trackSets
        .flat()
        .every((track: MediaStreamTrack) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open another job' }),
  );
  await page.waitForTimeout(100);
  expect(commands).toEqual(['Find jobs', 'Open result one']);
});

test('realtime partial transcript immediately interrupts speech playback', async ({ page }) => {
  await setupRealtime(page);
  const commands: string[] = [];
  let spokenReply = '';
  await page.route('**/api/computer/request', (route) => {
    commands.push(route.request().postDataJSON().request);
    return route.fulfill({
      json: { state: empty, summary: 'I found the jobs. You can say stop to interrupt me.' },
    });
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/speak')
      spokenReply = request.postDataJSON().text;
  });
  await page.evaluate(() => ((window as any).playbackMs = 60000));
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Find jobs' }),
  );
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  await expect.poll(() => spokenReply.includes('stop')).toBe(true);
  const echo = spokenReply.split(/\s+/).slice(0, 6).join(' ');
  await page.evaluate((text) => {
    (window as any).emitScribe({ message_type: 'partial_transcript', text });
    (window as any).emitScribe({ message_type: 'committed_transcript', text });
  }, echo);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).playbackPauses)).toBe(0);
  expect(commands).toEqual(['Find jobs']);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'stop' }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).playbackPauses))
    .toBeGreaterThanOrEqual(1);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open result one' }),
  );
  await expect.poll(() => commands.length).toBe(2);
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('one activation sends after silence, speaks, then listens again until paused', async ({
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
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  await expect(
    page.getByText('Your voice command reached the task handler.', { exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  expect(recordings).toBe(1);
  expect(commands).toEqual(['Run my program']);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).trackSets.flat().every((t: MediaStreamTrack) => t.readyState === 'ended'),
    ),
  ).toBe(true);
});

test('a fast result skips the acknowledgment and speaks once', async ({ page }) => {
  await setup(page);
  let spokenReplies = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/speak') spokenReplies++;
  });
  await page.route('**/api/voice/transcribe', async (route) =>
    route.fulfill({ json: { text: 'Find jobs' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Your voice command reached the task handler.',
  );
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await page.waitForTimeout(450);
  expect(spokenReplies).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('after a spoken reply, a second utterance runs without another click', async ({ page }) => {
  const commands = await setup(page);
  await page.route('**/api/voice/transcribe', async (route) =>
    route.fulfill({ json: { text: 'Run my program' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains[1];
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(3);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
  expect(commands).toEqual(['Run my program', 'Run my program']);
});

test('speaking can be interrupted by a new utterance without pressing play again', async ({
  page,
}) => {
  const commands = await setup(page);
  await page.evaluate(() => ((window as any).playbackMs = 60000));
  let utterance = 0;
  await page.route('**/api/voice/transcribe', async (route) => {
    utterance++;
    await route.fulfill({ json: { text: utterance === 1 ? 'Find jobs' : 'Open result one' } });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Speaking · interrupt me anytime')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => page.evaluate(() => (window as any).playbackPauses)).toBe(1);
  await expect.poll(() => commands.length).toBe(2);
  expect(commands).toEqual(['Find jobs', 'Open result one']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('pause stops microphone and audio immediately while the buddy speaks', async ({ page }) => {
  const commands = await setup(page);
  await page.evaluate(() => ((window as any).playbackMs = 10000));
  await page.route('**/api/voice/transcribe', async (route) =>
    route.fulfill({ json: { text: 'Find jobs' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Speaking · interrupt me anytime')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).playbackPauses)).toBeGreaterThanOrEqual(1);
  expect(
    await page.evaluate(() =>
      (window as any).trackSets.flat().every((t: MediaStreamTrack) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(commands).toEqual(['Find jobs']);
});

test('interrupting a spoken acknowledgment replaces the in-flight task', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => ((window as any).playbackMs = 10000));
  let spokenReplies = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/speak') spokenReplies++;
  });
  let utterance = 0;
  await page.route('**/api/voice/transcribe', async (route) => {
    utterance++;
    await route.fulfill({ json: { text: utterance === 1 ? 'Find jobs' : 'Open result one' } });
  });
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const requests: string[] = [];
  await page.route('**/api/computer/request', async (route) => {
    const request = route.request().postDataJSON().request as string;
    requests.push(request);
    if (request === 'Find jobs') await firstGate;
    await route.fulfill({ json: { state: empty, summary: `Handled ${request}` } }).catch(() => {});
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByText('Speaking · interrupt me anytime')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains[1];
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => page.evaluate(() => (window as any).playbackPauses)).toBe(1);
  // The old task completes while the user is still recording the interruption.
  // Its final TTS must not close that recording before transcription runs.
  releaseFirst();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual(['Find jobs', 'Open result one']);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Handled Open result one',
  );
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Handled Find jobs',
  );
  expect(spokenReplies).toBe(2);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('muting replies keeps the conversation listening for the next request', async ({ page }) => {
  const commands = await setup(page);
  let spokenReplies = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/speak') spokenReplies++;
  });
  await page.route('**/api/voice/transcribe', async (route) =>
    route.fulfill({ json: { text: 'Run my program' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await page.getByRole('button', { name: 'Turn spoken replies off' }).click();
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains[1];
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(3);
  expect(spokenReplies).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('muting during a spoken reply stops audio but keeps the session active', async ({ page }) => {
  const commands = await setup(page);
  await page.evaluate(() => ((window as any).playbackMs = 10000));
  await page.route('**/api/voice/transcribe', async (route) =>
    route.fulfill({ json: { text: 'Run my program' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Speaking · interrupt me anytime')).toBeVisible();
  await page.getByRole('button', { name: 'Turn spoken replies off' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  expect(commands).toEqual(['Run my program']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('playing honors a previously muted setting', async ({ page }) => {
  const commands = await setup(page, false, false);
  let spokenReplies = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/speak') spokenReplies++;
  });
  await page.route('**/api/voice/transcribe', async (route) =>
    route.fulfill({ json: { text: 'Run my program' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  expect(commands).toEqual(['Run my program']);
  expect(spokenReplies).toBe(0);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('missing audio analysis stops instead of sending repeated silent clips', async ({ page }) => {
  const commands = await setup(page, false, true, true);
  let transcriptions = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/transcribe') transcriptions++;
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect(
    page
      .getByRole('log', { name: 'Conversation transcript' })
      .getByText('Automatic voice detection is unavailable.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  expect(commands).toEqual([]);
  expect(transcriptions).toBe(0);
  expect(
    await page.evaluate(() =>
      (window as any).trackSets
        .flat()
        .every((track: MediaStreamTrack) => track.readyState === 'ended'),
    ),
  ).toBe(true);
});

test('Escape cancels pending microphone permission and stops a stream arriving later', async ({
  page,
}) => {
  const commands = await setup(page, true);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Opening microphone…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  await page.evaluate(() => (window as any).releaseMic());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).trackSets.flat().every((t: MediaStreamTrack) => t.readyState === 'ended'),
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
  await expect(page.getByText('Understanding your request', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
  release();
  await expect(page.getByText('Stopped.', { exact: false }).first()).toBeVisible();
  expect(commands).toEqual([]);
});

test('a spoken-style screen click uses a fresh capture and native mouse, then recaptures', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.nativeActions = [];
    w.insightos = {
      captureCurrentScreen: async () => {
        const captureId = `capture-${w.nativeActions.filter((a: any) => a.type === 'capture').length + 1}`;
        w.nativeActions.push({ type: 'capture', captureId });
        return { name: 'Main display', image: 'data:image/png;base64,YQ==', captureId };
      },
      clickCapturedTarget: async (
        captureId: string,
        x: number,
        y: number,
        target: string,
        observedText: string,
        context: string,
      ) => {
        w.nativeActions.push({ type: 'click', captureId, x, y, target, observedText, context });
        return { clicked: true, target };
      },
    };
  });
  await setup(page);
  const screen = {
    ...empty,
    screen: {
      name: 'Main display',
      image: 'data:image/png;base64,YQ==',
      capturedAt: new Date().toISOString(),
      description: null,
    },
  };
  await page.route('**/api/computer/screen', (route) => route.fulfill({ json: screen }));
  await page.route('**/api/computer/action', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      tool: 'locateScreenTarget',
      target: 'Apply button',
    });
    await route.fulfill({
      json: {
        state: screen,
        summary: 'I found the Apply button.',
        pointer: {
          x: 0.5,
          y: 0.4,
          target: 'Apply button',
          observedText: 'Apply',
          context: 'listing',
        },
      },
    });
  });
  const input = page.getByLabel('Tell your computer what to do');
  await input.fill('Click the Apply button on my screen');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Clicked Apply button.',
  );
  const actions = await page.evaluate(() => (window as any).nativeActions);
  expect(actions).toEqual([
    { type: 'capture', captureId: 'capture-1' },
    {
      type: 'click',
      captureId: 'capture-1',
      x: 0.5,
      y: 0.4,
      target: 'Apply button',
      observedText: 'Apply',
      context: 'listing',
    },
    { type: 'capture', captureId: 'capture-2' },
  ]);
});

test('scroll down uses desktop scrolling and refreshes the screen', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.nativeActions = [];
    w.insightos = {
      captureCurrentScreen: async () => {
        w.nativeActions.push('capture');
        return {
          name: 'Main display',
          image: 'data:image/png;base64,YQ==',
          captureId: 'capture-1',
        };
      },
      scrollCurrentScreen: async (direction: string) => {
        w.nativeActions.push(`scroll-${direction}`);
        return { scrolled: true, direction };
      },
    };
  });
  await setup(page);
  await page.route('**/api/computer/screen', (route) => route.fulfill({ json: empty }));
  const input = page.getByLabel('Tell your computer what to do');
  await input.fill('Scroll down');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Scrolled down.',
  );
  expect(await page.evaluate(() => (window as any).nativeActions)).toEqual([
    'scroll-down',
    'capture',
  ]);
});
