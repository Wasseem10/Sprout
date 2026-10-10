import Papa from 'papaparse';
import { createHash } from 'node:crypto';
import {
  comparisonSchema,
  datasetSchema,
  rowSchema,
  type AnalysisResult,
  type Comparison,
  type Dataset,
} from './schema.js';
import { inferComparison } from './periods.js';

export function validateDataset(dataset: Dataset): Dataset {
  const valid = datasetSchema.parse(dataset);
  const seen = new Set<string>(),
    locations = new Map<string, string>();
  if (new Set(valid.rows.map((r) => r.region)).size > 50)
    throw new Error('This workflow supports at most 50 regions.');
  for (const row of valid.rows) {
    const key = JSON.stringify([row.location_id, row.date]);
    if (seen.has(key)) throw new Error(`Duplicate location/date: ${row.location_id}, ${row.date}.`);
    seen.add(key);
    if (
      row.date < row.operating_start ||
      (row.operating_end && row.date > row.operating_end) ||
      (row.operating_end && row.operating_end < row.operating_start)
    )
      throw new Error(`Inconsistent operating dates for ${row.location_id}.`);
    const metadata = JSON.stringify([row.region, row.operating_start, row.operating_end]);
    if (locations.has(row.location_id) && locations.get(row.location_id) !== metadata)
      throw new Error(`Conflicting location metadata for ${row.location_id}.`);
    locations.set(row.location_id, metadata);
  }
  return valid;
}
export function datasetVersion(dataset: Dataset) {
  return createHash('sha256').update(JSON.stringify(dataset.rows)).digest('hex');
}
export function parseCsv(text: string, name: string, synthetic = false): Dataset {
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024)
    throw new Error('CSV must be 1 MB or smaller.');
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`);
  const expected = ['date', 'location_id', 'region', 'revenue', 'operating_start', 'operating_end'];
  if (
    expected.some((f) => !parsed.meta.fields?.includes(f)) ||
    parsed.meta.fields?.length !== expected.length
  )
    throw new Error(`CSV requires exactly these columns: ${expected.join(', ')}.`);
  const rows = parsed.data.map((r, i) => {
    if (!/^-?\d+(\.\d{1,2})?$/.test(r.revenue?.trim() ?? ''))
      throw new Error(`Row ${i + 2}: revenue must be a number with at most two decimal places.`);
    const result = rowSchema.safeParse({
      date: r.date.trim(),
      location_id: r.location_id.trim(),
      region: r.region.trim(),
      revenue: Number(r.revenue),
      operating_start: r.operating_start.trim(),
      operating_end: r.operating_end.trim() || null,
    });
    if (!result.success) throw new Error(`Row ${i + 2}: ${result.error.issues[0].message}`);
    return result.data;
  });
  const dataset: Dataset = { id: '', name, synthetic, rows };
  dataset.id = `csv-${datasetVersion(dataset).slice(0, 24)}`;
  return validateDataset(dataset);
}
export function defaultComparison(dataset: Dataset): Comparison {
  validateDataset(dataset);
  return inferComparison(dataset);
}
export const percentChange = (previous: number, current: number) =>
  previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
export function analyzeLocal(dataset: Dataset, input: Comparison): AnalysisResult {
  validateDataset(dataset);
  const comparison = comparisonSchema.parse(input);
  const metadata = new Map(dataset.rows.map((r) => [r.location_id, r]));
  const relevant = dataset.rows.filter(
    (r) =>
      (r.date >= comparison.previous.start && r.date <= comparison.previous.end) ||
      (r.date >= comparison.current.start && r.date <= comparison.current.end),
  );
  const relevantIds = new Set(relevant.map((r) => r.location_id));
  const eligible = new Set(
    [...relevantIds].filter((id) => {
      const r = metadata.get(id)!;
      return (
        !comparison.commonLocations ||
        (r.operating_start <= comparison.previous.start &&
          (r.operating_end === null || r.operating_end >= comparison.current.end))
      );
    }),
  );
  const included = relevant.filter((r) => eligible.has(r.location_id));
  const groups = new Map<string, { previous: number; current: number; rowCount: number }>();
  for (const r of included) {
    const group = groups.get(r.region) ?? { previous: 0, current: 0, rowCount: 0 };
    group[r.date <= comparison.previous.end ? 'previous' : 'current'] += Math.round(
      r.revenue * 100,
    );
    group.rowCount++;
    groups.set(r.region, group);
  }
  const regions = [...groups]
    .map(([region, g]) => ({
      region,
      previous: g.previous / 100,
      current: g.current / 100,
      delta: (g.current - g.previous) / 100,
      percent: percentChange(g.previous, g.current),
      rowCount: g.rowCount,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.region.localeCompare(b.region));
  const previousTotal = regions.reduce((sum, r) => sum + Math.round(r.previous * 100), 0) / 100,
    currentTotal = regions.reduce((sum, r) => sum + Math.round(r.current * 100), 0) / 100;
  return {
    id: crypto.randomUUID(),
    datasetId: dataset.id,
    datasetVersion: datasetVersion(dataset),
    provider: 'local-sample',
    comparison,
    regions,
    previousTotal,
    currentTotal,
    percent: percentChange(previousTotal, currentTotal),
    includedRows: included.length,
    includedLocations: eligible.size,
    excludedLocations: relevantIds.size - eligible.size,
    queryReference: 'Local integer-cent aggregation',
    calculation:
      'Percentage change = (current revenue − previous revenue) ÷ absolute previous revenue × 100. A zero previous total has no defined percentage. Common locations must have been operating continuously for the full duration of both selected quarters; opening during the prior quarter or closing during the current quarter is excluded.',
    createdAt: new Date().toISOString(),
  };
}
