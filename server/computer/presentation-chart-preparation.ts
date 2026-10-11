import type { StudioState } from '../../shared/studio.js';
import type { Config } from '../config.js';
import { Databricks } from '../providers/databricks.js';
import {
  assertChartSnapshotCurrent, buildVerifiedChartSnapshot, captureStudioChartBinding, ChartSnapshotError,
} from './presentation-chart-snapshot.js';

/** Called with server-owned Studio state only. Never accepts a client-supplied verified result. */
export async function prepareVerifiedStudioChart(studio: StudioState, cfg: Config, signal: AbortSignal) {
  signal.throwIfAborted();
  const sourceBinding = captureStudioChartBinding(studio);
  const verifiedState = structuredClone(studio);
  const { dataset, result } = verifiedState.workspace;
  if (!dataset || !result) throw new ChartSnapshotError('invalid_source', 'Load a source table and choose its comparison before adding a chart.');
  verifiedState.workspace.result = await new Databricks(cfg).analyze(dataset, result.comparison, signal);
  signal.throwIfAborted();
  const evidence = buildVerifiedChartSnapshot(verifiedState, captureStudioChartBinding(verifiedState));
  return { sourceBinding, verifiedState, ...evidence };
}

export type PreparedStudioChart = Awaited<ReturnType<typeof prepareVerifiedStudioChart>>;

/** Presentation ID/revision/generation must be checked separately at the same commit boundary. */
export function assertPreparedStudioChartCurrent(prepared: PreparedStudioChart, current: StudioState): void {
  const binding = captureStudioChartBinding(current);
  if (binding.hash !== prepared.sourceBinding.hash || binding.revision !== prepared.sourceBinding.revision
    || binding.datasetFingerprint !== prepared.sourceBinding.datasetFingerprint)
    throw new ChartSnapshotError('stale_analysis', 'The source analysis changed while Databricks checked it. Verify the current analysis before inserting the chart.');
  assertChartSnapshotCurrent(prepared.snapshot, prepared.verifiedState);
}
