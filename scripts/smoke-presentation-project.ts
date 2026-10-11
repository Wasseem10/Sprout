import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';

// These existing, synthetic product screenshots are QA fixtures, not the user's future Q3 assets.
const cfg = config();
const root = path.join(cfg.localDir, 'picture-deck-rehearsal');
const sourceRoot = path.join(root, 'assets');
await mkdir(sourceRoot, { recursive: true });
for (const [i, name] of [
  'studio-desktop.png',
  'studio-buddy.png',
  'finance-dashboard.png',
].entries())
  await copyFile(
    path.resolve('artifacts', name),
    path.join(sourceRoot, `0${i + 1}-product-screenshot.png`),
  );
await writeFile(
  path.join(sourceRoot, 'brief.txt'),
  `FICTIONAL QA DEMO. Company: Insight Demo, a fictional software company.
These screenshots illustrate product workflows. They are the three source images.
Create a proposed marketing plan for shareholder review. No verified Q3 financial results are supplied.
Proposed goals: reach teams who need accessible tools; demonstrate voice-directed work; help customers get started.
The final process diagram should have three stages: Awareness, Evaluation, Adoption.
Do not invent revenue, growth, customer counts, or achieved outcomes.`,
);
const computer = new ComputerController(cfg);
await computer.init();
const signal = new AbortController().signal;
try {
  const created = await computer.request(
    `Hey Insight, create a Q3 marketing-plan PowerPoint for shareholders using the three images from folder "${sourceRoot}". Put a process diagram on the last slide. Save only.`,
    signal,
  );
  assert.equal(created.state.presentation?.slideCount, 5);
  assert.equal(created.state.presentation?.project?.assets.length, 3);
  const first = await computer.presentationExport();
  await writeFile(path.join(root, 'preview.pptx'), first.bytes);
  const readback = await computer.request('Read slide two', signal);
  assert.match(readback.summary, /Source: 0[123]-product-screenshot.png/);
  // Avoid launching PowerPoint during automated QA; native opening is tested separately.
  (computer as any).launchOffice = async () => {};
  const swapped = await computer.request('Swap the images on slides two and three', signal);
  const previous = created.state.presentation!.project!.deck.slides.map((s) => s.imageId);
  assert.deepEqual(
    swapped.state.presentation!.project!.deck.slides.map((s) => s.imageId),
    [previous[1], previous[0], previous[2]],
  );
  const revised = await computer.request(
    'Add a customer retention step to the final diagram',
    signal,
  );
  assert.equal(revised.state.presentation?.project?.revision, 3);
  assert.deepEqual(
    revised.state.presentation!.project!.deck.slides,
    swapped.state.presentation!.project!.deck.slides,
  );
  assert.ok(
    revised.state.presentation!.project!.deck.diagram.stages.some((s) =>
      /retention/i.test(s.label),
    ),
  );
  const last = await computer.presentationExport();
  await writeFile(path.join(root, 'revised.pptx'), last.bytes);
  const receipt = {
    at: new Date().toISOString(),
    syntheticQaAssets: true,
    imageCount: 3,
    slideCount: 5,
    sourceRoot,
    file: first.filename,
    revisedFile: last.filename,
    titles: created.state.presentation!.slideTitles,
    diagram: revised.state.presentation!.project!.deck.diagram,
    spokenReadback: readback.spokenSummary,
    bytes: (await readFile(path.join(root, 'revised.pptx'))).length,
  };
  await writeFile(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} catch (error) {
  if (error instanceof Error && error.cause instanceof Error) {
    const cause = error.cause;
    console.log(
      JSON.stringify({
        failedStage: 'vision',
        type: cause.name,
        detail: /^(?:Provider request failed|The operation|This operation|Computer AI)/.test(
          cause.message,
        )
          ? cause.message
          : 'Model output failed parsing or validation.',
      }),
    );
  }
  throw error;
} finally {
  await computer.close();
}
