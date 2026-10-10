import { datasetVersion, validateDataset, percentChange } from '../../shared/analysis.js';
import {
  comparisonSchema,
  type AnalysisResult,
  type Comparison,
  type Dataset,
} from '../../shared/schema.js';
import type { Config } from '../config.js';
import { checkpoint, fetchJson, secureUrl } from './http.js';
type Parameter = { name: string; value: string; type: string };
export class Databricks {
  constructor(private cfg: Config) {}
  private base() {
    if (!this.cfg.dbHost || !this.cfg.dbToken || !this.cfg.dbWarehouse)
      throw new Error(
        'Databricks needs DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_WAREHOUSE_ID.',
      );
    const url = secureUrl(this.cfg.dbHost);
    if (url.pathname !== '/')
      throw new Error('DATABRICKS_HOST must be the workspace origin without a path.');
    return url.origin;
  }
  async statement(sql: string, parameters: Parameter[], signal: AbortSignal) {
    const base = this.base();
    let id: string | undefined,
      complete = false;
    const headers = {
      Authorization: `Bearer ${this.cfg.dbToken}`,
      'Content-Type': 'application/json',
    };
    try {
      let response = await fetchJson(`${base}/api/2.0/sql/statements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          warehouse_id: this.cfg.dbWarehouse,
          statement: sql,
          parameters,
          wait_timeout: '0s',
          format: 'JSON_ARRAY',
          disposition: 'INLINE',
          row_limit: 1000,
        }),
        signal,
      });
      id = response.statement_id;
      if (!id || !/^[a-zA-Z0-9-]+$/.test(id))
        throw new Error('Databricks did not return a valid statement ID.');
      const deadline = Date.now() + 90000;
      while (['PENDING', 'RUNNING'].includes(response.status?.state)) {
        checkpoint(signal);
        if (Date.now() > deadline)
          throw new Error('Databricks query exceeded 90 seconds. It will be cancelled.');
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => signal.removeEventListener('abort', abort);
          const timer = setTimeout(() => {
            cleanup();
            resolve();
          }, 700);
          const abort = () => {
            clearTimeout(timer);
            cleanup();
            reject(new DOMException('Stopped', 'AbortError'));
          };
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
        response = await fetchJson(`${base}/api/2.0/sql/statements/${id}`, { headers, signal });
      }
      checkpoint(signal);
      if (response.status?.state !== 'SUCCEEDED')
        throw new Error(
          `Databricks statement ${response.status?.state ?? 'failed'}. Check warehouse permissions and table access.`,
        );
      if (response.manifest?.truncated)
        throw new Error('Databricks truncated the result; refusing to display partial analysis.');
      let rows: any[][] = [...(response.result?.data_array ?? [])],
        next = response.result?.next_chunk_internal_link;
      while (next) {
        if (
          typeof next !== 'string' ||
          !next.startsWith(`/api/2.0/sql/statements/${id}/result/chunks/`) ||
          next.includes('..') ||
          next.includes('?')
        )
          throw new Error('Invalid result pagination link.');
        const chunk = await fetchJson(base + next, { headers, signal });
        rows.push(...(chunk.data_array ?? []));
        if (rows.length > 1000) throw new Error('Result exceeds the bounded workflow limit.');
        next = chunk.next_chunk_internal_link;
      }
      const columns = (response.manifest?.schema?.columns ?? []).map((c: any) => c.name as string);
      complete = true;
      return { id, rows, columns };
    } finally {
      if (id && !complete) {
        try {
          await fetch(`${base}/api/2.0/sql/statements/${id}/cancel`, {
            method: 'POST',
            headers,
            signal: AbortSignal.timeout(3000),
          });
        } catch {
          /* Cancellation attempted; caller still receives the original failure. */
        }
      }
    }
  }
  table(dataset: Dataset) {
    for (const v of [this.cfg.dbCatalog, this.cfg.dbSchema])
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(v))
        throw new Error('Databricks catalog/schema must be simple identifiers.');
    return `\`${this.cfg.dbCatalog}\`.\`${this.cfg.dbSchema}\`.\`ops_${datasetVersion(dataset).slice(0, 24)}\``;
  }
  async seed(dataset: Dataset, signal: AbortSignal) {
    validateDataset(dataset);
    const table = this.table(dataset);
    await this.statement(
      `CREATE SCHEMA IF NOT EXISTS \`${this.cfg.dbCatalog}\`.\`${this.cfg.dbSchema}\``,
      [],
      signal,
    );
    const definition = `${table} (date DATE, location_id STRING, region STRING, revenue DECIMAL(18,2), operating_start DATE, operating_end DATE) USING DELTA`;
    await this.statement(`CREATE TABLE IF NOT EXISTS ${definition}`, [], signal);
    const count = await this.statement(`SELECT COUNT(*) AS n FROM ${table}`, [], signal);
    if (Number(count.rows[0]?.[0]) === dataset.rows.length) return table;
    // Only replace our content-addressed import table, never a user-supplied table.
    await this.statement(`CREATE OR REPLACE TABLE ${definition}`, [], signal);
    for (let offset = 0; offset < dataset.rows.length; offset += 100) {
      checkpoint(signal);
      const params: Parameter[] = [];
      const values = dataset.rows.slice(offset, offset + 100).map((r, i) => {
        const fields = [
          ['date', r.date, 'DATE'],
          ['location_id', r.location_id, 'STRING'],
          ['region', r.region, 'STRING'],
          ['revenue', r.revenue.toFixed(2), 'DECIMAL(18,2)'],
          ['operating_start', r.operating_start, 'DATE'],
          ['operating_end', r.operating_end, 'DATE'],
        ] as const;
        return (
          '(' +
          fields
            .map(([k, value, type]) => {
              if (value === null) return 'NULL';
              const name = `p${i}_${k}`;
              params.push({ name, value: String(value), type });
              return ':' + name;
            })
            .join(',') +
          ')'
        );
      });
      await this.statement(`INSERT INTO ${table} VALUES ${values.join(',')}`, params, signal);
    }
    return table;
  }
  async analyze(dataset: Dataset, input: Comparison, signal: AbortSignal): Promise<AnalysisResult> {
    const comparison = comparisonSchema.parse(input),
      table = await this.seed(dataset, signal);
    const parameters: Parameter[] = [
      { name: 'ps', value: comparison.previous.start, type: 'DATE' },
      { name: 'pe', value: comparison.previous.end, type: 'DATE' },
      { name: 'cs', value: comparison.current.start, type: 'DATE' },
      { name: 'ce', value: comparison.current.end, type: 'DATE' },
      { name: 'common', value: String(comparison.commonLocations), type: 'BOOLEAN' },
    ];
    const sql = `WITH relevant AS (SELECT * FROM ${table} WHERE date BETWEEN :ps AND :pe OR date BETWEEN :cs AND :ce), eligible AS (SELECT * FROM relevant WHERE NOT :common OR (operating_start <= :ps AND (operating_end IS NULL OR operating_end >= :ce))) SELECT region, SUM(CASE WHEN date BETWEEN :ps AND :pe THEN revenue ELSE 0 END) AS previous, SUM(CASE WHEN date BETWEEN :cs AND :ce THEN revenue ELSE 0 END) AS current, COUNT(*) AS row_count, COUNT(DISTINCT location_id) AS locations, (SELECT COUNT(DISTINCT location_id) FROM relevant) AS all_locations FROM eligible GROUP BY region`;
    const query = await this.statement(sql, parameters, signal);
    checkpoint(signal);
    const expected = ['region', 'previous', 'current', 'row_count', 'locations', 'all_locations'];
    if (JSON.stringify(query.columns) !== JSON.stringify(expected))
      throw new Error('Databricks returned an unexpected analysis schema.');
    const regions = query.rows
      .map((row) => {
        const previous = Number(row[1]),
          current = Number(row[2]);
        return {
          region: String(row[0]),
          previous,
          current,
          delta: Math.round((current - previous) * 100) / 100,
          percent: percentChange(previous, current),
          rowCount: Number(row[3]),
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.region.localeCompare(b.region));
    const previousTotal = regions.reduce((s, r) => s + Math.round(r.previous * 100), 0) / 100,
      currentTotal = regions.reduce((s, r) => s + Math.round(r.current * 100), 0) / 100;
    const includedLocations = query.rows.reduce((s, r) => s + Number(r[4]), 0);
    let allLocations = Number(query.rows[0]?.[5] ?? 0);
    if (!query.rows.length) {
      const total = await this.statement(
        `SELECT COUNT(DISTINCT location_id) AS n FROM ${table} WHERE date BETWEEN :ps AND :pe OR date BETWEEN :cs AND :ce`,
        parameters.filter((p) => p.name !== 'common'),
        signal,
      );
      allLocations = Number(total.rows[0]?.[0] ?? 0);
    }
    return {
      id: crypto.randomUUID(),
      datasetId: dataset.id,
      datasetVersion: datasetVersion(dataset),
      provider: 'databricks',
      comparison,
      regions,
      previousTotal,
      currentTotal,
      percent: percentChange(previousTotal, currentTotal),
      includedRows: regions.reduce((s, r) => s + r.rowCount, 0),
      includedLocations,
      excludedLocations: allLocations - includedLocations,
      queryReference: `Databricks statement ${query.id}; table ${table}`,
      calculation:
        'Percentage change = (current revenue − previous revenue) ÷ absolute previous revenue × 100. A zero comparison denominator is undefined. Common locations must have continuous operating coverage from the start of the previous quarter through the end of the current quarter. Region ranking uses absolute currency change.',
      createdAt: new Date().toISOString(),
    };
  }
}
