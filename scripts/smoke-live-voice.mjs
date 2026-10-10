// Explicit live smoke test: uses the locally configured providers and their credits.
// Input is a synthetic WAV, never an ambient microphone recording.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4311';
const fixture = await readFile('.local/voice-command-test.wav');
const report = {
  checkedAt: new Date().toISOString(),
  input: 'Windows synthesized WAV: print squares one through five',
  checks: [],
  microphoneHardware: 'Not tested',
  speakerHardware: 'Not tested',
};
const session = await fetch(base + '/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(session.status, 200);
const cookie = session.headers.get('set-cookie').split(';')[0];
async function post(route, body) {
  const start = Date.now();
  const multipart = body instanceof FormData;
  const response = await fetch(base + route, {
    method: 'POST',
    headers: { cookie, ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
    body: multipart ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(route + ': ' + (await response.text()));
  const result = await response.json();
  report.checks.push({ route, elapsedMs: Date.now() - start, status: response.status });
  return result;
}
const form = new FormData();
form.append('audio', new Blob([fixture], { type: 'audio/wav' }), 'synthetic-request.wav');
const transcription = await post('/api/voice/transcribe', form);
assert.equal(transcription.provider, 'elevenlabs');
assert.match(transcription.text, /squares/i);
report.transcript = transcription.text;
await post('/api/computer/demo-folder', {});
const created = await post('/api/computer/request', { request: transcription.text });
assert.equal(created.state.code.provider, 'hugging-face');
const executed = await post('/api/computer/request', { request: 'Run that program.' });
assert.equal(executed.state.code.exitCode, 0);
for (const n of [1, 4, 9, 16, 25])
  assert.match(executed.state.code.output, new RegExp('\\b' + n + '\\b'));
report.filename = executed.state.code.filename;
report.output = executed.state.code.output;
const audio = await fetch(base + '/api/voice/speak', {
  method: 'POST',
  headers: { cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: executed.summary }),
  signal: AbortSignal.timeout(60000),
});
assert.equal(audio.status, 200);
assert.match(audio.headers.get('content-type'), /audio\/mpeg/);
const bytes = Buffer.from(await audio.arrayBuffer());
assert.ok(bytes.length > 1000);
await writeFile('.local/voice-rehearsal-reply.mp3', bytes);
report.checks.push({ route: '/api/voice/speak', status: audio.status, bytes: bytes.length });
await writeFile('artifacts/live-voice-rehearsal.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
