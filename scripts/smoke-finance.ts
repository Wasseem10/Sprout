import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';

const cfg = { ...config(), localDir: path.resolve('.local/finance-rehearsal') };
await mkdir(cfg.localDir, { recursive: true });
await mkdir('artifacts', { recursive: true });
const controller = new ComputerController(cfg, { headless: true });
const steps: { request: string; reply: string; milliseconds: number }[] = [];
async function say(request: string) {
  const start = performance.now();
  const result = await controller.request(request, AbortSignal.timeout(60000));
  steps.push({
    request,
    reply: result.summary,
    milliseconds: Math.round(performance.now() - start),
  });
  return result;
}
try {
  await controller.init();
  await say('Start the finance demo');
  await say('Why did my finance spending increase?');
  const ai = await say('What happens if I spend one hundred dollars less on groceries?');
  assert.equal(ai.state.finance?.scenarioRemaining, 29000);
  assert.equal(ai.state.finance?.narrativeProvider, 'hugging-face');
  await say('Check a $1200 loan at 12% APR over 24 months with a $30 limit');
  const corrected = await say('Change the payment limit to $60');
  assert.equal(corrected.state.finance?.loan?.withinLimit, true);
  await say('Reduce groceries by $50');
  assert.equal(controller.snapshot().finance?.scenarioRemaining, 24000);
  await say('Undo my finance change');
  assert.equal(controller.snapshot().finance?.scenarioRemaining, 29000);
  await say('Export my finance Excel workbook');
  const exported = await controller.financeExport();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(exported.bytes as any);
  assert.equal(book.worksheets.length, 6);
  const deck = await controller.action(
    {
      tool: 'createPresentation',
      request:
        'Create a finance presentation using our verified household spending, hypothetical grocery reduction and payment comparison. Clearly label sample transactions and user assumptions.',
      slides: 4,
      open: false,
    },
    AbortSignal.timeout(60000),
  );
  const deckBytes = await readFile(
    path.join(cfg.localDir, 'finance-workspace', deck.state.presentation!.filename),
  );
  assert.equal(deckBytes.subarray(0, 2).toString(), 'PK');
  const evidence = {
    checkedAt: new Date().toISOString(),
    ok: true,
    steps,
    source: 'Synthetic household records',
    aiIntent: 'Live Hugging Face inference',
    workbook: {
      filename: exported.filename,
      bytes: exported.bytes.length,
      sheets: book.worksheets.map((s) => s.name),
    },
    presentation: { ...deck.state.presentation, bytes: deckBytes.length },
    limits: [
      'Databricks not exercised without credentials',
      'Vultr not deployed',
      'Physical microphone and interruption not exercised',
      'No bank account, lender offer or payment involved',
    ],
  };
  await writeFile('artifacts/finance-rehearsal.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  await controller.close();
}
