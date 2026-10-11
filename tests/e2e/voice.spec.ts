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
      const NativeMediaRecorder = MediaRecorder;
      w.recordingStarts = 0;
      w.recordingTrackIds = [];
      w.recordedClips = [];
      w.MediaRecorder = class extends NativeMediaRecorder {
        constructor(stream: MediaStream, options?: MediaRecorderOptions) {
          super(stream, options);
          const chunks: Blob[] = [];
          this.addEventListener('dataavailable', (event) => chunks.push(event.data));
          this.addEventListener('stop', () =>
            w.recordedClips.push(new Blob(chunks, { type: this.mimeType })),
          );
        }
        start(timeslice?: number) {
          w.recordingStarts++;
          w.recordingTrackIds.push(this.stream.getAudioTracks().map((track) => track.id));
          super.start(timeslice);
        }
      };
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
          gain.gain.setValueAtTime(w.immediateSpeech ? 0.25 : 0, context.currentTime);
          gain.gain.setValueAtTime(0.25, context.currentTime + (w.immediateSpeech ? 0 : 0.2));
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

async function setupRealtime(page: Page, pendingPermission = false) {
  await page.addInitScript(() => {
    const w = window as any;
    const NativeWebSocket = window.WebSocket;
    w.fakeSockets = [];
    class FakeScribeSocket {
      static OPEN = 1;
      readyState = 0;
      listeners = new Map<string, Array<(event: any) => void>>();
      constructor(readonly address: string) {
        // Vite HMR uses its own socket. Mock only the billable provider so
        // local source changes cannot create phantom transcription sessions.
        if (!String(address).includes('/v1/speech-to-text/realtime'))
          return new NativeWebSocket(address) as any;
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
  const commands = await setup(page, pendingPermission);
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

test('realtime waits for the microphone pipeline before advertising Listening or playing a greeting', async ({
  page,
}) => {
  await setupRealtime(page, true);
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).fakeSockets.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.waitForTimeout(350);
  await expect(page.getByText('Opening mic…', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).playbackStarts)).toBe(0);
  await page.evaluate(() => (window as any).releaseMic());
  await expect
    .poll(() => page.evaluate(() => (window as any).realtimeAudioChunks))
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  await expect(page.getByText('Listening…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
});

test('fallback also waits for microphone permission before playing the startup greeting', async ({
  page,
}) => {
  await setup(page, true);
  await page.goto('/?desktop=buddy');
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await expect(page.getByText('Opening mic…', { exact: true })).toBeVisible();
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as any).playbackStarts)).toBe(0);
  expect(await page.evaluate(() => (window as any).recordingStarts)).toBe(0);
  await page.evaluate(() => (window as any).releaseMic());
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
});

test('a conversational pause after my or uh preserves one complete image and topic request', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() => {
    const emit = (window as any).emitScribe;
    emit({ message_type: 'partial_transcript', text: 'Can you add, um, an image from my, uh...' });
    emit({
      message_type: 'committed_transcript',
      text: 'Can you add, um, an image from my, uh...',
    });
  });
  await page.waitForTimeout(1000);
  expect(commands).toEqual([]);
  await page.evaluate(() => {
    const emit = (window as any).emitScribe;
    emit({ message_type: 'partial_transcript', text: 'Marketing folder for Black History Month' });
    emit({
      message_type: 'committed_transcript',
      text: 'Marketing folder for Black History Month',
    });
  });
  await expect
    .poll(() => commands)
    .toEqual(['Can you add, um, an image from my, uh Marketing folder for Black History Month']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('a trailing topic partial postpones the previous final until its continuation commits', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Create a presentation',
    }),
  );
  await page.waitForTimeout(120);
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'partial_transcript',
      text: 'for Black History Month',
    }),
  );
  await page.waitForTimeout(500);
  expect(commands).toEqual([]);
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'for Black History Month',
    }),
  );
  await expect.poll(() => commands).toEqual(['Create a presentation for Black History Month']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('create-for-me and A fragments remain one task when the speaker finishes the presentation topic', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Um, can you create for me...',
    }),
  );
  await page.waitForTimeout(750);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'A...' }),
  );
  await page.waitForTimeout(750);
  expect(commands).toEqual([]);
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'PowerPoint for Black History Month',
    }),
  );
  await expect
    .poll(() => commands)
    .toEqual(['Um, can you create for me A PowerPoint for Black History Month']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('short Stop replaces an unfinished thought immediately', async ({ page }) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Can you add an image from my...',
    }),
  );
  await page.evaluate(() => {
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'Stop' });
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Stop' });
  });
  await expect.poll(() => commands, { timeout: 800 }).toEqual(['Stop']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('short No supersedes a paused incomplete thought without waiting for its continuation window', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Can you create for me...',
    }),
  );
  await page.evaluate(() => {
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'No' });
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'No' });
  });
  await expect.poll(() => commands, { timeout: 800 }).toEqual(['No']);
  await page.waitForTimeout(1950);
  expect(commands).toEqual(['No']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('a committed prefix survives realtime failure and joins the fallback continuation', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.route('**/api/voice/transcribe', (route) =>
    route.fulfill({ json: { text: 'Marketing folder for Black History Month' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() => {
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Use the image from my',
    });
    (window as any).fakeSockets.at(-1).close();
  });
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect
    .poll(() => commands)
    .toEqual(['Use the image from my Marketing folder for Black History Month']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('fallback captures initial audio without treating first-frame speech as background calibration', async ({
  page,
}) => {
  const commands = await setup(page);
  await page.evaluate(() => ((window as any).immediateSpeech = true));
  await page.route('**/api/voice/transcribe', (route) =>
    route.fulfill({ json: { text: 'Open my Marketing folder' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => commands).toEqual(['Open my Marketing folder']);
  const initialRms = await page.evaluate(async () => {
    const clip: Blob = (window as any).recordedClips[0];
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await clip.arrayBuffer());
    const initialAudio = buffer.getChannelData(0).slice(0, Math.floor(buffer.sampleRate * 0.15));
    const rms = Math.sqrt(
      initialAudio.reduce((sum, value) => sum + value * value, 0) / initialAudio.length,
    );
    await context.close();
    return rms;
  });
  expect(initialRms).toBeGreaterThan(0.03);
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('fallback rolls capture over during network transcription and delivers reversed responses in speech order', async ({
  page,
}) => {
  const commands = await setup(page);
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
  let transcriptions = 0;
  await page.route('**/api/voice/transcribe', async (route) => {
    const clip = ++transcriptions;
    if (clip === 1) await gate;
    await route.fulfill({
      json: { text: clip === 1 ? 'Create a PowerPoint about' : 'Black History Month' },
    });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => transcriptions).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(1);
  expect(await page.evaluate(() => (window as any).recordingTrackIds[0][0])).toBe(
    await page.evaluate(() => (window as any).recordingTrackIds[1][0]),
  );
  expect(await page.evaluate(() => (window as any).trackSets[0][0].readyState)).toBe('live');
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => transcriptions).toBe(2);
  expect(commands).toEqual([]);
  releaseFirst();
  await expect.poll(() => commands).toEqual(['Create a PowerPoint about Black History Month']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('an older failed transcription cannot speak a recovery cue over newly captured input', async ({
  page,
}) => {
  const commands = await setup(page);
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
  let transcriptions = 0;
  await page.route('**/api/voice/transcribe', async (route) => {
    if (++transcriptions === 1) {
      await gate;
      return route.fulfill({
        status: 503,
        json: { error: 'Recognition temporarily unavailable.' },
      });
    }
    return route.fulfill({ json: { text: 'Open my Marketing folder' } });
  });
  const spoken: string[] = [];
  await page.route('**/api/voice/speak', (route) => {
    spoken.push(route.request().postDataJSON().text);
    return route.fulfill({ body: 'mock-audio', contentType: 'audio/mpeg' });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => transcriptions).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.7);
  });
  await page.waitForTimeout(250);
  releaseFirst();
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Recognition temporarily unavailable.',
  );
  expect(spoken).toEqual([]);
  await expect.poll(() => commands).toEqual(['Open my Marketing folder']);
  await expect.poll(() => spoken.length).toBe(1);
  expect(spoken[0]).not.toContain("I couldn't process that");
  await page.getByRole('button', { name: 'Pause conversation' }).click();
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

test('the short correction no interrupts realtime speech before its final transcript', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.evaluate(() => ((window as any).playbackMs = 60000));
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).fakeSockets.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Read my slide' }),
  );
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'No' }),
  );
  await expect.poll(() => page.evaluate(() => (window as any).playbackPauses)).toBe(1);
  expect(commands).toEqual(['Read my slide']);
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'No, use the other image',
    }),
  );
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('a fresh repeated voice instruction is accepted while duplicate provider commits are ignored', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).fakeSockets.length)).toBe(1);
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() => {
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'Next slide' });
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Next slide' });
  });
  await expect.poll(() => commands.length).toBe(1);
  await page.evaluate(() => {
    // Duplicate delivery is not another spoken request.
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Next slide' });
  });
  await page.waitForTimeout(80);
  expect(commands).toEqual(['Next slide']);
  await page.evaluate(() => {
    // A new partial identifies the next utterance, even with identical words.
    (window as any).emitScribe({ message_type: 'partial_transcript', text: 'Next slide' });
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Next slide' });
  });
  await expect.poll(() => commands.length).toBe(2);
  expect(commands).toEqual(['Next slide', 'Next slide']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('one failed transcription leaves voice available for the next instruction without another click', async ({
  page,
}) => {
  const commands = await setup(page);
  let transcriptions = 0;
  await page.route('**/api/voice/transcribe', (route) => {
    if (++transcriptions === 1)
      return route.fulfill({ status: 503, body: '', contentType: 'application/json' });
    return route.fulfill({ json: { text: 'Open my Marketing folder' } });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Speech recognition is unavailable (HTTP 503). Please say that again.',
  );
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  expect(transcriptions).toBe(1);
  expect(commands).toEqual([]);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands).toEqual(['Open my Marketing folder']);
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(3);
  expect(transcriptions).toBe(2);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('an invalid successful transcription is reported without submitting a fabricated request or ending voice', async ({
  page,
}) => {
  const commands = await setup(page);
  await page.route('**/api/voice/transcribe', (route) => route.fulfill({ json: { text: 123 } }));
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Speech recognition returned an unreadable response. Please say that again.',
  );
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  expect(commands).toEqual([]);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('new speech cancels a delayed recognition-recovery cue before it plays', async ({ page }) => {
  const commands = await setup(page);
  let transcriptions = 0;
  await page.route('**/api/voice/transcribe', (route) =>
    ++transcriptions === 1
      ? route.fulfill({ status: 503, json: { error: 'Recognition temporarily unavailable.' } })
      : route.fulfill({ json: { text: 'Open my Marketing folder' } }),
  );
  let releaseCue!: () => void;
  const cueGate = new Promise<void>((resolve) => (releaseCue = resolve));
  const spoken: string[] = [];
  await page.route('**/api/voice/speak', async (route) => {
    spoken.push(route.request().postDataJSON().text);
    if (spoken.length === 1) await cueGate;
    await route.fulfill({ body: 'mock-audio', contentType: 'audio/mpeg' }).catch(() => {});
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => spoken.length).toBe(1);
  expect(spoken[0]).toBe("I couldn't process that. Please say it again.");
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands).toEqual(['Open my Marketing folder']);
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  releaseCue();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('recognition recovery respects muted replies and continues listening', async ({ page }) => {
  const commands = await setup(page, false, false);
  let replies = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/speak') replies++;
  });
  await page.route('**/api/voice/transcribe', (route) =>
    route.fulfill({ status: 503, json: { error: 'Recognition temporarily unavailable.' } }),
  );
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Recognition temporarily unavailable.',
  );
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  expect(replies).toBe(0);
  expect(commands).toEqual([]);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('voice output failures preserve the realtime microphone and allow a later reply to play', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  let replies = 0;
  await page.route('**/api/voice/speak', (route) => {
    replies++;
    if (replies === 1)
      return route.fulfill({ status: 503, body: '', contentType: 'application/json' });
    if (replies === 2) return route.fulfill({ status: 200, body: '', contentType: 'audio/mpeg' });
    return route.fulfill({ body: 'mock-audio', contentType: 'audio/mpeg' });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open Chrome' }),
  );
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Voice output is unavailable (HTTP 503). The answer remains in the transcript.',
  );
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open my folder' }),
  );
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(
    'Voice output returned no audio. The answer remains in the transcript.',
  );
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Read slide two' }),
  );
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  expect(commands).toEqual(['Open Chrome', 'Open my folder', 'Read slide two']);
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('restarting voice does not suppress the first instruction as a duplicate from the old session', async ({
  page,
}) => {
  const commands = await setupRealtime(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open Chrome' }),
  );
  await expect.poll(() => commands.length).toBe(1);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).fakeSockets.length)).toBe(2);
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Open Chrome' }),
  );
  await expect.poll(() => commands.length).toBe(2);
  expect(commands).toEqual(['Open Chrome', 'Open Chrome']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('fallback listens during delayed speech synthesis and never plays the interrupted response', async ({
  page,
}) => {
  const commands = await setup(page);
  let utterance = 0;
  await page.route('**/api/voice/transcribe', (route) =>
    route.fulfill({
      json: { text: ++utterance === 1 ? 'Tell me about the slide' : 'Use the other image' },
    }),
  );
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
  let speechRequests = 0;
  await page.route('**/api/voice/speak', async (route) => {
    if (++speechRequests === 1) await gate;
    await route.fulfill({ body: 'audio', contentType: 'audio/mpeg' }).catch(() => {});
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => speechRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  expect(await page.evaluate(() => (window as any).playbackStarts)).toBe(0);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  releaseFirst();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  expect(commands).toEqual(['Tell me about the slide', 'Use the other image']);
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('fallback keeps listening during a task with no spoken acknowledgment', async ({ page }) => {
  await setup(page);
  let utterance = 0;
  await page.route('**/api/voice/transcribe', (route) =>
    route.fulfill({
      json: { text: ++utterance === 1 ? 'Tell me about the slide' : 'Actually read slide two' },
    }),
  );
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const calls: string[] = [];
  await page.route('**/api/computer/request', async (route) => {
    const text = route.request().postDataJSON().request;
    calls.push(text);
    if (text === 'Tell me about the slide') await gate;
    await route.fulfill({ json: { state: empty, summary: `Handled ${text}` } }).catch(() => {});
  });
  await page.route('**/api/computer/interrupt', (route) => {
    calls.push('interrupt');
    releaseFirst();
    return route.fulfill({ json: empty });
  });
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect.poll(() => calls).toEqual(['Tell me about the slide']);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect
    .poll(() => calls)
    .toEqual(['Tell me about the slide', 'interrupt', 'Actually read slide two']);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).not.toContainText(
    'Handled Tell me about the slide',
  );
  await page.getByRole('button', { name: 'Pause conversation' }).click();
});

test('a realtime disconnect preserves active speech and reopens the fallback microphone', async ({
  page,
}) => {
  await setupRealtime(page);
  await page.evaluate(() => ((window as any).playbackMs = 60000));
  await page.keyboard.press('Control+Shift+Space');
  await expect.poll(() => page.evaluate(() => (window as any).fakeSockets.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(1);
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() =>
    (window as any).emitScribe({ message_type: 'committed_transcript', text: 'Read my slide' }),
  );
  await expect.poll(() => page.evaluate(() => (window as any).playbackStarts)).toBe(1);
  await page.evaluate(() => (window as any).fakeSockets.at(-1).close());
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(2);
  expect(await page.evaluate(() => (window as any).playbackPauses)).toBe(0);
  await expect(page.getByRole('button', { name: 'Pause conversation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Pause conversation' }).click();
  expect(await page.evaluate(() => (window as any).playbackPauses)).toBe(1);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect.poll(() => commands.length).toBe(1);
  await expect(page.getByText('Listening — speak whenever you are ready')).toBeVisible();
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(3);
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
  await expect
    .poll(() => page.evaluate(() => (window as any).recordingStarts))
    .toBeGreaterThanOrEqual(2);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
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
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).not.toContainText(
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect.poll(() => commands.length).toBe(1);
  await page.getByRole('button', { name: 'Turn spoken replies off' }).click();
  await page.evaluate(() => {
    const gain: GainNode = (window as any).gains.at(-1);
    const now = gain.context.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.5);
  });
  await expect.poll(() => commands.length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(3);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
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
  await expect.poll(() => page.evaluate(() => (window as any).recordingStarts)).toBe(2);
  await expect.poll(() => commands.length).toBe(1);
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
