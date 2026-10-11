import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from '../server/config.js';
import { ComputerController } from '../server/computer/controller.js';
import { analyzeLocal, parseCsv } from '../shared/analysis.js';
import { includedStudioRows, studioMoney, studioPercent } from '../shared/studio.js';

// This rehearsal uses owned, explicitly fictional records. It spends a small
// amount of configured Hugging Face/Databricks credits and opens no native apps.
const cfg = { ...config(), cloudUrl: '', localDir: path.resolve('.local/studio-live-verified') };
assert(cfg.hfToken, 'Connect Hugging Face before the live rehearsal.');
assert(
  cfg.dbHost && cfg.dbToken && cfg.dbWarehouse,
  'Connect Databricks before the live rehearsal.',
);
await mkdir(cfg.localDir, { recursive: true });
const sourcePath = path.resolve('data/operations-synthetic.csv');
const sourceBytes = await readFile(sourcePath);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const source = parseCsv(sourceBytes.toString('utf8'), 'Operations sample.csv', true);
const JSZip = createRequire(import.meta.url)('jszip');
const computer = new ComputerController(cfg);
const signal = AbortSignal.timeout(180000);
const steps: { request: string; milliseconds: number }[] = [];
async function say(request: string) {
  const start = performance.now();
  const result = await computer.request(request, signal);
  steps.push({ request, milliseconds: Math.round(performance.now() - start) });
  return result;
}
const value = (cell: ExcelJS.Cell): unknown =>
  cell.value && typeof cell.value === 'object' && 'formula' in cell.value
    ? cell.value.result
    : cell.value;

