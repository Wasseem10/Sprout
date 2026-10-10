import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { config } from '../server/config.js';
import { energyOnDatabricks, newEnergyState } from '../server/computer/energy.js';

// Send only the six numeric values from explicitly synthetic bills.
const result = await energyOnDatabricks(newEnergyState(), config(), AbortSignal.timeout(90000));
assert.deepEqual(result.values, [45, 45, 0, 0]);
const evidence = {
  checkedAt: new Date().toISOString(),
  provider: 'databricks',
  synthetic: true,
  billChange: result.values[0],
  usageEffect: result.values[1],
  rateEffect: result.values[2],
  otherEffect: result.values[3],
  queryReference: result.queryReference,
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/databricks-energy-live.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
