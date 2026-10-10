// Real Hugging Face + public read-only browser rehearsal. No login or purchase.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ComputerController } from '../server/computer/controller.js';
import { config } from '../server/config.js';
const cfg = { ...config(), localDir: path.resolve('.local/goal-rehearsal'), neonUrl: '' };
await mkdir(cfg.localDir, { recursive: true });
const computer = new ComputerController(cfg, { headless: true });
await computer.init();
const started = Date.now();
try {
  const request =
    'Open https://books.toscrape.com and then open the Travel category. Tell me the first book title and its displayed price. Do not purchase anything.';
  const result = await computer.request(request, AbortSignal.timeout(90000));
  const evidence = {
    checkedAt: new Date().toISOString(),
    provider: 'live-hugging-face',
    site: 'public read-only practice bookstore',
    request,
    elapsedMs: Date.now() - started,
    summary: result.summary,
    task: result.state.task,
    page: {
      url: result.state.browser?.url,
      title: result.state.browser?.title,
      text: result.state.browser?.text.slice(0, 2500),
    },
    purchased: false,
  };
  await writeFile('artifacts/goal-rehearsal.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await computer.close();
}
