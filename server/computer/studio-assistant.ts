import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import {
  analyzeLocal,
  defaultComparison,
  parseCsv,
  validateDataset,
} from '../../shared/analysis.js';
import { emptyWorkspace, type Dataset, type Comparison, type Action } from '../../shared/schema.js';
import {
  includedStudioRows,
  studioMoney,
  studioPercent,
  studioSummary,
  type StudioState,
} from '../../shared/studio.js';
import type { ComputerState, ComputerResult } from '../../shared/computer.js';
import type { Config } from '../config.js';
import { livePlan, samplePlan } from '../providers/planner.js';
import { Databricks } from '../providers/databricks.js';

const officeOpenRequest = (text: string) =>
  /^(?:please\s+)?open\s+(?:the\s+)?(?:excel|powerpoint|presentation|spreadsheet)(?:\s+(?:file|workbook|app))?[.!?]*$/i.test(
    text,
  );

export async function parseStudioFile(filename: string, bytes: Buffer) {
  if (bytes.length > 1024 * 1024 || !/\.(csv|xlsx)$/i.test(filename))
    throw new Error('Choose a CSV or XLSX under 1 MB.');
  if (/\.csv$/i.test(filename)) {
    const text = bytes.toString('utf8');
    const records = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
      skipEmptyLines: false,
    }).data;
    const sourceRows = records
      .slice(1)
      .flatMap((record, i) => (record.some((value) => value.trim()) ? [i + 2] : []));
    return { dataset: parseCsv(text, filename), sheet: 'CSV', sourceRows };
  }
  // Bound decompression before passing an uploaded workbook to ExcelJS.
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (
    end < 0 ||
    end + 22 > bytes.length ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6)
  )
    throw new Error('The workbook must be a normal XLSX archive.');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 300 || cursor >= end) throw new Error('The workbook archive is too complex.');
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Invalid XLSX archive.');
    expanded += bytes.readUInt32LE(cursor + 24);
    if (expanded > 16 * 1024 * 1024) throw new Error('The workbook expands beyond 16 MB.');
    cursor +=
      46 +
      bytes.readUInt16LE(cursor + 28) +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as any);
  const sheet = book.worksheets.find((s) => s.rowCount > 1);
  if (!sheet || sheet.rowCount > 5001 || sheet.columnCount !== 6)
    throw new Error('Use six columns in the first populated sheet, with up to 5,000 records.');
  const values = Array.from({ length: sheet.rowCount }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => {
      const value = sheet.getCell(i + 1, j + 1).value;
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (value && typeof value === 'object')
        throw new Error(`Use plain source values in row ${i + 1}, not formulas or rich text.`);
      return value ?? '';
    }),
  );
  const sourceRows = values
    .slice(1)
    .flatMap((record, i) => (record.some((value) => String(value).trim()) ? [i + 2] : []));
  return { dataset: parseCsv(Papa.unparse(values), filename), sheet: sheet.name, sourceRows };
}

