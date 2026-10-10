import { readFile } from 'node:fs/promises';
import { config } from '../server/config.js';
import { Databricks } from '../server/providers/databricks.js';
import { parseCsv } from '../shared/analysis.js';
const cfg = config();
if (!cfg.dbHost || !cfg.dbToken || !cfg.dbWarehouse)
  throw new Error(
    'Set DATABRICKS_HOST, DATABRICKS_TOKEN, and DATABRICKS_WAREHOUSE_ID in .env first.',
  );
const dataset = parseCsv(
  await readFile('data/operations-synthetic.csv', 'utf8'),
  'Operations · synthetic sample',
  true,
);
const table = await new Databricks(cfg).seed(dataset, AbortSignal.timeout(120000));
console.log(`Seeded ${dataset.rows.length} synthetic rows into ${table}.`);
