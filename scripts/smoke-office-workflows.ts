// Live Office rehearsal: real Hugging Face outline, editable PPTX, installed
// PowerPoint launch, and calculated values from a real synthetic XLSX file.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';

const cfg = { ...config(), localDir: path.resolve('.local/office-workflows') };
if (!cfg.hfToken) throw new Error('HF_TOKEN is required for the live presentation test.');
await mkdir(cfg.localDir, { recursive: true });
const computer = new ComputerController(cfg);
const signal = new AbortController().signal;
try {
  await computer.init();
  await computer.demoFolder();
  const presentation = await computer.request(
    'Create a four slide PowerPoint about preparing for a job interview',
    signal,
  );
  assert.equal(presentation.state.presentation?.slideCount, 4);
  assert.equal(presentation.state.presentation?.opened, true, presentation.summary);
  const file = path.join(cfg.localDir, 'code-workspace', presentation.state.presentation.filename);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const spreadsheet = await computer.request(
    'Analyze the Excel sales workbook, tell me the top region, and open it in Excel',
    signal,
  );
  assert.match(spreadsheet.summary, /Revenue totals 6,200/);
  assert.match(spreadsheet.summary, /East with 2,700/);
  assert.equal(spreadsheet.state.spreadsheet?.opened, true, spreadsheet.summary);
  const report = {
    checkedAt: new Date().toISOString(),
    presentation: {
      filename: presentation.state.presentation.filename,
      title: presentation.state.presentation.title,
      slides: presentation.state.presentation.slideTitles,
      bytes: bytes.length,
      powerPointLaunchRequested: presentation.state.presentation.opened,
    },
    spreadsheet: {
      filename: spreadsheet.state.spreadsheet?.filename,
      rows: spreadsheet.state.spreadsheet?.rows,
      summary: spreadsheet.summary,
      excelLaunchRequested: spreadsheet.state.spreadsheet?.opened,
    },
  };
  await writeFile('artifacts/office-workflows.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await computer.close();
}
