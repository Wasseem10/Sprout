// Explicit live provider check. Streams a synthetic WAV; never records a microphone.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from '../server/app.js';
import { config } from '../server/config.js';

const cfg = { ...config(), localDir: path.resolve('.local/realtime-voice-check') };
if (!cfg.elevenKey) throw new Error('Configure ElevenLabs before the live realtime check.');
const app = await buildApp(cfg);
let socket: WebSocket | undefined;
try {
  const wav = await readFile('.local/voice-command-test.wav');
  let sampleRate = 0,
    pcm: Buffer | undefined;
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const name = wav.toString('ascii', offset, offset + 4);
    if (name === 'fmt ') {
      assert.equal(wav.readUInt16LE(offset + 8), 1, 'Fixture must be PCM');
      assert.equal(wav.readUInt16LE(offset + 10), 1, 'Fixture must be mono');
      assert.equal(wav.readUInt16LE(offset + 22), 16, 'Fixture must be 16-bit');
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (name === 'data') pcm = wav.subarray(offset + 8, offset + 8 + size);
    offset += size + 8 + (size % 2);
  }
  assert.ok(pcm && sampleRate === 22050, 'Expected the synthetic 22.05 kHz test fixture');
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const session = await fetch(base + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const start = performance.now();
  const tokenReply = await fetch(base + '/api/voice/realtime-token', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(tokenReply.status, 200, 'Realtime token endpoint must work');
  const { token } = await tokenReply.json();
  assert.ok(typeof token === 'string' && token.length > 0);
  const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
  url.search = new URLSearchParams({
    token,
    model_id: 'scribe_v2_realtime',
    audio_format: 'pcm_22050',
    commit_strategy: 'manual',
    language_code: 'en',
  }).toString();
  socket = new WebSocket(url);
  let resolveReady!: () => void, rejectReady!: (error: Error) => void;
  let resolveTranscript!: (text: string) => void, rejectTranscript!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const committed = new Promise<string>((resolve, reject) => {
    resolveTranscript = resolve;
    rejectTranscript = reject;
  });
  // Attach a rejection handler before streaming, so early provider errors are handled.
  void committed.catch(() => {});
  let firstPartialMs: number | undefined;
  const fail = (message: string) => {
    const error = new Error(message);
    rejectReady(error);
    rejectTranscript(error);
  };
  const timeout = setTimeout(() => fail('Realtime transcription timed out'), 30000);
  socket.addEventListener('error', () => fail('Realtime WebSocket connection failed'));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.message_type === 'session_started') resolveReady();
    if (message.message_type === 'partial_transcript' && message.text)
      firstPartialMs ??= Math.round(performance.now() - start);
    if (message.message_type === 'committed_transcript' && message.text)
      resolveTranscript(message.text);
    if (/error|rate_limited|quota_exceeded/.test(message.message_type))
      fail(`Realtime provider reported ${String(message.message_type).replace(/[^a-z_]/g, '')}`);
  });
  let transcript: string, afterAudioMs: number;
  try {
    await ready;
    const chunkBytes = (sampleRate * 2) / 5; // 200 ms, paced as a real microphone stream.
    for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
      socket.send(
        JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: pcm.subarray(offset, offset + chunkBytes).toString('base64'),
          sample_rate: sampleRate,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const audioFinished = performance.now();
    socket.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: Buffer.alloc(chunkBytes).toString('base64'),
        sample_rate: sampleRate,
        commit: true,
      }),
    );
    transcript = await committed;
    afterAudioMs = Math.round(performance.now() - audioFinished);
  } finally {
    clearTimeout(timeout);
    socket.close();
  }
  assert.match(transcript, /squares/i);
  const report = {
    checkedAt: new Date().toISOString(),
    provider: 'elevenlabs',
    model: 'scribe_v2_realtime',
    input: 'Synthetic Windows voice WAV, streamed in paced 200 ms PCM chunks',
    transcript,
    firstPartialMs,
    committedAfterAudioMs: afterAudioMs,
    physicalMicrophone: 'Not tested',
    physicalSpeakers: 'Not tested',
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/realtime-voice-verification.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  await app.close();
}
