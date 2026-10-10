// Real provider rehearsal for one spoken command through STT, HF, Python,
// VS Code and TTS. Uses a synthetic WAV, not the laptop microphone.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from '../server/app.js';
import { config } from '../server/config.js';

const cfg = { ...config(), localDir: path.resolve('.local/accessibility-voice') };
if (!cfg.hfToken || !cfg.elevenKey || !cfg.pythonBin || !cfg.codeBin)
  throw new Error('Live HF, ElevenLabs, Python and VS Code configuration is required.');
const app = await buildApp(cfg);
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Local test server failed.');
  const base = `http://127.0.0.1:${address.port}`;
  const session = await fetch(base + '/api/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const post = async (route: string, body: unknown) => {
    const multipart = body instanceof FormData;
    const response = await fetch(base + route, {
      method: 'POST',
      headers: { cookie, ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
      body: multipart ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`${route}: ${await response.text()}`);
    return response;
  };
  const wav = await readFile('.local/handsfree-voice.wav');
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'synthetic-voice.wav');
  const transcription = await (await post('/api/voice/transcribe', form)).json();
  assert.equal(transcription.provider, 'elevenlabs');
  assert.match(transcription.text, /squares/i);
  await post('/api/computer/demo-folder', {});
  const completed = await (
    await post('/api/computer/request', { request: transcription.text })
  ).json();
  assert.equal(completed.state.code.provider, 'hugging-face');
  assert.equal(completed.state.code.status, 'completed', completed.state.code.output);
  assert.equal(completed.state.code.editorOpened, true);
  assert.match(completed.state.code.output, /25/);
  const speech = await post('/api/voice/speak', { text: completed.summary.slice(0, 3000) });
  assert.match(speech.headers.get('content-type') ?? '', /audio\/mpeg/);
  const bytes = Buffer.from(await speech.arrayBuffer());
  assert.ok(bytes.length > 1000);
  const report = {
    checkedAt: new Date().toISOString(),
    input: 'Synthetic WAV; physical microphone not tested',
    transcript: transcription.text,
    provider: completed.state.code.provider,
    filename: completed.state.code.filename,
    output: completed.state.code.output,
    exitCode: completed.state.code.exitCode,
    editorOpened: completed.state.code.editorOpened,
    replyAudioBytes: bytes.length,
    speakerPlayback: 'Not tested',
  };
  await writeFile('artifacts/accessibility-voice-rehearsal.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close();
}
