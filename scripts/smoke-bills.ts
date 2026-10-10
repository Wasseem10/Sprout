import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config.js';
import { readBillDocument } from '../server/computer/bill-documents.js';
import { ComputerController } from '../server/computer/controller.js';

const cfg = { ...config(), localDir: path.resolve('.local/bill-rehearsal'), neonUrl: '' },
  signal = AbortSignal.timeout(180000);
const c = new ComputerController(cfg, { headless: true });
const steps: Record<string, unknown>[] = [];
let databricksVerified = false;
try {
  await mkdir(cfg.localDir, { recursive: true });
  await c.init();
  await c.request('Read sample PDF bills', signal);
  if (c.snapshot().bills?.documents.length)
    throw new Error('Discovery read content before confirmation.');
  const started = Date.now();
  await c.request('yes', signal);
  const docs = c.snapshot().bills!.documents;
  if (docs.some((d) => d.provider !== 'hugging-face'))
    throw new Error('Live PDF model extraction did not complete.');
  for (const d of docs)
    if (d.warnings.length) throw new Error('Live PDF has unresolved extraction warnings.');
  steps.push({
    step: 'live PDF text extraction',
    documents: docs.map((d) => ({ filename: d.filename, values: d.values, provider: d.provider })),
    elapsedMs: Date.now() - started,
  });
  await c.request('confirm this bill', signal);
  await c.request('confirm this bill', signal);
  const comparison = c.snapshot().energy!.comparison;
  if (comparison.billChange !== 45 || comparison.usageEffect !== 45 || comparison.rateEffect !== 0)
    throw new Error('Comparison mismatch.');
  if (cfg.dbHost && cfg.dbWarehouse && cfg.dbToken) {
    const checked = await c.request('Analyze my energy bills using Databricks', signal);
    if (checked.state.energy?.provider !== 'databricks')
      throw new Error('Databricks verification failed.');
    databricksVerified = true;
    steps.push({
      step: 'live Databricks bill reconciliation',
      queryReference: checked.state.energy.queryReference,
      comparison: checked.state.energy.comparison,
    });
  }
  await c.request('I can afford sixty dollars a month', signal);
  await c.request('Choose duct repair', signal);
  await c.request('Prepare my energy application', signal);
  await c.request('Use demo details', signal);
  if (!c.snapshot().energy?.applicationVerified)
    throw new Error('Initial practice application did not verify.');
  await c.request('Wait, I can only afford thirty dollars a month', signal);
  if (c.snapshot().energy?.budget !== 30) throw new Error('Spoken budget correction failed.');
  const changed = c.snapshot().energy!;
  if (
    changed.applicationVerified ||
    changed.quotes.find((q) => q.id === changed.selected)?.fitsBudget !== false
  )
    throw new Error('Over-budget application retained stale verification.');
  steps.push({
    step: 'budget correction blocks the old choice',
    budget: changed.budget,
    selected: changed.selected,
    applicationVerified: changed.applicationVerified,
  });
  await c.request('Choose weather sealing', signal);
  if (!c.snapshot().energy?.applicationVerified)
    throw new Error('Application rehearsal fields were not verified.');
  steps.push({
    step: 'spoken budget + owned application rehearsal',
    budget: 30,
    applicationVerified: true,
    comparison,
  });
  const image = await loadImage(docs[0].preview!);
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const bytes = canvas.toBuffer('image/png');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/bill-source-preview.png', bytes);
  const scanStarted = Date.now();
  const scan = await readBillDocument('scanned-sample.png', bytes, cfg, signal);
  if (scan.provider !== 'hugging-face' || scan.values.kwh !== 1200 || scan.values.total !== 240)
    throw new Error('Live scanned bill extraction did not match the source.');
  steps.push({
    step: 'live Hugging Face vision extraction',
    values: scan.values,
    provider: scan.provider,
    confirmationRequired: !scan.confirmed,
    elapsedMs: Date.now() - scanStarted,
  });
  await writeFile(
    'artifacts/bill-rehearsal.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        steps,
        physicalMicrophoneTested: false,
        databricksVerified,
        savings: 'hypothetical estimates',
        application: 'owned rehearsal; no real application submitted',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, steps }));
} finally {
  await c.close();
}
