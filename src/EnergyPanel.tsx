import { Leaf, ShieldCheck } from 'lucide-react';
import type { EnergyState } from '../shared/energy';
import { energyProgramUrl } from '../shared/energy';
import './energy.css';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export default function EnergyPanel({
  state,
  compact = false,
  disabled,
  ask,
}: {
  state: EnergyState;
  compact?: boolean;
  disabled: boolean;
  ask: (text: string) => void;
}) {
  const selected = state.quotes.find((q) => q.id === state.selected);
  return (
    <section
      className={`energy-panel ${compact ? 'compact' : ''}`}
      aria-label="Energy and affordability plan"
    >
      <div className="energy-heading">
        <Leaf size={19} aria-hidden="true" />
        <strong>Your home. Your choices.</strong>
        <span>{state.source === 'synthetic' ? 'SAMPLE BILLS' : 'IMPORTED BILLS'}</span>
      </div>
      <div className="energy-metrics">
        <div>
          <small>Latest bill</small>
          <strong>{usd(state.comparison.currentBill)}</strong>
          <small>{usd(state.comparison.billChange)} change</small>
        </div>
        <div>
          <small>Payment limit</small>
          <strong>{state.budget === null ? 'Your choice' : `${usd(state.budget)}/mo`}</strong>
          <small>Before estimated savings</small>
        </div>
        <div>
          <small>Chosen improvement</small>
          <strong>{selected?.name ?? 'Not selected'}</strong>
          <small>
            {selected ? `${selected.annualKwh} kWh/year estimated` : 'Compare your options'}
          </small>
        </div>
      </div>
      {state.applicationVerified && (
        <p className="energy-verified">
          <ShieldCheck size={16} aria-hidden="true" /> Browser fields verified · ready for review ·
          nothing submitted
        </p>
      )}
      {selected?.fitsBudget === false && (
        <div className="energy-budget-alert" role="status">
          <strong>Your choice is above your payment limit.</strong>
          <p>
            {selected.name} is {usd(selected.payment)} a month; your limit is {usd(state.budget!)}.
            Choose an option within your limit before preparing the practice application.
          </p>
          <div className="energy-actions">
            {state.quotes
              .filter((quote) => quote.fitsBudget)
              .map((quote) => (
                <button
                  key={quote.id}
                  disabled={disabled}
                  onClick={() => ask(`Choose ${quote.name}`)}
                >
                  {quote.name} · {usd(quote.payment)}/mo
                </button>
              ))}
          </div>
        </div>
      )}
      <details open={!compact}>
        <summary>Calculations, assumptions and options</summary>
        <div className="energy-detail">
          <p>
            {state.sourceName}. Usage: {state.comparison.previousDailyKwh} →{' '}
            {state.comparison.currentDailyKwh} kWh/day. Changes: usage{' '}
            {usd(state.comparison.usageEffect)}, effective rate {usd(state.comparison.rateEffect)},
            other charges {usd(state.comparison.otherEffect)}.
          </p>
          <div
            className="energy-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Scrollable improvement quote table"
          >
            <table>
              <caption>Fictional contractor quotes · 24 months · 0% assumed interest</caption>
              <thead>
                <tr>
                  <th scope="col">Improvement</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Estimated bill savings</th>
                  <th scope="col">Payment minus savings</th>
                </tr>
              </thead>
              <tbody>
                {state.quotes.map((q) => (
                  <tr key={q.id} className={state.selected === q.id ? 'chosen' : ''}>
                    <th scope="row">
                      {q.name}
                      <small>
                        {usd(q.cost)} cost − {usd(q.rebate)} hypothetical rebate
                      </small>
                    </th>
                    <td>
                      {usd(q.payment)}/mo
                      <small>
                        {q.fitsBudget === null
                          ? 'Set a limit'
                          : q.fitsBudget
                            ? 'Within limit'
                            : 'Above limit'}
                      </small>
                    </td>
                    <td>
                      {usd(q.estimatedSavings)}/mo<small>{q.annualKwh} kWh/year</small>
                    </td>
                    <td>{usd(q.netMonthlyCost)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Savings use the bill’s effective energy charge per kWh. Fixed charges are unchanged.
            Quotes, rebates, interest and energy reductions are assumptions; no eligibility or
            financing has been approved.
          </p>
          {state.observedPostUpgrade && (
            <p>
              Recorded follow-up: {state.observedPostUpgrade.kwh} kWh over{' '}
              {state.observedPostUpgrade.days} days; daily change{' '}
              {state.observedPostUpgrade.dailyChange} kWh. Weather and occupancy are not controlled,
              so this does not prove causation.
            </p>
          )}
          <p>
            Analysis:{' '}
            {state.provider === 'databricks' ? state.queryReference : 'Verified local calculations'}
            . {state.saved ? `Plan saved in ${state.saved}.` : 'Plan has not been saved.'}
          </p>
          <a href={energyProgramUrl} target="_blank" rel="noreferrer">
            OUC program information ↗
          </a>
          <p>Reference checked October 10, 2026. This rehearsal is independent of OUC.</p>
        </div>
      </details>
      <div className="energy-actions">
        <button disabled={disabled} onClick={() => ask('I can afford $30 per month')}>
          Try a $30 limit
        </button>
        <button
          disabled={disabled || selected?.fitsBudget === false}
          onClick={() => ask('Prepare my energy application')}
        >
          Prepare demo application
        </button>
        <button disabled={disabled} onClick={() => ask('Save my energy plan')}>
          Save plan
        </button>
      </div>
    </section>
  );
}
