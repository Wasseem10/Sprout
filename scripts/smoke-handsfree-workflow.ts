// Live rehearsal for the two supported single-request accessibility tasks.
// Uses configured Hugging Face inference, actual Python/VS Code and live Google.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';

const cfg = { ...config(), localDir: path.resolve('.local/handsfree-workflow') };
if (!cfg.hfToken || !cfg.pythonBin || !cfg.codeBin)
  throw new Error('HF_TOKEN, PYTHON_BIN and VSCODE_BIN are required.');
await mkdir(cfg.localDir, { recursive: true });
const computer = new ComputerController(cfg, { headless: true });
const signal = new AbortController().signal;
try {
  await computer.init();
  await computer.demoFolder();
  const code = await computer.request(
    'Write a Python program that prints the squares from 1 through 5, run it, and open it in VS Code',
    signal,
  );
  assert.equal(code.state.code?.provider, 'hugging-face');
  assert.equal(code.state.code?.status, 'completed');
  assert.equal(code.state.code?.editorOpened, true);
  assert.match(code.state.code?.output ?? '', /25/);
  const search = await computer.request(
    'Open Google and search for Python accessibility documentation and read the results to me',
    signal,
  );
  assert.match(search.state.browser?.url ?? '', /^https:\/\/www\.(?:google|bing)\.com\/search/);
  assert.ok((search.state.browser?.searchResults.length ?? 0) > 0);
  assert.ok(search.summary.length > 80);
  const opened = await computer.request('Open result one', signal);
  assert.notEqual(
    opened.state.browser?.url,
    search.state.browser?.url,
    `Result ${JSON.stringify(search.state.browser?.searchResults[0])}; action: ${opened.summary}`,
  );
  const report = {
    checkedAt: new Date().toISOString(),
    code: {
      provider: code.state.code.provider,
      filename: code.state.code.filename,
      output: code.state.code.output,
      exitCode: code.state.code.exitCode,
      editorOpened: code.state.code.editorOpened,
    },
    search: {
      url: search.state.browser?.url,
      title: search.state.browser?.title,
      spokenSummaryPreview: search.summary.slice(0, 500),
      firstResult: search.state.browser?.searchResults[0]?.title,
      openedUrl: opened.state.browser?.url,
    },
  };
  await writeFile('artifacts/handsfree-workflow.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await computer.close();
}
