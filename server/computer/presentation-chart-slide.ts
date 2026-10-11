import { orderedPresentationSlideSchema, type OrderedPresentationSlide } from '../../shared/presentation-deck.js';
import { chartSnapshotSeries, type VerifiedChartSnapshot } from '../../shared/presentation-chart-snapshot.js';
import { validateChartSnapshotIntegrity } from './presentation-chart-snapshot.js';
import { PresentationProjectError } from './presentation-project.js';

/** Calculated description of the full comparison, never a model-written business explanation. */
export function verifiedChartTakeaway(snapshot: VerifiedChartSnapshot): string {
  const { deltaCents, previousCents, percent } = snapshot.totals.full;
  const delta = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Math.abs(deltaCents) / 100);
  const direction = deltaCents > 0 ? 'rose' : deltaCents < 0 ? 'fell' : 'was unchanged';
  if (previousCents === 0) return `Full revenue ${direction}${deltaCents === 0 ? '' : ` by ${delta}`}; growth is undefined from a zero baseline.`;
  return `Full revenue ${direction}${deltaCents === 0 ? ' (0%)' : ` ${Math.abs(percent!).toFixed(1)}% (${delta})`}.`;
}

/** Pure projection; callers must also recheck trusted Studio state and deck revision before commit. */
export function createVerifiedChartSlide(
  snapshot: VerifiedChartSnapshot,
  slideId: string,
  title = 'Revenue by region',
): Extract<OrderedPresentationSlide, { type: 'chart' }> {
  const valid = validateChartSnapshotIntegrity(snapshot);
  if (valid.categories.some(label => label.length > 60) || valid.series.some(series => series.label.length > 70))
    throw new PresentationProjectError('The source labels are too long for the chart layout. Shorten the labels in the source and verify the analysis again.');
  const projected = chartSnapshotSeries(valid);
  const scope = valid.scope.mode === 'all' ? `All ${valid.categories.length} regions`
    : `Top ${valid.categories.length} of ${valid.scope.fullCategoryCount} regions by absolute change`;
  const summary = `${valid.dataset.synthetic ? 'Fictional sample. ' : ''}${verifiedChartTakeaway(valid)} ${scope}; ${valid.analysis.comparison.commonLocations ? 'continuous locations only' : 'all locations'}. Databricks dated ${valid.verification.verifiedAt.slice(0, 10)}.`;
  return orderedPresentationSlideSchema.parse({
    id: slideId, type: 'chart', title,
    chart: {
      labels: valid.categories,
      series: projected.map(({ name, values }) => ({ name, values })),
      unit: valid.analysis.unit,
      provenance: {
        datasetId: valid.dataset.id, revision: valid.analysis.revision,
        verifiedAt: valid.verification.verifiedAt, provider: 'databricks',
        queryRef: valid.verification.statementId, summary,
      },
      verifiedSnapshot: valid,
    },
  }) as Extract<OrderedPresentationSlide, { type: 'chart' }>;
}
