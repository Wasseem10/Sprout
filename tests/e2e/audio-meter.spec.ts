import { expect, test } from '@playwright/test';

test('owned TTS graph measures real local PCM and clears on pause/end without microphone or provider calls', async ({
  page,
}) => {
  let providerCalls = 0;
  await page.route('**/api/voice/**', (route) => {
    providerCalls++;
    return route.abort();
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('This audio-meter proof must never capture a microphone');
    };
  });
  await page.route('**/local-audio-meter-proof', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  // Isolate the actual Web Audio path from unrelated studio GPU work.
  await page.goto('/local-audio-meter-proof');
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = 'Run local audio meter proof';
    button.id = 'local-audio-meter-proof';
    button.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999';
    button.onclick = () => {
      (window as any).localAudioMeterProof = (async () => {
        const path = '/src/audioPresentation.ts';
        const { createAudioPresentation, createOutputAudioMeter } = (await import(
          path
        )) as typeof import('../../src/audioPresentation');
        const sampleRate = 16000;
        const count = sampleRate;
        const buffer = new ArrayBuffer(44 + count * 2);
        const view = new DataView(buffer);
        const text = (offset: number, value: string) => {
          for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
        };
        text(0, 'RIFF');
        view.setUint32(4, buffer.byteLength - 8, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, count * 2, true);
        for (let i = 0; i < count; i++) {
          const t = i / sampleRate;
          const value = t >= 0.15 && t < 0.6 ? Math.sin(t * 2 * Math.PI * 440) * 0.2 : 0;
          view.setInt16(44 + i * 2, value * 32767, true);
        }
        const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
        const presentation = createAudioPresentation();
        const meter = createOutputAudioMeter(presentation);
        const generation = presentation.beginOutput();
        const audio = await meter.prepare(new Audio(url), generation, () => false);
        if (!audio) throw new Error('Cancelled unexpected local proof');
        audio.loop = true;
        const beforePlay = { ...presentation.ref.current };
        const samples: Array<{ time: number; level: number | null; playing: boolean }> = [];
        const capture = setInterval(
          () =>
            samples.push({
              time: audio.currentTime,
              level: presentation.ref.current.outputLevel,
              playing: presentation.ref.current.outputPlaying,
            }),
          20,
        );
        try {
          await audio.play();
          const deadline = performance.now() + 7000;
          while ((presentation.ref.current.outputLevel ?? 0) <= 0.2) {
            if (performance.now() > deadline)
              throw new Error('Actual local PCM level was not measured');
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          samples.push({
            time: audio.currentTime,
            level: presentation.ref.current.outputLevel,
            playing: presentation.ref.current.outputPlaying,
          });
          audio.pause();
          const paused = { ...presentation.ref.current };
          await new Promise((resolve) => setTimeout(resolve, 80));
          const stillPaused = { ...presentation.ref.current };
          const finished = new Promise<void>((resolve, reject) => {
            audio.addEventListener('ended', () => resolve(), { once: true });
            audio.addEventListener('error', () => reject(new Error('Local PCM playback failed')), {
              once: true,
            });
          });
          audio.loop = false;
          audio.currentTime = 0.7;
          await audio.play();
          await finished;
          const ended = { ...presentation.ref.current };
          meter.stop();
          // A separate all-silent PCM asset proves available zero independently of
          // brief tone timing or missed display samples under browser contention.
          for (let offset = 44; offset < buffer.byteLength; offset += 2)
            view.setInt16(offset, 0, true);
          const silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
          const silentGeneration = presentation.beginOutput();
          const silentAudio = await meter.prepare(
            new Audio(silentUrl),
            silentGeneration,
            () => false,
          );
          if (!silentAudio) throw new Error('Cancelled unexpected silence proof');
          silentAudio.loop = true;
          let silence;
          try {
            await silentAudio.play();
            await new Promise((resolve) => setTimeout(resolve, 80));
            silence = { ...presentation.ref.current };
          } finally {
            meter.stop();
            silentAudio.pause();
            URL.revokeObjectURL(silentUrl);
          }
          return {
            beforePlay,
            paused,
            stillPaused,
            ended,
            cancelled: { ...presentation.ref.current },
            silence,
            samples,
          };
        } finally {
          clearInterval(capture);
          meter.stop();
          audio.pause();
          URL.revokeObjectURL(url);
        }
      })();
    };
    document.body.append(button);
  });
  await page.getByRole('button', { name: 'Run local audio meter proof' }).click();
  const result = await page.evaluate(() => (window as any).localAudioMeterProof);
  expect(result.beforePlay).toMatchObject({ outputLevel: 0, outputPlaying: false });
  expect(result.samples.some((sample: any) => sample.playing && sample.level > 0.2)).toBe(true);
  expect(result.silence).toMatchObject({ outputLevel: 0, outputPlaying: true });
  expect(result.paused).toMatchObject({ outputLevel: 0, outputPlaying: false });
  expect(result.stillPaused).toMatchObject({ outputLevel: 0, outputPlaying: false });
  expect(result.ended).toMatchObject({ outputLevel: 0, outputPlaying: false });
  expect(result.cancelled).toMatchObject({ outputLevel: null, outputPlaying: false });
  expect(result.cancelled.playbackGeneration).toBeGreaterThan(result.ended.playbackGeneration);
  expect(providerCalls).toBe(0);
});