try {
  await computer.init();
  const start = await say('Start the analysis demo');
  assert.equal(start.state.studio!.workspace.dataset!.synthetic, true);
  const model = await say('In the studio, illustrate the regional differences using a graph');
  assert.equal(model.state.studio!.interpretation, 'hugging-face');
  await say('Wait, compare only the same locations');
  const inspected = await say('How did you get that number? Show the source rows');
  assert.equal(inspected.state.studio!.evidence.length, 30);
  // Combined provider + export deliberately exercises the routing boundary.
  const exported = await say(
    'Verify the studio analysis with Databricks and create an Excel and PowerPoint report',
  );
  const studio = exported.state.studio!;
  const result = studio.workspace.result!;
  const expected = analyzeLocal(source, result.comparison);
  assert.equal(result.provider, 'databricks');
  assert.match(result.queryReference, /^Databricks statement [a-zA-Z0-9-]+;/);
  for (const key of [
    'previousTotal',
    'currentTotal',
    'includedRows',
    'includedLocations',
    'excludedLocations',
  ] as const)
    assert.equal(result[key], expected[key], `SQL/source disagreement for ${key}`);
  assert.deepEqual(result.regions, expected.regions);
  assert.equal(result.previousTotal, 126000);
  assert.equal(result.currentTotal, 141000);

  const excel = await computer.studioExport('excel');
  const powerpoint = await computer.studioExport('powerpoint');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excel.bytes as any);
  const analysis = workbook.getWorksheet('Analysis')!;
  const records = workbook.getWorksheet('Source records')!;
  // ExcelJS drops a numeric zero formula cache when reading its own files.
  // Check the written OOXML so zero inclusion values are verified, not assumed.
  const workbookZip = await JSZip.loadAsync(excel.bytes);
  const sourceXml = await workbookZip.file('xl/worksheets/sheet2.xml').async('string');
  assert.equal(value(analysis.getCell('B3')), 1);
  assert.equal(value(analysis.getCell('B8')), 'Databricks SQL reconciled with source records');
  assert.equal(value(analysis.getCell('B10')), studio.revision);
  let totalRow = 0;
  analysis.eachRow((row, rowIndex) => {
    if (row.getCell(1).value === 'Total') totalRow = rowIndex;
  });
  assert(totalRow > 12);
  assert.equal(value(analysis.getCell(totalRow, 2)), result.previousTotal);
  assert.equal(value(analysis.getCell(totalRow, 3)), result.currentTotal);
  assert.equal(value(analysis.getCell(totalRow, 4)), result.currentTotal - result.previousTotal);
  assert.equal(value(analysis.getCell(totalRow, 5)), result.percent! / 100);
  const included = includedStudioRows(studio);
  let sourcePrevious = 0,
    sourceCurrent = 0,
    includedCount = 0;
  included.forEach((row, index) => {
    const n = index + 2;
    assert.equal(value(records.getCell(n, 2)), row.location_id);
    assert.equal(value(records.getCell(n, 4)), row.revenue);
    const inclusionCell = sourceXml.match(new RegExp(`<c r="G${n}"[^>]*>([\\s\\S]*?)<\\/c>`))![1];
    const cachedInclusion = inclusionCell.match(/<v>(.*?)<\/v>/);
    assert(cachedInclusion, `Missing inclusion formula cache in G${n}`);
    assert.equal(Number(cachedInclusion[1]), Number(row.included));
    assert.equal(value(records.getCell(n, 8)), `${studio.sourceSheet} row ${row.sourceRow}`);
    assert.match((records.getCell(n, 7).value as ExcelJS.CellFormulaValue).formula, /^IF\(AND\(/);
    if (row.included) {
      includedCount++;
      if (row.date <= result.comparison.previous.end)
        sourcePrevious += Math.round(row.revenue * 100);
      else sourceCurrent += Math.round(row.revenue * 100);
    }
  });
  assert.equal(sourcePrevious / 100, result.previousTotal);
  assert.equal(sourceCurrent / 100, result.currentTotal);
  assert.equal(includedCount, result.includedRows);
  assert.equal(value(records.getCell('J2')), result.queryReference);

  const zip = await JSZip.loadAsync(powerpoint.bytes);
  assert.equal(
    Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length,
    6,
  );
  const finding = await zip.file('ppt/slides/slide2.xml').async('string');
  for (const label of [
    studioMoney(result.previousTotal),
    studioMoney(result.currentTotal),
    studioPercent(result.percent),
  ])
    assert(finding.includes(label), `PowerPoint is missing ${label}`);
  const chart = await zip.file('ppt/charts/chart1.xml').async('string');
  assert(chart.includes('<c:barChart>') && chart.includes('<c:externalData '));
  const series = [...chart.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)];
  assert.equal(series.length, 2);
  const groups = result.regions
    .slice(0, studio.workspace.view.topN ?? result.regions.length)
    .slice(0, 10);
  for (let i = 0; i < series.length; i++) {
    const xml = series[i][1];
    const numbers = xml.match(/<c:val>([\s\S]*?)<\/c:val>/)![1];
    const actual = [...numbers.matchAll(/<c:pt idx="\d+"><c:v>(.*?)<\/c:v><\/c:pt>/g)].map((m) =>
      Number(m[1]),
    );
    assert.deepEqual(
      actual,
      groups.map((group) => (i === 0 ? group.previous : group.current)),
    );
  }
  const embeddedName = Object.keys(zip.files).find((name) =>
    /^ppt\/embeddings\/.*\.xlsx$/.test(name),
  )!;
  assert(embeddedName, 'The native chart must have an editable embedded workbook.');
  const embedded = new ExcelJS.Workbook();
  await embedded.xlsx.load(await zip.file(embeddedName).async('nodebuffer'));
  const chartSheet = embedded.worksheets[0];
  groups.forEach((group, i) => {
    assert.equal(value(chartSheet.getCell(i + 2, 1)), group.region);
    assert.equal(value(chartSheet.getCell(i + 2, 2)), group.previous);
    assert.equal(value(chartSheet.getCell(i + 2, 3)), group.current);
  });
  const notes = await zip.file('ppt/notesSlides/notesSlide2.xml').async('string');
  assert(notes.includes(result.queryReference.replace(/&/g, '&amp;').replace(/</g, '&lt;')));
  assert.equal(
    hash(await readFile(sourcePath)),
    hash(sourceBytes),
    'Original source was modified.',
  );
  await writeFile(path.join(cfg.localDir, 'verified-analysis.xlsx'), excel.bytes);
  await writeFile(path.join(cfg.localDir, 'verified-analysis.pptx'), powerpoint.bytes);
  const receipt = {
    checkedAt: new Date().toISOString(),
    ok: true,
    source: 'Owned fictional operations CSV, 39 records',
    interpretation: 'Actual Hugging Face inference',
    analytics: 'Actual Databricks SQL reconciled against source',
    statementReference: result.queryReference,
    previousTotal: result.previousTotal,
    currentTotal: result.currentTotal,
    growthPercent: result.percent,
    includedRows: result.includedRows,
    excludedLocations: result.excludedLocations,
    verified: [
      'Excel cached formula results and all source-row inclusion formulas',
      'Six PowerPoint slides',
      'Native chart caches and editable embedded XLSX values',
      'SQL reference in workbook and deck notes',
      'Original CSV unchanged',
    ],
    outputs: { excel: excel.filename, powerpoint: powerpoint.filename },
    steps,
    limits: [
      'No physical microphone or native Office launch',
      'Excel formula caches verified, not live Excel recalculation',
      'Constrained six-column operations format, not arbitrary financial workbooks',
      'PowerPoint remains a snapshot of this analysis revision',
    ],
  };
  await writeFile(path.join(cfg.localDir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {
  await computer.close();
}
