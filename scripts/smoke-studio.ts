import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';

const live = process.argv.includes('--live');
const cfg = { ...config(), localDir: path.resolve('.local/studio-rehearsal') };
if (!live) {
  cfg.hfToken = '';
  cfg.cloudUrl = '';
}
await mkdir(cfg.localDir, { recursive: true });
const computer = new ComputerController(cfg),
  signal = AbortSignal.timeout(180000);
try {
  await computer.init();
  await computer.request('Start the analysis demo', signal);
  let model = 'supported-commands';
  if (live) {
    const interpreted = await computer.request(
      'In the studio, illustrate the regional differences using a graph',
      signal,
    );
    assert.equal(interpreted.state.studio?.interpretation, 'hugging-face');
    model = 'hugging-face';
  }
  const corrected = await computer.request('Wait, compare only the same locations', signal);
  assert.equal(corrected.state.studio?.workspace.result?.currentTotal, 141000);
  await computer.request('How did you get that number? Show the source rows', signal);
  if (live) {
    const cloud = await computer.request('Verify the studio analysis with Databricks', signal);
    assert.equal(cloud.state.studio?.workspace.result?.provider, 'databricks');
  }
  const exported = await computer.request('Create an Excel and PowerPoint report', signal);
  const excel = await computer.studioExport('excel'),
    ppt = await computer.studioExport('powerpoint');
  await writeFile(path.join(cfg.localDir, 'preview.xlsx'), excel.bytes);
  await writeFile(path.join(cfg.localDir, 'preview.pptx'), ppt.bytes);
  const report = {
    checkedAt: new Date().toISOString(),
    live,
    interpretation: model,
    analytics: exported.state.studio?.workspace.result?.provider,
    previousTotal: 126000,
    currentTotal: 141000,
    includedRows: 30,
    outputs: { excel: excel.filename, powerpoint: ppt.filename },
    microphone:
      'User previously reported speech and interruption work; this workflow still needs a physical voice rehearsal.',
  };
  await writeFile(
    `artifacts/studio-rehearsal${live ? '-live' : ''}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await computer.close();
}
