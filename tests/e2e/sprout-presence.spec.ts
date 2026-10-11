import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/sprout-automatic-v007/browser');
const empty = { folder: null, code: null, browser: null, screen: null };
const completed = (id: string) => ({
  id,
  status: 'completed',
  goal: 'Fixture task',
  message: 'Done',
  steps: [],
});

/** Local Scribe/oscillator/native-playback fixtures; no provider or physical microphone is used. */
async function setup(page: Page, { realtime = true, speech = false, noGpu = false } = {}) {
  await page.addInitScript(
    ({ speech, noGpu }) => {
      const w = window as any;
      localStorage.setItem('insightos.buddySpeech', String(speech));
      localStorage.setItem('insightos.speech', String(speech));
      localStorage.setItem('insightos.buddyMotionPaused', 'false');
      const NativeAudioContext = AudioContext;
      // The synthetic Audio is not an HTMLMediaElement: output analysis falls back
      // while the real AudioContext remains available to the Scribe microphone path.
      w.micCalls = 0;
      w.fixtureTracks = [];
      w.fixtureAudio = [];
      w.fakeSockets = [];
      w.Audio = class extends EventTarget {
        src: string;
        paused = true;
        ended = false;
        muted = false;
        volume = 1;
        readyState = 4;
        currentTime = 0;
        playbackRate = 1;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(src: string) {
          super();
          this.src = src;
          w.fixtureAudio.push(this);
        }
        play() {
          this.paused = false;
          this.dispatchEvent(new Event('playing'));
          return Promise.resolve();
        }
        pause() {
          this.paused = true;
          this.dispatchEvent(new Event('pause'));
        }
        finish() {
          this.ended = true;
          this.paused = true;
          this.dispatchEvent(new Event('ended'));
          this.onended?.();
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        w.micCalls++;
        const context = new NativeAudioContext();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        w.fixtureTracks.push(destination.stream.getTracks());
        return destination.stream;
      };
      const NativeWebSocket = WebSocket;
      class FakeScribeSocket {
        static OPEN = 1;
        readyState = 0;
        listeners = new Map<string, Array<(event: any) => void>>();
        constructor(readonly address: string) {
          if (new URL(address).hostname !== 'api.elevenlabs.io')
            return new NativeWebSocket(address) as any;
          w.fakeSockets.push(this);
          queueMicrotask(() => {
            if (this.readyState !== 0) return;
            this.readyState = 1;
            this.emit('open', {});
            this.emitServer({ message_type: 'session_started' });
          });
        }
        addEventListener(event: string, listener: (event: any) => void) {
          this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        }
        send() {}
        close() {
          if (this.readyState === 3) return;
          this.readyState = 3;
          this.emit('close', { code: 1000 });
        }
        emit(event: string, value: any) {
          for (const listener of this.listeners.get(event) ?? []) listener(value);
        }
        emitServer(value: object) {
          this.emit('message', { data: JSON.stringify(value) });
        }
      }
      w.WebSocket = FakeScribeSocket;
      w.emitScribe = (value: object) => w.fakeSockets.at(-1)?.emitServer(value);
      if (noGpu) {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          kind: string,
          ...args: any[]
        ) {
          return kind.includes('webgl') ? null : (original as any).call(this, kind, ...args);
        } as typeof original;
      }
    },
    { speech, noGpu },
  );
  const calls: string[] = [];
  await page.route('**/api/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    calls.push(endpoint);
    if (endpoint === '/api/status')
      return route.fulfill({
        json: {
          mode: 'sample',
          hosted: false,
          sessionRequired: false,
          computer: { local: true },
          integrations: {
            huggingFace: { configured: true },
            elevenLabs: { configured: true, ttsConfigured: true },
          },
        },
      });
    if (endpoint === '/api/voice/realtime-token')
      return realtime
        ? route.fulfill({ json: { token: 'local-fixture-token' } })
        : route.fulfill({ status: 503, json: { error: 'Local batch fixture' } });
    if (endpoint === '/api/voice/speak')
      return route.fulfill({ body: 'local-audio-fixture', contentType: 'audio/mpeg' });
    if (endpoint === '/api/computer/request')
      return route.fulfill({
        json: {
          state: { ...empty, task: completed('fresh') },
          summary: 'The fixture task completed.',
        },
      });
    return route.fulfill({ json: empty });
  });
  await page.goto('/?desktop=buddy');
  await expect(
    page.getByRole('button', { name: 'Start voice conversation', exact: true }),
  ).toBeEnabled();
  if (!noGpu)
    await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-renderer', 'webgl');
  await mkdir(output, { recursive: true });
  return calls;
}

