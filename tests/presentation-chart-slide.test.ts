import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { analyzeLocal, datasetVersion } from '../shared/analysis';
import type { Dataset, Comparison } from '../shared/schema';
import type { StudioState } from '../shared/studio';
import { orderedPresentationDeckSchema, orderedPresentationSlideSchema } from '../shared/presentation-deck';
import { buildVerifiedChartSnapshot, captureStudioChartBinding } from '../server/computer/presentation-chart-snapshot';
import { createVerifiedChartSlide, verifiedChartTakeaway } from '../server/computer/presentation-chart-slide';
import { assertOrderedDeckFits, writeOrderedDeck } from '../server/computer/presentation-deck';
import { prepareVerifiedStudioChart, assertPreparedStudioChartCurrent } from '../server/computer/presentation-chart-preparation';
import { Databricks } from '../server/providers/databricks';
import { config } from '../server/config';

afterEach(() => vi.restoreAllMocks());

// Synthetic provider evidence; no Databricks request is made by these tests.
function stateFixture(region = ' North '): StudioState {
  const dataset: Dataset = { id: 'sample-data', name: 'Sample.csv', synthetic: true, rows: [
    { region, location_id: 'A', date: '2026-01-10', revenue: -10.1, operating_start: '2025-01-01', operating_end: null },
    { region, location_id: 'A', date: '2026-04-10', revenue: -5.05, operating_start: '2025-01-01', operating_end: null },
    { region: 'South', location_id: 'B', date: '2026-01-10', revenue: 20.2, operating_start: '2025-01-01', operating_end: null },
    { region: 'South', location_id: 'B', date: '2026-04-10', revenue: 30.35, operating_start: '2025-01-01', operating_end: null },
  ] };
  const comparison: Comparison = { previous: { label: 'Q1', start: '2026-01-01', end: '2026-03-31' }, current: { label: 'Q2', start: '2026-04-01', end: '2026-06-30' }, commonLocations: true };
  const result = analyzeLocal(dataset, comparison);
  result.provider = 'databricks'; result.createdAt = '2026-10-11T10:00:00.000Z';
  result.queryReference = `Databricks statement test-statement; table \`catalog\`.\`schema\`.\`ops_${datasetVersion(dataset).slice(0, 24)}\``;
  const state: StudioState = {
    workspace: { moduleId: 'data', schemaVersion: 1, title: 'Source analysis', dataset, result, view: { kind: 'chart', topN: null }, projectId: null },
    baseline: structuredClone(result), revision: 1, sourceSheet: 'Source', sourceRows: [2, 3, 4, 5],
    lastChange: '', evidence: [], canUndo: false, interpretation: 'hugging-face', outputs: { excel: null, powerpoint: null },
  };
  return state;
}
function fixture(region = ' North ') {
  const state = stateFixture(region);
  return buildVerifiedChartSnapshot(state, captureStudioChartBinding(state), new Date('2026-10-11T10:01:00.000Z')).snapshot;
}

describe('verified snapshot to native slide', () => {
  it('calculates an observation from full cents without inferring a business cause',()=>{
    const base=fixture();
    expect(verifiedChartTakeaway(base)).toContain('rose 150.5% ($15.20)');
    const zero=structuredClone(base);zero.totals.full={previousCents:0,currentCents:1520,deltaCents:1520,percent:null};expect(verifiedChartTakeaway(zero)).toBe('Full revenue rose by $15.20; growth is undefined from a zero baseline.');
    const negative=structuredClone(base);negative.totals.full={previousCents:-1000,currentCents:-1500,deltaCents:-500,percent:-50};expect(verifiedChartTakeaway(negative)).toBe('Full revenue fell 50.0% ($5.00).');
    const flat=structuredClone(base);flat.totals.full={previousCents:1000,currentCents:1000,deltaCents:0,percent:0};expect(verifiedChartTakeaway(flat)).toBe('Full revenue was unchanged (0%).');
  });
  it('uses one projection for exact labels, integer-cent values, stored evidence and source metadata', () => {
    const snapshot = fixture(), slide = createVerifiedChartSlide(snapshot, 'revenue');
    expect(slide.chart.labels).toEqual(snapshot.categories);
    expect(slide.chart.labels).toContain(' North ');
    expect(slide.chart.verifiedSnapshot).toEqual(snapshot);
    expect(slide.chart.series.map(series => series.values)).toEqual(snapshot.series.map(series => series.valuesCents.map(value => value / 100)));
    expect(slide.chart.provenance.summary).toContain('Fictional sample');
    expect(slide.chart.provenance.summary).toContain('dated 2026-10-11');
    expect(slide.chart.provenance.queryRef).toBe('test-statement');
    expect(JSON.stringify(slide)).not.toContain('private_catalog');
  });

  it.each(['value', 'label', 'unit', 'date', 'query'] as const)('refuses a %s change that disagrees with saved evidence', change => {
    const slide = createVerifiedChartSlide(fixture(), 'revenue');
    if (change === 'value') slide.chart.series[0].values[0]++;
    if (change === 'label') slide.chart.labels[0] += ' changed';
    if (change === 'unit') slide.chart.unit = 'EUR';
    if (change === 'date') slide.chart.provenance.verifiedAt = '2026-10-12T10:00:00.000Z';
    if (change === 'query') slide.chart.provenance.queryRef = 'different';
    expect(() => orderedPresentationSlideSchema.parse(slide)).toThrow('saved verified snapshot');
  });

  it('refuses long source labels instead of silently abbreviating or truncating their identity', () => {
    expect(() => createVerifiedChartSlide(fixture('Region '.repeat(11)), 'revenue')).toThrow('labels are too long');
  });

  it('writes an editable native chart with matching workbook cells and notes evidence', async () => {
    const slide = createVerifiedChartSlide(fixture(), 'revenue');
    const deck = orderedPresentationDeckSchema.parse({ schemaVersion: 2, title: 'Verified source demo', theme: 'blue', textScale: 1, allowImageReuse: false,
      slides: [{ id: 'cover', type: 'cover', title: 'Source report', subtitle: 'Synthetic chart verification.' }, slide, { id: 'end', type: 'text', title: 'Review', points: ['Review the dated source evidence before using these figures.'] }],
    });
    expect(() => assertOrderedDeckFits(deck)).not.toThrow();
    const directory = await mkdtemp(path.join(tmpdir(), 'insight-chart-projection-'));
    const file = path.join(directory, 'verified.pptx');
    await writeOrderedDeck(deck, { root: directory, assets: [], brief: '', briefName: null }, file);
    const zip = await JSZip.loadAsync(await readFile(file));
    expect(await zip.file('ppt/charts/chart1.xml')!.async('string')).toContain('barChart');
    const embedded = Object.values(zip.files).find(entry => /^ppt\/embeddings\/.*\.xlsx$/.test(entry.name))!;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await embedded.async('nodebuffer') as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([, '', 'Q1', 'Q2']);
    slide.chart.labels.forEach((label, i) => {
      expect(sheet.getCell(i + 2, 1).value).toBe(label);
      expect(sheet.getCell(i + 2, 2).value).toBe(slide.chart.series[0].values[i]);
      expect(sheet.getCell(i + 2, 3).value).toBe(slide.chart.series[1].values[i]);
    });
    const notes = await zip.file('ppt/notesSlides/notesSlide2.xml')!.async('string');
    expect(notes).toContain(slide.chart.verifiedSnapshot!.snapshotHash);
    expect(notes).toContain('sum-integer-cents');
  });
});

