import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';

// Public accessibility articles; no personal files or native application actions.
const cfg = config(),
  root = path.join(cfg.localDir, 'presentation-research-rehearsal');
await mkdir(root, { recursive: true });
const computer = new ComputerController(cfg, { headless: true });
await computer.init();
const started = Date.now();
try {
  const created = await computer.request(
    'Research accessible presentation design from https://www.w3.org/WAI/tips/designing/ and https://www.w3.org/WAI/tips/writing/ and make a PowerPoint. Finish with a proposed authoring workflow. Save only.',
    new AbortController().signal,
  );
  assert.equal(created.state.presentation?.slideCount, 5);
  assert.ok(created.state.presentation?.research?.sources.length);
  assert.equal(created.state.presentation?.opened, false);
  await writeFile(path.join(root, 'preview.pptx'), (await computer.presentationExport()).bytes);
  await writeFile(
    path.join(root, 'view.json'),
    JSON.stringify(created.state.presentation!.research, null, 2),
  );
  const read = await computer.request('Read slide two', new AbortController().signal);
  assert.ok(read.summary.length > 40);
  const references = await computer.request('Read the sources', new AbortController().signal);
  assert.match(references.summary, /w3\.org/);
  const receipt = {
    completedInMs: Date.now() - started,
    slides: 5,
    sources: created.state.presentation!.research!.sources.map(({ id, title, url }) => ({
      id,
      title,
      url,
    })),
    verifiedQuotes: created.state.presentation!.research!.deck.slides.reduce(
      (n, s) => n + s.points.length,
      0,
    ),
    diagramStages: created.state.presentation!.research!.deck.diagram.stages.map((s) => s.label),
    nativeAppOpened: false,
  };
  await writeFile(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally {
  await computer.close();
}
