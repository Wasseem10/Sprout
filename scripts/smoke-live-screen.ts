// Live HF vision rehearsal using an actual screenshot captured from native InsightOS.
// Does not touch the running desktop session. Consumes one inference request.
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';

const cfg = {
  ...config(),
  localDir: path.resolve('.local/live-screen-check'),
};
if (!cfg.hfToken) throw new Error('HF_TOKEN is required for live screen rehearsal.');
const screenshot = await readFile('artifacts/buddy-expanded.png');
const image = `data:image/png;base64,${screenshot.toString('base64')}`;
const computer = new ComputerController(cfg);
try {
  await mkdir(cfg.localDir, { recursive: true });
  await computer.init();
  await computer.selectScreen('InsightOS desktop buddy (native screenshot)', image);
  const result = await computer.action({ tool: 'describeScreen' }, new AbortController().signal);
  const description = result.state.screen?.description ?? '';
  if (!description.trim()) throw new Error('Hugging Face returned an empty screen description.');
  const report = {
    checkedAt: new Date().toISOString(),
    screenshot: 'artifacts/buddy-expanded.png',
    route: cfg.hfVisionModel,
    description,
    note: 'Live HF interpretation of a previously captured native screenshot. Human-selected window UI still needs rehearsal.',
  };
  await writeFile(path.join(cfg.localDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await computer.close();
}