describe('server-owned Databricks preparation boundary', () => {
  function provider() {
    return vi.spyOn(Databricks.prototype, 'analyze').mockImplementation(async (dataset, comparison) => {
      const result = analyzeLocal(dataset, comparison);
      result.provider = 'databricks'; result.createdAt = new Date().toISOString();
      result.queryReference = `Databricks statement fresh-query; table \`catalog\`.\`schema\`.\`ops_${datasetVersion(dataset).slice(0, 24)}\``;
      return result;
    });
  }
  it('verifies through the provider even when an existing result claims verification, without mutating Studio', async () => {
    const source = stateFixture(), before = structuredClone(source), query = provider();
    const prepared = await prepareVerifiedStudioChart(source, config(), new AbortController().signal);
    expect(query).toHaveBeenCalledTimes(1);
    expect(prepared.snapshot.verification.statementId).toBe('fresh-query');
    expect(() => assertPreparedStudioChartCurrent(prepared, source)).not.toThrow();
    expect(source).toEqual(before);
  });
  it('refuses changed source selection immediately before publication', async () => {
    const source = stateFixture(); provider();
    const prepared = await prepareVerifiedStudioChart(source, config(), new AbortController().signal);
    source.workspace.view.topN = 1;
    expect(() => assertPreparedStudioChartCurrent(prepared, source)).toThrow('source analysis changed');
  });
  it('refuses numbers that disagree with the source instead of labelling them verified', async () => {
    const source = stateFixture(), before = structuredClone(source);
    vi.spyOn(Databricks.prototype, 'analyze').mockImplementation(async () => {
      const wrong = structuredClone(source.workspace.result!);
      wrong.currentTotal += 100;
      return wrong;
    });
    await expect(prepareVerifiedStudioChart(source, config(), new AbortController().signal)).rejects.toThrow();
    expect(source).toEqual(before);
  });
  it('reconciles decimal-dollar versus integer-cent ratio rounding without tolerating wrong cents or meaningful percentages',()=>{
    const state=stateFixture('North');state.workspace.dataset!.rows[1].revenue=13234.56;
    const result=analyzeLocal(state.workspace.dataset!,state.workspace.result!.comparison);result.provider='databricks';result.queryReference=`Databricks statement decimal-query; table \`catalog\`.\`schema\`.\`ops_${datasetVersion(state.workspace.dataset!).slice(0,24)}\``;
    for(const region of result.regions) region.percent=region.previous===0?null:(region.current-region.previous)/Math.abs(region.previous)*100;
    state.workspace.result=result;
    expect(()=>buildVerifiedChartSnapshot(state,captureStudioChartBinding(state))).not.toThrow();
    result.regions[0].percent!+=0.01;expect(()=>buildVerifiedChartSnapshot(state,captureStudioChartBinding(state))).toThrow('do not match');
    result.regions[0].percent!-=0.01;result.currentTotal+=0.01;expect(()=>buildVerifiedChartSnapshot(state,captureStudioChartBinding(state))).toThrow('do not match');
  });
  it('discards a completed provider result after cancellation', async () => {
    const source = stateFixture(), before = structuredClone(source), signal = new AbortController();
    vi.spyOn(Databricks.prototype, 'analyze').mockImplementation(async () => {
      signal.abort(); return structuredClone(source.workspace.result!);
    });
    await expect(prepareVerifiedStudioChart(source, config(), signal.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(source).toEqual(before);
  });
});
