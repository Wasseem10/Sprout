import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';

const cfg = { ...config(), localDir: path.resolve('.local/energy-rehearsal'), neonUrl: '' };
await mkdir(cfg.localDir, { recursive: true });
await mkdir('artifacts', { recursive: true });
const c = new ComputerController(cfg, { headless: true });
const steps: { request: string; reply: string; milliseconds: number }[] = [];
async function say(request: string) {
  const start = performance.now();
  const result = await c.request(request, AbortSignal.timeout(60000));
  steps.push({
    request,
    reply: result.summary,
    milliseconds: Math.round(performance.now() - start),
  });
  return result;
}
try {
  await c.init();
  await say('Start the energy demo');
  await say('I can afford $60 a month');
  await say('Choose duct repair');
  await say('Prepare my energy application');
  const initial = await say('Use demo details');
  assert.equal(initial.state.energy?.applicationVerified, true);
  await c.interrupt();
  const lower = await say('Wait, I can only afford $30 per month');
  assert.equal(lower.state.energy?.applicationVerified, false);
  assert.match(lower.summary, /above your/);
  const corrected = await say('Choose weather sealing');
  assert.equal(corrected.state.energy?.applicationVerified, true);
  assert.match(corrected.state.browser!.text, /\$30.00/);
  await writeFile(
    'artifacts/energy-application.png',
    Buffer.from(corrected.state.browser!.image.split(',')[1], 'base64'),
  );
  await say('Save my energy plan');
  await say('Record usage 1000 kilowatt-hours over 30 days');
  let presentation: unknown = null;
  if (cfg.hfToken || cfg.cloudUrl) {
    await c.demoFolder();
    const deck = await c.action(
      {
        tool: 'createPresentation',
        request:
          'Present our energy bill analysis and selected efficiency plan. Clearly label sample bills, hypothetical financing and estimated savings.',
        slides: 4,
        open: false,
      },
      AbortSignal.timeout(60000),
    );
    const bytes = await readFile(
      path.join(cfg.localDir, 'code-workspace', deck.state.presentation!.filename),
    );
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    presentation = {
      ...deck.state.presentation,
      bytes: bytes.length,
      provider: 'live Hugging Face inference',
    };
  }
  await writeFile(
    'artifacts/energy-rehearsal.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        steps,
        energy: c.snapshot().energy,
        presentation,
        limits: [
          'Synthetic bills and fictional contractor quotes',
          'Demo browser application; no lender submission',
          'Local persistence verified; Neon not exercised',
          'Local calculations; Databricks not exercised',
          'Physical microphone interruption not exercised',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      ok: true,
      browserReviewVerified: true,
      correctionVerified: true,
      screenshot: 'artifacts/energy-application.png',
      presentation,
      steps: steps.length,
    }),
  );
} finally {
  await c.close();
}
