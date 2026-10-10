import type { Comparison, Dataset, Period } from './schema.js';
function quarter(date: string): Period {
  const [year, month] = date.split('-').map(Number),
    q = Math.floor((month - 1) / 3);
  return {
    label: `Q${q + 1} ${year}`,
    start: new Date(Date.UTC(year, q * 3, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, q * 3 + 3, 0)).toISOString().slice(0, 10),
  };
}
export function inferComparison(dataset: Dataset): Comparison {
  const max = dataset.rows.reduce((v, r) => (r.date > v ? r.date : v), '');
  if (!max) throw new Error('Open a dataset first.');
  const current = quarter(max);
  const priorDate = new Date(current.start + 'T00:00:00Z');
  priorDate.setUTCDate(0);
  const previous = quarter(priorDate.toISOString().slice(0, 10));
  if (!dataset.rows.some((r) => r.date >= previous.start && r.date <= previous.end))
    throw new Error('Include data for the latest quarter and its immediately previous quarter.');
  return { previous, current, commonLocations: false };
}
