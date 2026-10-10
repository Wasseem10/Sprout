import type { Config } from '../config.js';
import { Databricks } from './databricks.js';

export type WorkbookMeasure = { category: string | null; value: number };

// A single parameterized query sends only the selected measure and category.
// Source labels and values are never interpolated into SQL, and no user table is changed.
export async function analyzeWorkbookOnDatabricks(
  rows: WorkbookMeasure[],
  cfg: Config,
  signal: AbortSignal,
) {
  if (!cfg.dbHost || !cfg.dbWarehouse || !cfg.dbToken)
    throw new Error(
      'Connect a Databricks workspace, SQL warehouse ID, and access token in Settings first. This workbook has not been sent to Databricks.',
    );
  signal.throwIfAborted();
  if (!rows.length || rows.length > 3000 || rows.some((row) => !Number.isFinite(row.value)))
    throw new Error('Databricks workbook analysis needs 1 to 3,000 finite numeric values.');
  const parameters: { name: string; value: string; type: string }[] = [];
  const values = rows.map((row, index) => {
    parameters.push({ name: `v${index}`, value: String(row.value), type: 'DOUBLE' });
    if (row.category !== null) {
      if (row.category.length > 2000) throw new Error('A workbook category label is too long.');
      parameters.push({ name: `c${index}`, value: row.category, type: 'STRING' });
    }
    return `(${row.category === null ? 'CAST(NULL AS STRING)' : `:c${index}`}, :v${index})`;
  });
  const query = await new Databricks(cfg).statement(
    `WITH source(category, value) AS (VALUES ${values.join(', ')}), totals AS (
      SELECT COUNT(*) AS numeric_count, SUM(value) AS total, AVG(value) AS average FROM source
    ), ranked AS (
      SELECT category, SUM(value) AS group_total FROM source WHERE category IS NOT NULL
      GROUP BY category ORDER BY group_total DESC, category ASC LIMIT 1
    ) SELECT numeric_count, total, average, category, group_total FROM totals LEFT JOIN ranked ON TRUE`,
    parameters,
    signal,
  );
  signal.throwIfAborted();
  const expected = ['numeric_count', 'total', 'average', 'category', 'group_total'];
  if (JSON.stringify(query.columns) !== JSON.stringify(expected) || query.rows.length !== 1)
    throw new Error('Databricks returned an unexpected workbook result.');
  const [countValue, totalValue, averageValue, category, groupTotalValue] = query.rows[0];
  const count = Number(countValue),
    total = Number(totalValue),
    average = Number(averageValue);
  const groupTotal = groupTotalValue === null ? null : Number(groupTotalValue);
  if (
    countValue === null ||
    totalValue === null ||
    averageValue === null ||
    count !== rows.length ||
    !Number.isFinite(total) ||
    !Number.isFinite(average) ||
    (category !== null &&
      (typeof category !== 'string' || groupTotal === null || !Number.isFinite(groupTotal)))
  )
    throw new Error('Databricks returned incomplete or invalid workbook totals.');
  return {
    count,
    total,
    average,
    highest:
      typeof category === 'string' && groupTotal !== null ? { category, total: groupTotal } : null,
    queryReference: `Databricks statement ${query.id}`,
    provider: 'databricks' as const,
  };
}