async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T01:00:00Z'));
}

async function openPanel(page: Page, frozen = false) {
  if ((await page.locator('.buddy').getAttribute('data-panel-stage')) !== 'open') {
    await page.getByRole('button', { name: /^Expand buddy/ }).click();
    if (frozen) await page.clock.runFor(350);
  }
  await expect(page.locator('.buddy')).toHaveAttribute('data-panel-stage', 'open');
}

test('exact idle deadline survives no GPU, opening stays asleep and typing wakes without capture', async ({
  page,
}) => {
  await freezeClock(page);
  const calls = await setup(page, { noGpu: true });
  await openPanel(page, true);
  const input = page.getByRole('textbox', { name: 'Tell your buddy what to do' });
  await input.click();
  await page.clock.fastForward(119999);
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'awake');
  // Decorative pointer movement does not extend the deadline.
  await page.mouse.move(5, 5);
  await page.clock.fastForward(1);
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'asleep');
  const signal = page.locator('.buddy .insight-signal');
  await expect(signal).toHaveAttribute('data-behavior', 'sleep');
  await expect(signal.locator('img')).toHaveAttribute('src', '/buddy/sprout-v007-sleep.png');
  await expect(signal.locator('.signal-sleep-zs')).toHaveAttribute('data-moving', 'false');
  await page
    .locator('.buddy')
    .screenshot({ path: path.join(output, 'automatic-sleep-no-gpu.png') });
  await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
  await page.clock.runFor(350);
  await openPanel(page, true);
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'asleep');
  await input.fill('A text-only wake keeps the microphone off.');
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'awake');
  expect(await page.evaluate(() => (window as any).micCalls)).toBe(0);
  expect(calls).not.toContain('/api/voice/realtime-token');
  await expect(input).toHaveValue('A text-only wake keeps the microphone off.');
});

for (const realtime of [true, false])
  test(`silent ${realtime ? 'Scribe' : 'batch'} listening times out, releases capture and explicit mic activation wakes`, async ({
    page,
  }) => {
    test.setTimeout(45000);
    await freezeClock(page);
    await setup(page, { realtime });
    await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
    await page.clock.runFor(350);
    await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-phase', 'listening');
    await page.getByRole('textbox', { name: 'Tell your buddy what to do' }).click();
    await page.clock.fastForward(119999);
    await expect(
      page.getByRole('button', { name: 'Pause voice conversation', exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(1);
    await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'asleep');
    expect(
      await page.evaluate(() =>
        (window as any).fixtureTracks
          .flat()
          .every((track: MediaStreamTrack) => track.readyState === 'ended'),
      ),
    ).toBe(true);
    if (realtime)
      expect(
        await page.evaluate(() =>
          (window as any).fakeSockets.every((socket: any) => socket.readyState === 3),
        ),
      ).toBe(true);
    await page.clock.runFor(1800);
    await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'sleep');
    await page.locator('.buddy').screenshot({
      path: path.join(output, `automatic-sleep-${realtime ? 'scribe' : 'batch'}.png`),
    });
    const previous = await page.evaluate(() => (window as any).micCalls);
    await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(previous + 1);
    await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'awake');
    await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'wake');
    await page.clock.runFor(1700);
    await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'normal');
    await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
  });