export class StudioAssistant {
  active = false;
  private history: StudioState[] = [];
  constructor(
    private cfg: Config,
    private state: ComputerState,
    private exportFiles: (
      studio: StudioState,
      kind: 'excel' | 'powerpoint' | 'both',
      open: boolean,
      signal: AbortSignal,
    ) => Promise<void>,
  ) {}
  private answer(summary: string, clarification = false): ComputerResult {
    return {
      tool: 'studioHelp',
      summary,
      spokenSummary: summary,
      clarification,
      state: structuredClone(this.state),
    };
  }
  private invalidate(studio: StudioState) {
    studio.outputs = { excel: null, powerpoint: null };
    if (this.state.spreadsheet?.filename.startsWith('insight-analysis-'))
      this.state.spreadsheet = null;
    if (this.state.presentation?.filename.startsWith('insight-analysis-'))
      this.state.presentation = null;
  }
  import(dataset: Dataset, sourceSheet = 'CSV', sourceRows?: number[]) {
    validateDataset(dataset);
    const comparison = defaultComparison(dataset);
    const result = analyzeLocal(dataset, comparison);
    this.state.studio = {
      workspace: {
        ...emptyWorkspace(),
        title: 'Insight analysis',
        dataset,
        result,
        view: { kind: 'chart', topN: null },
      },
      baseline: result,
      sourceSheet,
      sourceRows,
      revision: 1,
      lastChange: 'Loaded source records. Original file unchanged.',
      evidence: [],
      canUndo: false,
      interpretation: 'supported-commands',
      outputs: { excel: null, powerpoint: null },
    };
    this.history = [];
    this.invalidate(this.state.studio);
    this.active = true;
    return this.answer(
      `${dataset.synthetic ? 'The sample uses fictional records. ' : ''}${studioSummary(this.state.studio)} You can compare the same locations, inspect source rows, or create an Excel and PowerPoint report.`,
    );
  }
  private async calculate(
    studio: StudioState,
    comparison: Comparison,
    cloud: boolean,
    signal: AbortSignal,
  ) {
    const expected = analyzeLocal(studio.workspace.dataset!, comparison);
    if (!cloud) return expected;
    const actual = await new Databricks(this.cfg).analyze(
      studio.workspace.dataset!,
      comparison,
      signal,
    );
    if (
      actual.previousTotal !== expected.previousTotal ||
      actual.currentTotal !== expected.currentTotal ||
      actual.includedRows !== expected.includedRows ||
      JSON.stringify(actual.regions) !== JSON.stringify(expected.regions)
    )
      throw new Error(
        'Databricks results do not reconcile with the source records. No change was applied.',
      );
    return actual;
  }
  private async apply(action: Action, signal: AbortSignal) {
    const studio = this.state.studio!;
    if (action.tool === 'undoChange') {
      const previous = this.history.pop();
      if (!previous) return 'There is no analysis change to undo.';
      previous.revision = studio.revision + 1;
      this.invalidate(previous);
      previous.canUndo = this.history.length > 0;
      previous.lastChange = 'Undid the last analysis change. Previous reports need regeneration.';
      this.state.studio = previous;
      return `Undone. ${studioSummary(previous)}`;
    }
    if (action.tool === 'explainCalculation') {
      const rows = includedStudioRows(studio),
        r = studio.workspace.result!,
        c = r.comparison;
      const ids = [...new Set(rows.filter((row) => !row.included).map((row) => row.location_id))];
      studio.evidence = rows
        .filter((row) => row.included)
        .map(
          (row) =>
            `${studio.sourceSheet} row ${row.sourceRow}: ${row.location_id}, ${row.date}, ${row.region}, ${studioMoney(row.revenue)}.`,
        );
      return `I used ${r.includedRows} source rows. ${studioMoney(r.currentTotal)} minus ${studioMoney(r.previousTotal)} is ${studioMoney(r.currentTotal - r.previousTotal)}. Dividing by the absolute previous total gives ${studioPercent(r.percent)} growth.${c.commonLocations ? ` Excluded locations: ${ids.join(', ') || 'none'}.` : ''} The evidence table lists every contributing row.`;
    }
    if (action.tool === 'describeChanges') return studio.lastChange;
    if (['saveProject', 'resumeProject'].includes(action.tool))
      return 'Saving and resuming this studio session is not implemented. You can export your work.';
    if (['compareRevenue', 'refineComparison'].includes(action.tool)) {
      const comparison = action.args.comparison ?? {
        ...studio.workspace.result!.comparison,
        ...(action.args.commonLocations === undefined
          ? {}
          : { commonLocations: action.args.commonLocations }),
      };
      const result = await this.calculate(
        studio,
        comparison,
        studio.workspace.result!.provider === 'databricks',
        signal,
      );
      signal.throwIfAborted();
      this.history.push(structuredClone(studio));
      this.history = this.history.slice(-20);
      const old = studio.workspace.result!;
      studio.workspace.result = result;
      studio.baseline = analyzeLocal(studio.workspace.dataset!, {
        ...comparison,
        commonLocations: false,
      });
      studio.revision++;
      this.invalidate(studio);
      studio.evidence = [];
      studio.canUndo = true;
      studio.lastChange = `Growth changed from ${studioPercent(old.percent)} to ${studioPercent(result.percent)}. ${result.includedRows} source rows now contribute. Excel and PowerPoint reports need regeneration.`;
      return `${studioSummary(studio)} ${studio.lastChange}`;
    }
    if (action.tool === 'updateChart' || action.tool === 'createChart') {
      this.history.push(structuredClone(studio));
      this.history = this.history.slice(-20);
      studio.workspace.view = { kind: 'chart', topN: action.args.topN ?? null };
      studio.revision++;
      this.invalidate(studio);
      studio.canUndo = true;
      studio.lastChange = `The chart shows ${studio.workspace.view.topN ? `the top ${studio.workspace.view.topN}` : 'all'} regions by absolute change. Totals cover every included region.`;
      return studio.lastChange;
    }
    return studioSummary(studio);
  }
  /** Used by the controller to keep an active analysis report out of image-deck routing. */
  ownsRequest(request: string) {
    const text = request.trim();
    if (
      /\b(?:presentation|powerpoint|slides)\b.*\babout\b/i.test(text) &&
      !/\b(?:analysis|results|revenue|dataset|studio)\b/i.test(text)
    )
      return false;
    if (
      /\b(?:images?|pictures?|photos?|diagram)\b/i.test(text) &&
      !/\b(?:studio|analysis|results|revenue|dataset)\b/i.test(text)
    )
      return false;
    if (officeOpenRequest(text)) return false;
    const start =
      /\b(?:start|load|try|open|use)\b.*\b(?:studio|analysis demo|analyst demo|sample analysis)\b/i.test(
        text,
      );
    const explicit =
      /\b(?:studio|same locations|common locations|source rows|contributing rows)\b/i.test(text);
    const followup =
      this.active &&
      /\b(?:growth|revenue|quarter|chart|graph|region|source|evidence|calculation|how|why|undo|export|report|analysis|powerpoint|presentation|slides|workbook|databricks|same|exclude|filter)\b/i.test(
        text,
      );
    return start || explicit || followup;
  }
  private async verifyWithDatabricks(studio: StudioState, signal: AbortSignal) {
    const result = await this.calculate(studio, studio.workspace.result!.comparison, true, signal);
    signal.throwIfAborted();
    studio.workspace.result = result;
    studio.revision++;
    this.invalidate(studio);
    studio.lastChange =
      'Databricks SQL reconciled with the source records. Previous reports need regeneration.';
  }
  async request(request: string, signal: AbortSignal): Promise<ComputerResult | null> {
    const text = request.trim();
    // Opening the current report should preserve its conversation context.
    if (officeOpenRequest(text)) return null;
    if (!this.ownsRequest(text)) {
      if (/\b(?:open|search|find|code|energy|finance)\b/i.test(text)) this.active = false;
      return null;
    }
    const start =
      /\b(?:start|load|try|open|use)\b.*\b(?:studio|analysis demo|analyst demo|sample analysis)\b/i.test(
        text,
      );
    if (start)
      return this.import(
        parseCsv(
          await readFile('data/operations-synthetic.csv', 'utf8'),
          'Operations sample.csv',
          true,
        ),
      );
    if (!this.state.studio)
      return this.answer(
        'Load a CSV or Excel dataset in Insight Studio, or say start the analysis demo.',
        true,
      );
    this.active = true;
    const studio = this.state.studio;
    const namedRegion = studio.workspace.result!.regions.find((group) =>
      new RegExp(`\\b${group.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text),
    );
    if (namedRegion && /\b(?:describe|read|inspect|explore)\b.*\b(?:chart|region)\b/i.test(text))
      return this.answer(
        `${namedRegion.region}: ${studioMoney(namedRegion.previous)} in ${studio.workspace.result!.comparison.previous.label}, and ${studioMoney(namedRegion.current)} in ${studio.workspace.result!.comparison.current.label}. Change: ${studioMoney(namedRegion.delta)}, or ${studioPercent(namedRegion.percent)}. ${namedRegion.rowCount} source records contribute.`,
      );
    if (
      /\b(?:create|make|prepare|export|generate|build)\b/i.test(text) &&
      /\b(?:report|excel|powerpoint|presentation|slides|workbook)\b/i.test(text)
    ) {
      const excel = /\b(?:excel|workbook)\b/i.test(text),
        ppt = /\b(?:powerpoint|presentation|slides)\b/i.test(text);
      const kind = excel && !ppt ? 'excel' : ppt && !excel ? 'powerpoint' : 'both';
      // An explicit provider request must succeed before any report is written.
      if (/\bdatabricks\b/i.test(text)) await this.verifyWithDatabricks(studio, signal);
      await this.exportFiles(studio, kind, /\bopen\b/i.test(text), signal);
      return this.answer(
        `Created ${kind === 'both' ? 'an Excel workbook and a six-slide PowerPoint' : kind === 'excel' ? 'an Excel workbook with editable formulas' : 'a six-slide PowerPoint with an editable chart'} from this analysis. The figures match the current comparison. Growth is ${studioPercent(studio.workspace.result!.percent)}. You can download ${kind === 'both' ? 'them' : 'it'} or ask me to open ${kind === 'both' ? 'them' : 'it'}.`,
      );
    }
    if (/\bdatabricks\b/i.test(text)) {
      await this.verifyWithDatabricks(studio, signal);
      return this.answer(`Databricks verified the analysis. ${studioSummary(studio)}`);
    }
    // Deterministic shortcuts keep routine edits immediate. Open-ended requests use the open model.
    let plan;
    if (
      /\b(?:same|common)\s+(?:locations|stores|branches)|\b(?:only|exclude)\b.*\b(?:new|continuously)\b/i.test(
        text,
      )
    )
      plan = {
        actions: [{ tool: 'refineComparison' as const, args: { commonLocations: true } }],
        clarification: null,
      };
    else if (/\b(?:all locations|remove.*filter|include.*new)\b/i.test(text))
      plan = {
        actions: [{ tool: 'refineComparison' as const, args: { commonLocations: false } }],
        clarification: null,
      };
    else if (/\b(?:source|evidence|contributing|how.*(?:get|calculate)|show.*work)\b/i.test(text))
      plan = { actions: [{ tool: 'explainCalculation' as const, args: {} }], clarification: null };
    else if (/\bundo\b/i.test(text) || !this.cfg.hfToken) plan = samplePlan(text, studio.workspace);
    else {
      plan = await livePlan(text, studio.workspace, this.cfg, signal);
      studio.interpretation = 'hugging-face';
    }
    if (plan.clarification) return this.answer(plan.clarification, true);
    const answers: string[] = [];
    for (const action of plan.actions) answers.push(await this.apply(action, signal));
    return this.answer(answers.join(' '));
  }
}
