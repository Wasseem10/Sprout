import { it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { ComputerController, publicUrl } from '../server/computer/controller';
import {
  compareBills,
  newEnergyState,
  parseEnergyCsv,
  quoteOption,
} from '../server/computer/energy';
import { EnergyStore } from '../server/providers/energyStore';
import { spokenComputerReply } from '../src/speechText';

const controllers: ComputerController[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const c of controllers.splice(0)) await c.close();
});
const signal = () => new AbortController().signal;
async function setup() {
  const cfg = {
    ...config(),
    hfToken: '',
    cloudUrl: '',
    neonUrl: '',
    localDir: await mkdtemp(path.join(tmpdir(), 'insight-energy-')),
  };
  const c = new ComputerController(cfg, { headless: true });
  controllers.push(c);
  await c.init();
  return { c, cfg };
}
it('separates billing-day usage, rate effects and fixed charges without inventing an appliance cause', () => {
  const result = compareBills([
    { month: '2026-08', days: 30, kwh: 900, energyCharge: 135, otherCharges: 60 },
    { month: '2026-09', days: 40, kwh: 1200, energyCharge: 240, otherCharges: 70 },
  ]);
  expect(result).toMatchObject({
    billChange: 115,
    usageEffect: 45,
    rateEffect: 60,
    otherEffect: 10,
    previousDailyKwh: 30,
    currentDailyKwh: 30,
  });
  expect(result.usageEffect + result.rateEffect + result.otherEffect).toBe(result.billChange);
});
it('uses gross payments for affordability and supports interest-bearing quotes', () => {
  const q = quoteOption(
    {
      id: 'test',
      name: 'Test',
      cost: 1200,
      rebate: 200,
      estimatedMonthlyKwh: 100,
      months: 24,
      apr: 0,
    },
    0.15,
    30,
  );
  expect(q).toMatchObject({
    financed: 1000,
    payment: 41.67,
    estimatedSavings: 15,
    netMonthlyCost: 26.67,
    annualKwh: 1200,
    fitsBudget: false,
  });
  const interest = quoteOption({ ...q, apr: 12 }, 0.15, 100);
  expect(interest.payment).toBe(47.07);
  expect(interest.interest).toBeGreaterThan(0);
  expect(() => quoteOption({ ...q, rebate: 1500 }, 0.15, 30)).toThrow();
});
it('rejects duplicate periods, empty values, negative usage, and ambiguous imported CSV', () => {
  const header = 'month,days,kwh,energyCharge,otherCharges\n';
  const valid = header + '2026-08,30,900,135,60\n2026-09,30,1200,180,60';
  expect(parseEnergyCsv(valid)).toHaveLength(2);
  expect(() => parseEnergyCsv(valid.replace('2026-09', '2026-08'))).toThrow();
  expect(() => parseEnergyCsv(valid.replace('1200', '-1200'))).toThrow();
  expect(() => parseEnergyCsv(valid.replace(',180,', ',,'))).toThrow();
});
it('requires explicit sample use and keeps the payment question in spoken output', async () => {
  const { c } = await setup();
  const missing = await c.request('My electricity bill keeps going up', signal());
  expect(missing.state.energy).toBeUndefined();
  expect(missing.summary).toContain('sample');
  const demo = await c.request('Start the energy demo', signal());
  expect(demo.state.energy?.source).toBe('synthetic');
  expect(spokenComputerReply(demo)).toContain('What monthly improvement payment');
  await c.request('I can only afford thirty five dollars a month', signal());
  expect(c.snapshot().energy?.budget).toBe(35);
  const measured = await c.request('Record usage 1000 kilowatt-hours over 30 days', signal());
  expect(measured.state.energy?.observedPostUpgrade).toMatchObject({ days: 30, kwh: 1000 });
  expect(measured.summary).toContain('does not prove');
  await c.request('My budget is -30 dollars', signal());
  expect(c.snapshot().energy?.budget).toBe(35);
});
it('fills a real multipage demo browser, preserves answers during correction and verifies updated review', async () => {
  const { c } = await setup();
  await c.request('Start the energy demo', signal());
  await c.request('I can afford $60 per month', signal());
  await c.request('Choose duct repair', signal());
  const ask = await c.request('Prepare my energy application', signal());
  expect(ask.summary).toContain('What name');
  const ready = await c.request('Use demo details', signal());
  expect(ready.state.energy).toMatchObject({
    phase: 'review',
    applicationVerified: true,
    applicant: { name: 'Alex Demo', ownership: 'homeowner' },
    selected: 'ducts',
  });
  expect(ready.state.browser?.text).toContain('Ready for your review');
  expect(ready.state.browser?.text).toContain('$60.00');
  expect(ready.state.browser?.image).toMatch(/^data:image\/png/);
  await c.interrupt();
  const correction = await c.request('Wait, I can only afford $30 per month', signal());
  expect(correction.summary).toContain('above your $30.00');
  expect(correction.state.energy?.applicationVerified).toBe(false);
  const updated = await c.request('Choose weather sealing', signal());
  expect(updated.state.energy).toMatchObject({
    phase: 'review',
    applicationVerified: true,
    budget: 30,
    selected: 'sealing',
  });
  expect(updated.state.browser?.text).toContain('Weather sealing');
  expect(updated.state.browser?.text).toContain('$30.00');
  expect(updated.state.browser?.text).toContain('Alex Demo');
  expect(updated.state.browser?.text).not.toContain('Duct repair');
  const page = (c as unknown as { page: import('playwright').Page }).page;
  await page.locator('#edit').click();
  await page.locator('#budget').fill('40');
  await page.locator('#review').click();
  const readback = await c.request('Read the application back', signal());
  expect(readback.state.energy?.applicationVerified).toBe(false);
  expect(readback.summary).toContain('cannot verify');
  expect(readback.state.browser?.text).toContain('$40.00');
}, 30000);
it('saves only on request and restores a plan after restart without claiming a browser is verified', async () => {
  const { c, cfg } = await setup();
  await c.request('Start the energy demo', signal());
  await c.request('I can afford $30 per month', signal());
  await c.request('Choose weather sealing', signal());
  expect(await new EnergyStore(cfg).load(signal())).toBeNull();
  await c.request('Save my energy plan', signal());
  const restarted = new ComputerController(cfg, { headless: true });
  controllers.push(restarted);
  await restarted.init();
  const loaded = await restarted.request('Resume my energy plan', signal());
  expect(loaded.state.energy).toMatchObject({
    budget: 30,
    selected: 'sealing',
    saved: 'local',
    applicationVerified: false,
  });
});
it('sends bound billing values to Databricks and rejects incorrect returned totals', async () => {
  const { c, cfg } = await setup();
  cfg.dbHost = 'https://warehouse.example';
  cfg.dbWarehouse = 'warehouse';
  cfg.dbToken = 'test';
  let sent: any;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return new Response(
        JSON.stringify({
          statement_id: 'energy-query',
          status: { state: 'SUCCEEDED' },
          manifest: {
            schema: {
              columns: ['bill_change', 'usage_effect', 'rate_effect', 'other_effect'].map(
                (name) => ({ name }),
              ),
            },
          },
          result: { data_array: [['45', '45', '0', '0']] },
        }),
      );
    }),
  );
  await c.request('Start the energy demo', signal());
  const r = await c.request('Analyze my energy bills using Databricks', signal());
  expect(r.state.energy).toMatchObject({
    provider: 'databricks',
    queryReference: 'Databricks statement energy-query',
  });
  expect(sent.parameters).toHaveLength(6);
  expect(sent.statement).toContain(':k0');
  expect(sent.statement).not.toContain('1200');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            statement_id: 'wrong-query',
            status: { state: 'SUCCEEDED' },
            manifest: {
              schema: {
                columns: ['bill_change', 'usage_effect', 'rate_effect', 'other_effect'].map(
                  (name) => ({ name }),
                ),
              },
            },
            result: { data_array: [['999', '45', '0', '0']] },
          }),
        ),
    ),
  );
  await expect(c.request('Analyze my energy bills using Databricks', signal())).rejects.toThrow(
    'did not match',
  );
});
it('keeps the owned rehearsal exception from allowing arbitrary local navigation', async () => {
  await expect(publicUrl('http://127.0.0.1:4311')).rejects.toThrow();
  await expect(publicUrl('https://127.0.0.1')).rejects.toThrow();
});

it('accepts short conversational answers without inventing applicant details', async () => {
  const { c } = await setup();
  await c.request('Start the energy demo', signal());
  const budget = await c.request('thirty', signal());
  expect(budget.state.energy?.budget).toBe(30);
  const accepted = await c.request('yes', signal());
  expect(accepted.state.energy?.selected).toBe('sealing');
  expect(accepted.summary).toContain('What name');
  const name = await c.request('Alex Morgan', signal());
  expect(name.state.energy?.applicant.name).toBe('Alex Morgan');
  expect(name.summary).toContain('homeowner or renter');
  const review = await c.request('renter', signal());
  expect(review.state.energy?.applicationVerified).toBe(true);
  expect(review.state.browser?.text).toContain('Alex Morgan');
  expect(review.state.browser?.text).toContain('renter');
}, 30000);