test('a completed task waits for its actual long final reply then jumps once, preserving the speaking identity', async ({
  page,
}) => {
  test.setTimeout(45000);
  await setup(page, { speech: true });
  await openPanel(page);
  let releaseReply!: () => void;
  const replyGate = new Promise<void>((resolve) => {
    releaseReply = resolve;
  });
  await page.route('**/api/voice/speak', async (route) => {
    await replyGate;
    await route.fulfill({ body: 'local-audio-fixture', contentType: 'audio/mpeg' });
  });
  const signal = page.locator('.buddy .insight-signal');
  await signal.evaluate((element) => {
    const w = window as any;
    w.joyLog = [];
    new MutationObserver((events) => {
      if (
        events.some((event) => event.attributeName === 'data-behavior') &&
        element.getAttribute('data-behavior') === 'joy'
      )
        w.joyLog.push('joy');
    }).observe(element, { attributes: true, attributeFilter: ['data-behavior'] });
  });
  await page
    .getByRole('textbox', { name: 'Tell your buddy what to do' })
    .fill('Complete this local fixture task');
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
    'The fixture task completed.',
  );
  await expect(page.locator('.buddy-shell')).not.toHaveAttribute('data-sprout-cue', 'joy');
  releaseReply();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).fixtureAudio.some((audio: any) => !audio.paused)),
    )
    .toBe(true);
  await expect(signal).toHaveAttribute('data-phase', 'speaking');
  await page.waitForTimeout(1400); // Exceeds the old Done lifetime; the final reply is still playing.
  expect(await page.evaluate(() => (window as any).joyLog)).toEqual([]);
  await page
    .locator('.buddy')
    .screenshot({ path: path.join(output, 'automatic-speaking-final-reply.png') });
  await page.evaluate(() => (window as any).fixtureAudio.at(-1).finish());
  await expect(signal).toHaveAttribute('data-behavior', 'joy');
  await expect(signal).not.toHaveAttribute('data-done', 'true');
  await page.waitForTimeout(450);
  await signal.screenshot({ path: path.join(output, 'automatic-success-jump.png') });
  await expect(signal).toHaveAttribute('data-behavior', 'normal');
  expect(await page.evaluate(() => (window as any).joyLog)).toEqual(['joy']);
  // Repeated server completion of the same task remains deduplicated.
  await page
    .getByRole('textbox', { name: 'Tell your buddy what to do' })
    .fill('Repeat that completed result');
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).fixtureAudio.some((audio: any) => !audio.paused)),
    )
    .toBe(true);
  await page.evaluate(() => (window as any).fixtureAudio.at(-1).finish());
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).joyLog)).toEqual(['joy']);
});

test('pausing the microphone during work keeps the task running, celebrates its success then rests', async ({
  page,
}) => {
  test.setTimeout(45000);
  const calls = await setup(page);
  let releaseTask!: () => void;
  const taskGate = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });
  await page.route('**/api/computer/request', async (route) => {
    await taskGate;
    await route.fulfill({
      json: {
        state: { ...empty, task: completed('paused-during-work') },
        summary: 'The task finished after voice pause.',
      },
    });
  });
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-phase', 'listening');
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Complete this local fixture',
    }),
  );
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-phase', 'thinking');
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-pending-rest', 'true');
  expect(
    await page.evaluate(() =>
      (window as any).fixtureTracks
        .flat()
        .every((track: MediaStreamTrack) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(calls).not.toContain('/api/computer/stop');
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-phase', 'thinking');
  releaseTask();
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'joy');
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'asleep');
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'sleep');
  await page
    .locator('.buddy')
    .screenshot({ path: path.join(output, 'paused-work-success-then-sleep.png') });
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Settings and connections' }).click();
  await expect(
    page.getByRole('button', { name: /^(Celebrate|Rest Sprout|Wake Sprout)$/ }),
  ).toHaveCount(0);
});

test('explicit resume while work continues clears deferred rest and starts a fresh microphone', async ({
  page,
}) => {
  test.setTimeout(45000);
  const calls = await setup(page);
  let releaseTask!: () => void;
  const taskGate = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });
  await page.route('**/api/computer/request', async (route) => {
    await taskGate;
    await route.fulfill({
      json: {
        state: { ...empty, task: completed('resume-during-work') },
        summary: 'The resumed task completed.',
      },
    });
  });
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-phase', 'listening');
  await page.evaluate(() =>
    (window as any).emitScribe({
      message_type: 'committed_transcript',
      text: 'Complete this resumed fixture',
    }),
  );
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-phase', 'thinking');
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-pending-rest', 'true');
  const previous = await page.evaluate(() => (window as any).micCalls);
  await page.getByRole('button', { name: 'Start voice conversation', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).micCalls)).toBe(previous + 1);
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-pending-rest', 'false');
  expect(calls).not.toContain('/api/computer/stop');
  releaseTask();
  await expect(page.getByRole('log', { name: 'Buddy conversation' })).toContainText(
    'The resumed task completed.',
  );
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'joy');
  await expect(page.locator('.buddy .insight-signal')).toHaveAttribute('data-behavior', 'normal');
  await expect(page.locator('.buddy-shell')).toHaveAttribute('data-sprout-presence', 'awake');
  await expect(
    page.getByRole('button', { name: 'Pause voice conversation', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pause voice conversation', exact: true }).click();
});
