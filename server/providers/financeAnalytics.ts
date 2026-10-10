import type { Config } from '../config.js';
import { Databricks } from './databricks.js';
import { analyzeFinance, ledgerSchema, type Transaction } from '../../shared/finance.js';

export async function financeOnDatabricks(input: Transaction[], cfg: Config, signal: AbortSignal) {
  const rows = ledgerSchema.parse(input);
  const expected = new Map<string, { count: number; cents: number }>();
  for (const r of rows) {
    const key = JSON.stringify([r.date.slice(0, 7), r.category, r.kind]);
    const value = expected.get(key) ?? { count: 0, cents: 0 };
    value.count++;
    value.cents += r.cents;
    expected.set(key, value);
  }
  if (expected.size > 900)
    throw new Error(
      'Computer Databricks finance analysis supports up to 900 month/category groups.',
    );
  // Descriptions, account numbers, names and original files are never sent.
  const ledger = rows.map((r) => ({
    month: r.date.slice(0, 7),
    category: r.category,
    kind: r.kind,
    cents: r.cents,
  }));
  const query = await new Databricks(cfg).statement(
    `WITH ledger AS (
    SELECT explode(from_json(:ledger, 'array<struct<month:string,category:string,kind:string,cents:bigint>>')) AS t
  ) SELECT t.month AS month, t.category AS category, t.kind AS kind,
    COUNT(*) AS row_count, SUM(t.cents) AS total_cents FROM ledger
    GROUP BY t.month, t.category, t.kind ORDER BY month, category, kind`,
    [{ name: 'ledger', value: JSON.stringify(ledger), type: 'STRING' }],
    signal,
  );
  signal.throwIfAborted();
  if (
    JSON.stringify(query.columns) !==
      JSON.stringify(['month', 'category', 'kind', 'row_count', 'total_cents']) ||
    query.rows.length !== expected.size
  )
    throw new Error('Databricks finance results have an unexpected shape.');
  const seen = new Set<string>();
  for (const [month, category, kind, count, cents] of query.rows) {
    const key = JSON.stringify([month, category, kind]);
    const local = expected.get(key);
    if (
      !local ||
      seen.has(key) ||
      count === null ||
      cents === null ||
      Number(count) !== local.count ||
      Number(cents) !== local.cents
    )
      throw new Error(
        'Databricks finance results did not match the source records. No cloud result was applied.',
      );
    seen.add(key);
  }
  const analysis = analyzeFinance(rows);
  // Every aggregate has been reconciled against integer-cent source totals.
  return {
    analysis,
    provider: 'databricks' as const,
    queryReference: `Databricks statement ${query.id}`,
  };
}
