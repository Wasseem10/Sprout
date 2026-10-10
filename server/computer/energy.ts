// Share the same validated calculations between the desktop and public demo.
export * from '../../shared/energy-calculations.js';
import type { EnergyState } from '../../shared/energy.js';
import type { Config } from '../config.js';
import { Databricks } from '../providers/databricks.js';
const round = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export async function energyOnDatabricks(state: EnergyState, cfg: Config, signal: AbortSignal) {
  const bills = [...state.bills].sort((a, b) => a.month.localeCompare(b.month)).slice(-2);
  const parameters = bills.flatMap((b, i) => [
    { name: `k${i}`, value: String(b.kwh), type: 'DOUBLE' },
    { name: `e${i}`, value: String(b.energyCharge), type: 'DOUBLE' },
    { name: `o${i}`, value: String(b.otherCharges), type: 'DOUBLE' },
  ]);
  const result = await new Databricks(cfg).statement(
    `WITH bill(kwh,energy,other,period) AS
    (VALUES (:k0,:e0,:o0,0),(:k1,:e1,:o1,1)), prior AS (SELECT * FROM bill WHERE period=0),
    current AS (SELECT * FROM bill WHERE period=1)
    SELECT c.energy+c.other-p.energy-p.other AS bill_change,
    (c.kwh-p.kwh)*(p.energy/p.kwh) AS usage_effect,
    c.kwh*((c.energy/c.kwh)-(p.energy/p.kwh)) AS rate_effect,
    c.other-p.other AS other_effect FROM current c CROSS JOIN prior p`,
    parameters,
    signal,
  );
  const fields = ['bill_change', 'usage_effect', 'rate_effect', 'other_effect'];
  if (JSON.stringify(result.columns) !== JSON.stringify(fields) || result.rows.length !== 1)
    throw new Error('Databricks returned an unexpected energy analysis.');
  const values = result.rows[0];
  const expected = [
    state.comparison.billChange,
    state.comparison.usageEffect,
    state.comparison.rateEffect,
    state.comparison.otherEffect,
  ];
  if (
    values.some(
      (v, i) =>
        v === null || !Number.isFinite(Number(v)) || Math.abs(Number(v) - expected[i]) > 0.02,
    )
  )
    throw new Error('Databricks energy results did not match the verified billing calculation.');
  return {
    values: values.map((v) => round(Number(v))),
    queryReference: `Databricks statement ${result.id}`,
  };
}
