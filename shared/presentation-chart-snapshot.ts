import { z } from 'zod';
import { comparisonSchema } from './schema.js';

export const CHART_CATEGORY_LIMIT = 12;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
// Categories and sheet names are source identities. Do not trim or merge them
// after their values and hashes have been derived from the original records.
const label = z
  .string()
  .min(1)
  .max(160)
  .refine((s) => !!s.trim() && !/[\x00-\x1f]/.test(s));
const cents = z.number().int().safe();
const count = z.number().int().min(0).max(5000);
const totalsSchema = z.strictObject({
  previousCents: cents,
  currentCents: cents,
  deltaCents: cents,
  percent: z.number().finite().nullable(),
});
const seriesSchema = z.strictObject({
  period: z.enum(['previous', 'current']),
  label,
  valuesCents: z.array(cents).min(1).max(CHART_CATEGORY_LIMIT),
});

/** Persistable, dated evidence. No raw rows, absolute paths, SQL or credentials. */
export const verifiedChartSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    chartType: z.literal('clustered-column'),
    dataset: z.strictObject({
      id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      fingerprint: hash,
      fingerprintKind: z.literal('studio-normalized-rows-v1'),
      name: label.refine((s) => !/[\\/]/.test(s), 'Use a source name, not a path.'),
      synthetic: z.boolean(),
      sourceSheet: label,
    }),
    analysis: z.strictObject({
      id: z.string().min(1).max(100),
      revision: z.number().int().min(1).safe(),
      comparison: comparisonSchema,
      metric: z.literal('revenue'),
      aggregation: z.literal('sum-integer-cents'),
      unit: z.literal('USD'),
      locationRule: z.enum(['all-reported', 'continuous-through-both-periods']),
      growthRule: z.literal('(current-previous)/abs(previous)*100; zero previous is undefined'),
    }),
    scope: z.strictObject({
      mode: z.enum(['all', 'top-n']),
      requestedTopN: z.number().int().min(1).max(CHART_CATEGORY_LIMIT).nullable(),
      ranking: z.literal('absolute-revenue-change-desc-region-asc'),
      fullCategoryCount: z.number().int().min(1).max(50),
      omittedCategoryCount: z.number().int().min(0).max(49),
    }),
    categories: z.array(label).min(1).max(CHART_CATEGORY_LIMIT),
    series: z.tuple([seriesSchema, seriesSchema]),
    totals: z.strictObject({ full: totalsSchema, displayed: totalsSchema }),
    counts: z.strictObject({
      sourceRows: count,
      relevantRows: count,
      includedRows: count,
      excludedLocationRows: count,
      outsidePeriodRows: count,
      includedLocations: count,
      excludedLocations: count,
    }),
    categoryRows: z
      .array(z.strictObject({ region: label, previous: count, current: count }))
      .min(1)
      .max(CHART_CATEGORY_LIMIT),
    verification: z.strictObject({
      provider: z.literal('databricks'),
      verifiedAt: z.string().datetime(),
      statementId: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
      method: z.literal('databricks-result-reconciled-with-local-source'),
    }),
    evidence: z.strictObject({
      localReference: z.string().regex(/^studio-row-evidence:[a-f0-9]{64}$/),
      sha256: hash,
    }),
    bindingHash: hash,
    resultHash: hash,
    snapshotHash: hash,
  })
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(s.categories).size !== s.categories.length)
      fail('Chart categories must be unique.');
    if (
      s.series[0].period !== 'previous' ||
      s.series[1].period !== 'current' ||
      s.series.some((series) => series.valuesCents.length !== s.categories.length)
    )
      fail('Chart series must match the ordered periods and categories.');
    if (
      s.categoryRows.length !== s.categories.length ||
      s.categoryRows.some((row, i) => row.region !== s.categories[i])
    )
      fail('Category row counts must match the ordered chart categories.');
    if (
      s.scope.fullCategoryCount !== s.categories.length + s.scope.omittedCategoryCount ||
      (s.scope.mode === 'all' &&
        (s.scope.requestedTopN !== null || s.scope.omittedCategoryCount !== 0)) ||
      (s.scope.mode === 'top-n' &&
        (s.scope.requestedTopN === null ||
          s.categories.length !== Math.min(s.scope.requestedTopN, s.scope.fullCategoryCount)))
    )
      fail('The chart scope must describe every displayed and omitted category.');
    if (
      s.counts.sourceRows !== s.counts.relevantRows + s.counts.outsidePeriodRows ||
      s.counts.relevantRows !== s.counts.includedRows + s.counts.excludedLocationRows
    )
      fail('Source row counts do not reconcile.');
    const displayedRows = s.categoryRows.reduce((sum, r) => sum + r.previous + r.current, 0);
    if (
      displayedRows > s.counts.includedRows ||
      (s.scope.omittedCategoryCount === 0 && displayedRows !== s.counts.includedRows) ||
      s.counts.includedRows - displayedRows < s.scope.omittedCategoryCount ||
      s.categoryRows.some((r) => r.previous + r.current === 0)
    )
      fail('Displayed and omitted categories must account for the included source rows.');
    if (
      s.counts.includedLocations < s.scope.fullCategoryCount ||
      s.counts.includedLocations > s.counts.includedRows ||
      s.counts.excludedLocations > s.counts.excludedLocationRows ||
      (!s.analysis.comparison.commonLocations &&
        (s.counts.excludedLocations !== 0 || s.counts.excludedLocationRows !== 0))
    )
      fail('Location counts must reconcile with the included and excluded source rows.');
    for (const total of [s.totals.full, s.totals.displayed]) {
      const percentage =
        total.previousCents === 0
          ? null
          : ((total.currentCents - total.previousCents) / Math.abs(total.previousCents)) * 100;
      if (
        total.deltaCents !== total.currentCents - total.previousCents ||
        total.percent !== percentage
      )
        fail('Totals must use the defined integer-cent growth calculation.');
    }
    if (
      s.totals.displayed.previousCents !== s.series[0].valuesCents.reduce((a, b) => a + b, 0) ||
      s.totals.displayed.currentCents !== s.series[1].valuesCents.reduce((a, b) => a + b, 0)
    )
      fail('Displayed totals must equal the chart values.');
    if (
      s.scope.omittedCategoryCount === 0 &&
      JSON.stringify(s.totals.full) !== JSON.stringify(s.totals.displayed)
    )
      fail('A full chart must show the full totals.');
    if (
      s.analysis.locationRule !==
      (s.analysis.comparison.commonLocations ? 'continuous-through-both-periods' : 'all-reported')
    )
      fail('The location rule must match the comparison.');
    if (s.evidence.localReference !== `studio-row-evidence:${s.evidence.sha256}`)
      fail('Local evidence reference must match its fingerprint.');
  });

export type VerifiedChartSnapshot = z.infer<typeof verifiedChartSnapshotSchema>;
export type StudioChartBinding = { revision: number; datasetFingerprint: string; hash: string };

/** Numbers for the native chart and its embedded workbook come from this one projection. */
export function chartSnapshotSeries(snapshot: VerifiedChartSnapshot) {
  const valid = verifiedChartSnapshotSchema.parse(snapshot);
  return valid.series.map((series) => ({
    name: series.label,
    labels: [...valid.categories],
    values: series.valuesCents.map((value) => value / 100),
  }));
}
