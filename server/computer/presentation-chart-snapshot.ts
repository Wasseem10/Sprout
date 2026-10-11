import { createHash } from 'node:crypto';
import { analyzeLocal, datasetVersion, validateDataset } from '../../shared/analysis.js';
import {
  comparisonSchema,
  resultSchema,
  viewSchema,
  type AnalysisResult,
} from '../../shared/schema.js';
import type { StudioState } from '../../shared/studio.js';
import {
  CHART_CATEGORY_LIMIT,
  verifiedChartSnapshotSchema,
  type StudioChartBinding,
  type VerifiedChartSnapshot,
} from '../../shared/presentation-chart-snapshot.js';

export class ChartSnapshotError extends Error {
  constructor(
    public readonly code:
      | 'invalid_source'
      | 'stale_analysis'
      | 'unverified_analysis'
      | 'reconciliation_failed'
      | 'empty_result'
      | 'category_limit'
      | 'invalid_snapshot',
    message: string,
  ) {
    super(message);
    this.name = 'ChartSnapshotError';
  }
}

export type StudioChartRowEvidence = {
  datasetRow: number;
  sourceRow: number;
  region: string;
  period: 'previous' | 'current' | null;
  status: 'included' | 'outside-periods' | 'excluded-location';
};
/** Local only. Do not put this row-level index or its raw dataset in cloud project state. */
export type StudioChartEvidence = {
  datasetFingerprint: string;
  sourceSheet: string;
  rows: StudioChartRowEvidence[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function money(value: number): number {
  const cents = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(cents) ||
    Math.abs(value * 100 - cents) > 0.001
  )
    throw new ChartSnapshotError(
      'reconciliation_failed',
      'The analysis contains an invalid currency amount.',
    );
  return cents;
}
function totals(previousCents: number, currentCents: number) {
  return {
    previousCents,
    currentCents,
    deltaCents: currentCents - previousCents,
    percent:
      previousCents === 0 ? null : ((currentCents - previousCents) / Math.abs(previousCents)) * 100,
  };
}
function checked(studio: StudioState) {
  try {
    if (
      !studio.workspace.dataset ||
      !studio.workspace.result ||
      !Number.isSafeInteger(studio.revision) ||
      studio.revision < 1
    )
      throw new Error();
    // Databricks and existing Studio results fingerprint the original stored row JSON.
    // Validate without replacing it with Zod's differently ordered object projection.
    const dataset = studio.workspace.dataset;
    validateDataset(dataset);
    const result = resultSchema.parse(studio.workspace.result);
    const view = viewSchema.parse(studio.workspace.view);
    const comparison = comparisonSchema.parse(result.comparison);
    const sourceRows = studio.sourceRows ?? dataset.rows.map((_, i) => i + 2);
    if (
      sourceRows.length !== dataset.rows.length ||
      new Set(sourceRows).size !== sourceRows.length ||
      sourceRows.some((n) => !Number.isSafeInteger(n) || n < 2 || n > 1_048_576) ||
      !studio.sourceSheet.trim() ||
      studio.sourceSheet.length > 160 ||
      /[\x00-\x1f]/.test(studio.sourceSheet)
    )
      throw new Error();
    const fingerprint = datasetVersion(dataset);
    if (result.datasetId !== dataset.id || result.datasetVersion !== fingerprint)
      throw new ChartSnapshotError(
        'stale_analysis',
        'The source has changed. Verify the current analysis before inserting its chart.',
      );
    return { dataset, result, view, comparison, sourceRows, fingerprint };
  } catch (error) {
    if (error instanceof ChartSnapshotError) throw error;
    throw new ChartSnapshotError(
      'invalid_source',
      'The analysis source or row references are invalid. Import and verify the supported dataset again.',
    );
  }
}

/** Capture before asynchronous work; all source/selection/result inputs participate in the binding. */
export function captureStudioChartBinding(studio: StudioState): StudioChartBinding {
  const { dataset, result, view, sourceRows, fingerprint } = checked(studio);
  return freeze({
    revision: studio.revision,
    datasetFingerprint: fingerprint,
    hash: hash({
      revision: studio.revision,
      dataset: { id: dataset.id, name: dataset.name, synthetic: dataset.synthetic, fingerprint },
      result,
      topN: view.topN,
      sourceSheet: studio.sourceSheet,
      sourceRows,
    }),
  });
}

function reconciled(result: AnalysisResult, expected: AnalysisResult) {
  // SQL decimal totals and local integer cents can produce adjacent IEEE-754 ratios.
  // Amounts/counts below remain exact; percentages allow only floating-point roundoff.
  const samePercent = (actual: number | null, wanted: number | null | undefined) => actual === wanted || (
    actual !== null && wanted !== null && wanted !== undefined && Number.isFinite(actual) && Number.isFinite(wanted)
    && Math.abs(actual - wanted) <= Number.EPSILON * 8 * Math.max(1, Math.abs(actual), Math.abs(wanted))
  );
  const shape = (r: AnalysisResult) => ({
    previous: money(r.previousTotal),
    current: money(r.currentTotal),
    includedRows: r.includedRows,
    includedLocations: r.includedLocations,
    excludedLocations: r.excludedLocations,
    regions: [...r.regions]
      .map((region) => ({
        region: region.region,
        previous: money(region.previous),
        current: money(region.current),
        delta: money(region.delta),
        rowCount: region.rowCount,
      }))
      .sort((a, b) => a.region.localeCompare(b.region)),
  });
  if (
    canonical(shape(result)) !== canonical(shape(expected)) ||
    !samePercent(result.percent, expected.percent) ||
    result.regions.some(
      (r) => !samePercent(r.percent, expected.regions.find((g) => g.region === r.region)?.percent),
    )
  )
    throw new ChartSnapshotError(
      'reconciliation_failed',
      'Databricks results do not match the source records. Verify the analysis again; no chart was created.',
    );
}

/**
 * Trusted-server boundary only: `studio.workspace.result` must be the completed result of
 * Databricks.analyze/StudioAssistant, never client, model or uploaded JSON. Reconciliation
 * verifies its arithmetic against source rows; it cannot authenticate a forged provider label.
 * This function performs no I/O and does not claim a new live query occurred.
 */
export function buildVerifiedChartSnapshot(
  studio: StudioState,
  binding: StudioChartBinding,
  now = new Date(),
): { snapshot: VerifiedChartSnapshot; localEvidence: StudioChartEvidence } {
  const current = captureStudioChartBinding(studio);
  if (canonical(current) !== canonical(binding))
    throw new ChartSnapshotError(
      'stale_analysis',
      'The analysis or chart selection changed. Verify the current selection before inserting its chart.',
    );
  const { dataset, result, comparison, sourceRows, fingerprint, view } = checked(studio);
  if (result.provider !== 'databricks')
    throw new ChartSnapshotError(
      'unverified_analysis',
      'Verify this analysis with Databricks before inserting a verified chart.',
    );
  // Existing provider reference contains local catalog/table names; persist only its bounded statement ID.
  const reference =
    /^Databricks statement ([a-zA-Z0-9-]{1,100}); table `[^`\r\n]{1,64}`\.`[^`\r\n]{1,64}`\.`ops_([a-f0-9]{24})`$/.exec(
      result.queryReference,
    );
  if (
    !reference ||
    reference[2] !== fingerprint.slice(0, 24) ||
    !Number.isFinite(Date.parse(result.createdAt)) ||
    !Number.isFinite(now.valueOf()) ||
    Date.parse(result.createdAt) > now.valueOf() + 30_000
  )
    throw new ChartSnapshotError(
      'unverified_analysis',
      'The analysis is missing valid Databricks query evidence. Verify it again before chart insertion.',
    );
  const expected = analyzeLocal(dataset, comparison);
  reconciled(result, expected);
  if (!expected.regions.length)
    throw new ChartSnapshotError(
      'empty_result',
      'No source rows match these comparison periods and filters. Change the analysis before adding a chart.',
    );
  if (
    (view.topN === null && expected.regions.length > CHART_CATEGORY_LIMIT) ||
    (view.topN !== null && view.topN > CHART_CATEGORY_LIMIT)
  )
    throw new ChartSnapshotError(
      'category_limit',
      'A chart supports up to twelve regions. Choose an explicit top-twelve-or-smaller selection.',
    );
  const groups = view.topN === null ? expected.regions : expected.regions.slice(0, view.topN);
  const localEvidence: StudioChartEvidence = {
    datasetFingerprint: fingerprint,
    sourceSheet: studio.sourceSheet,
    rows: dataset.rows.map((row, i) => {
      const period =
        row.date >= comparison.previous.start && row.date <= comparison.previous.end
          ? 'previous'
          : row.date >= comparison.current.start && row.date <= comparison.current.end
            ? 'current'
            : null;
      const eligible =
        !comparison.commonLocations ||
        (row.operating_start <= comparison.previous.start &&
          (row.operating_end === null || row.operating_end >= comparison.current.end));
      return {
        datasetRow: i,
        sourceRow: sourceRows[i],
        region: row.region,
        period,
        status: period === null ? 'outside-periods' : eligible ? 'included' : 'excluded-location',
      };
    }),
  };
  const previous = groups.map((r) => money(r.previous)),
    currentValues = groups.map((r) => money(r.current));
  const evidenceHash = hash(localEvidence);
  const value = {
    schemaVersion: 1,
    chartType: 'clustered-column',
    dataset: {
      id: dataset.id,
      fingerprint,
      fingerprintKind: 'studio-normalized-rows-v1',
      name: dataset.name,
      synthetic: dataset.synthetic,
      sourceSheet: studio.sourceSheet,
    },
    analysis: {
      id: result.id,
      revision: studio.revision,
      comparison,
      metric: 'revenue',
      aggregation: 'sum-integer-cents',
      unit: 'USD',
      locationRule: comparison.commonLocations ? 'continuous-through-both-periods' : 'all-reported',
      growthRule: '(current-previous)/abs(previous)*100; zero previous is undefined',
    },
    scope: {
      mode: view.topN === null ? 'all' : 'top-n',
      requestedTopN: view.topN,
      ranking: 'absolute-revenue-change-desc-region-asc',
      fullCategoryCount: expected.regions.length,
      omittedCategoryCount: expected.regions.length - groups.length,
    },
    categories: groups.map((r) => r.region),
    series: [
      {
        period: 'previous',
        label:
          comparison.previous.label.trim() ||
          `${comparison.previous.start} to ${comparison.previous.end}`,
        valuesCents: previous,
      },
      {
        period: 'current',
        label:
          comparison.current.label.trim() ||
          `${comparison.current.start} to ${comparison.current.end}`,
        valuesCents: currentValues,
      },
    ],
    totals: {
      full: totals(money(expected.previousTotal), money(expected.currentTotal)),
      displayed: totals(
        previous.reduce((a, b) => a + b, 0),
        currentValues.reduce((a, b) => a + b, 0),
      ),
    },
    counts: {
      sourceRows: dataset.rows.length,
      relevantRows: localEvidence.rows.filter((r) => r.period !== null).length,
      includedRows: expected.includedRows,
      includedLocations: expected.includedLocations,
      excludedLocations: expected.excludedLocations,
      excludedLocationRows: localEvidence.rows.filter((r) => r.status === 'excluded-location')
        .length,
      outsidePeriodRows: localEvidence.rows.filter((r) => r.status === 'outside-periods').length,
    },
    categoryRows: groups.map((r) => ({
      region: r.region,
      previous: localEvidence.rows.filter(
        (row) => row.status === 'included' && row.region === r.region && row.period === 'previous',
      ).length,
      current: localEvidence.rows.filter(
        (row) => row.status === 'included' && row.region === r.region && row.period === 'current',
      ).length,
    })),
    verification: {
      provider: 'databricks',
      verifiedAt: result.createdAt,
      statementId: reference[1],
      method: 'databricks-result-reconciled-with-local-source',
    },
    evidence: { localReference: `studio-row-evidence:${evidenceHash}`, sha256: evidenceHash },
    bindingHash: current.hash,
    resultHash: hash({
      comparison,
      regions: expected.regions,
      totals: totals(money(expected.previousTotal), money(expected.currentTotal)),
      includedRows: expected.includedRows,
      includedLocations: expected.includedLocations,
      excludedLocations: expected.excludedLocations,
    }),
  };
  const parsed = verifiedChartSnapshotSchema.safeParse({ ...value, snapshotHash: hash(value) });
  if (!parsed.success)
    throw new ChartSnapshotError(
      'invalid_source',
      'The source labels or verified chart metadata are not supported. The presentation is unchanged.',
    );
  return freeze({ snapshot: parsed.data, localEvidence });
}

export function validateChartSnapshotIntegrity(value: unknown): VerifiedChartSnapshot {
  const parsed = verifiedChartSnapshotSchema.safeParse(value);
  if (!parsed.success)
    throw new ChartSnapshotError('invalid_snapshot', 'The saved chart snapshot is invalid.');
  const { snapshotHash, ...payload } = parsed.data;
  if (snapshotHash !== hash(payload))
    throw new ChartSnapshotError(
      'invalid_snapshot',
      'The saved chart snapshot fingerprint does not match its content.',
    );
  return freeze(parsed.data);
}

/** Recheck directly before the presentation commit. Project/revision binding remains the executor's responsibility. */
export function assertChartSnapshotCurrent(
  snapshot: VerifiedChartSnapshot,
  studio: StudioState,
  now = new Date(),
): void {
  const valid = validateChartSnapshotIntegrity(snapshot);
  const binding = captureStudioChartBinding(studio);
  if (
    binding.hash !== valid.bindingHash ||
    binding.revision !== valid.analysis.revision ||
    binding.datasetFingerprint !== valid.dataset.fingerprint
  )
    throw new ChartSnapshotError(
      'stale_analysis',
      'The analysis or chart selection changed while the chart was being prepared. Verify it again.',
    );
  // The persisted hashes detect corruption, not authenticity. Reconstruct the
  // bounded snapshot from trusted server-owned Studio state before committing;
  // otherwise changed values could retain the old binding and be re-hashed.
  const expected = buildVerifiedChartSnapshot(studio, binding, now).snapshot;
  if (expected.snapshotHash !== valid.snapshotHash)
    throw new ChartSnapshotError(
      'stale_analysis',
      'The prepared chart does not match the verified source analysis. Prepare it again.',
    );
}

export function describeChartSnapshot(snapshot: VerifiedChartSnapshot): string {
  const s = validateChartSnapshotIntegrity(snapshot);
  const currency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n / 100);
  const scope =
    s.scope.mode === 'all'
      ? `All ${s.categories.length} included regions are shown.`
      : `Top ${s.scope.requestedTopN} regions by absolute revenue change are shown; ${s.scope.omittedCategoryCount} regions are omitted. Totals cover all included regions.`;
  return (
    `${s.dataset.synthetic ? 'Fictional sample. ' : ''}${s.dataset.name}, ${s.series[0].label} compared with ${s.series[1].label}. ` +
    `${s.analysis.comparison.commonLocations ? 'Only locations operating continuously throughout both periods are included.' : 'All reported locations are included.'} ` +
    `${scope} Full revenue changed from ${currency(s.totals.full.previousCents)} to ${currency(s.totals.full.currentCents)}. ` +
    `${s.totals.full.percent === null ? 'Growth is undefined because the previous total is zero.' : `Growth is ${s.totals.full.percent.toFixed(1)} percent, using the absolute previous total as the denominator.`} ` +
    `${s.counts.includedRows} source rows contribute; ${s.counts.excludedLocationRows} rows fail the location rule and ${s.counts.outsidePeriodRows} are outside the periods. ` +
    `This is a saved Databricks result reconciled with source records on ${s.verification.verifiedAt.slice(0, 10)}; it is not a fresh live query.`
  );
}
