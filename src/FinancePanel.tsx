import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  Headphones,
  ShieldCheck,
  Upload,
  Undo2,
  Sparkles,
  Landmark,
} from 'lucide-react';
import { dollars, type FinanceState } from '../shared/finance';
import './finance.css';

type Props = {
  state: FinanceState | null;
  compact?: boolean;
  disabled?: boolean;
  databricksReady?: boolean;
  ask: (text: string) => void;
  importFile?: (file: File) => void;
  settings?: () => void;
  workspace?: () => void;
};
const monthName = (month: string) =>
  new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
export default function FinancePanel({
  state,
  compact = false,
  disabled = false,
  databricksReady,
  ask,
  importFile,
  settings,
  workspace,
}: Props) {
  const [category, setCategory] = useState('Groceries'),
    [reduction, setReduction] = useState('100');
  const [amount, setAmount] = useState('1200'),
    [apr, setApr] = useState('12'),
    [months, setMonths] = useState('24'),
    [limit, setLimit] = useState('30');
  useEffect(() => {
    if (state?.loan) {
      setAmount(String(state.loan.principal / 100));
      setApr(String(state.loan.apr));
      setMonths(String(state.loan.months));
      setLimit(String(state.loan.limit / 100));
    }
  }, [state?.loan?.principal, state?.loan?.apr, state?.loan?.months, state?.loan?.limit]);
  if (compact && state)
    return (
      <section className="finance-mini" aria-label="Finance result">
        <span className="finance-kicker">
          <Landmark size={14} aria-hidden="true" /> FINANCE, WITHIN REACH
        </span>
        <strong>
          {dollars(state.scenarioRemaining)}{' '}
          <small>{state.scenarioSavings ? 'scenario difference' : 'recorded difference'}</small>
        </strong>
        {state.loan && (
          <p className={state.loan.withinLimit ? 'finance-good' : 'finance-warning'}>
            {dollars(state.loan.payment)}/mo ·{' '}
            {state.loan.withinLimit ? 'Within your assumptions' : 'Above your assumptions'}
          </p>
        )}
        <span>
          {state.synthetic ? 'Sample records' : 'Imported records'} ·{' '}
          {state.provider === 'databricks' ? 'Databricks verified' : 'Calculated locally'}
        </span>
        <button disabled={disabled} onClick={workspace}>
          Open finance workspace <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </section>
    );
  const current = state?.analysis.current,
    previous = state?.analysis.previous;
  const max = Math.max(
    1,
    ...(state?.analysis.months.flatMap((m) => [m.income, m.expenses]) ?? [1]),
  );
  return (
    <section className="finance-panel" aria-label="Accessible finance workspace">
      <header className="finance-top">
        <div>
          <span className="finance-kicker">
            <Landmark size={15} aria-hidden="true" /> YOUR MONEY. YOUR UNDERSTANDING.
          </span>
          <h2>Finance, within reach.</h2>
          <p>Ask a question. Check the numbers. Make your next move.</p>
        </div>
        <span className="finance-voice">
          <Headphones size={17} aria-hidden="true" /> Voice & keyboard ready
        </span>
      </header>
      <div className="finance-controls">
        {importFile && (
          <label className={`finance-import ${disabled ? 'disabled' : ''}`}>
            <Upload size={16} aria-hidden="true" /> Import transactions
            <input
              type="file"
              aria-label="Import finance CSV or Excel"
              accept=".csv,.xlsx"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importFile(file);
                e.target.value = '';
              }}
            />
          </label>
        )}
        <button disabled={disabled} onClick={() => ask('Start the finance demo')}>
          Try sample finances
        </button>
        {state && (
          <>
            <button
              disabled={disabled}
              onClick={() => ask('Explain my finance in plain English with AI')}
            >
              <Sparkles size={15} aria-hidden="true" /> Explain aloud
            </button>
            <button disabled={disabled} onClick={() => ask('Export my finance Excel workbook')}>
              <FileSpreadsheet size={15} aria-hidden="true" /> Export Excel
            </button>
          </>
        )}
      </div>
      {!state ? (
        <div className="finance-empty">
          <div className="finance-empty-orb">
            <Landmark size={38} aria-hidden="true" />
          </div>
          <h3>Understand the spreadsheet without seeing it.</h3>
          <p>
            Import a transaction file or start with a clearly labeled sample. Sprout compares
            spending, explains changes, and helps you check payment assumptions.
          </p>
          <blockquote>“Why did my spending increase—and can I afford a new payment?”</blockquote>
          <details>
            <summary>Supported transaction format</summary>
            <p>
              CSV or XLSX under 3 MB, up to 3,000 rows. Columns: Date (YYYY-MM-DD), Category,
              Amount. Optional Type (income or expense) and Description. With Type, use positive
              dollar amounts; without Type, income is positive and expenses are negative. Exclude
              transfers. The first populated Excel sheet is used; source formulas use cached values.
            </p>
          </details>
        </div>
      ) : (
        <>
          <div className="finance-source">
            <span className={`finance-badge ${state.synthetic ? 'sample' : ''}`}>
              {state.synthetic ? 'SYNTHETIC DEMO' : 'YOUR IMPORTED RECORDS'}
            </span>
            <span>
              {state.sourceName} · {state.transactions.length} rows
            </span>
            <span className="finance-provider">
              <ShieldCheck size={14} aria-hidden="true" />{' '}
              {state.provider === 'databricks' ? 'Databricks · reconciled' : 'Local · exact cents'}
            </span>
          </div>
          <div className="finance-metrics">
            <article>
              <span>Recorded income</span>
              <strong>{dollars(current!.income)}</strong>
              <small>{monthName(current!.month)}</small>
            </article>
            <article>
              <span>Recorded spending</span>
              <strong>{dollars(current!.expenses)}</strong>
              <small>
                {previous
                  ? `${dollars(Math.abs(current!.expenses - previous.expenses))} ${current!.expenses >= previous.expenses ? 'more' : 'less'} than ${monthName(previous.month)}`
                  : 'One observed month'}
              </small>
            </article>
            <article className="finance-metric-highlight">
              <span>
                {state.scenarioSavings ? 'Hypothetical difference' : 'Recorded difference'}
              </span>
              <strong>{dollars(state.scenarioRemaining)}</strong>
              <small>
                {state.scenarioSavings
                  ? `Includes ${dollars(state.scenarioSavings)} of assumed reductions`
                  : 'Income minus recorded spending · not bank balance'}
              </small>
            </article>
          </div>
          <div className="finance-grid">
            <article className="finance-card">
              <div className="finance-card-title">
                <h3>See the change. Hear the reason.</h3>
                <button
                  disabled={disabled}
                  onClick={() => ask('Why did my finance spending increase?')}
                >
                  Explain changes
                </button>
              </div>
              <div className="finance-chart-legend">
                <span>
                  <i /> Income
                </span>
                <span>
                  <i /> Spending
                </span>
              </div>
              <div
                className="finance-month-chart"
                role="img"
                aria-label={state.analysis.months
                  .map(
                    (m) =>
                      `${monthName(m.month)}: income ${dollars(m.income)}, spending ${dollars(m.expenses)}, difference ${dollars(m.remaining)}`,
                  )
                  .join('. ')}
              >
                {state.analysis.months.slice(-6).map((m) => (
                  <div className="finance-month" key={m.month}>
                    <div className="finance-bars">
                      <div style={{ height: `${Math.max(1, (m.income / max) * 100)}%` }}>
                        <span>{dollars(m.income)}</span>
                      </div>
                      <div style={{ height: `${Math.max(1, (m.expenses / max) * 100)}%` }}>
                        <span>{dollars(m.expenses)}</span>
                      </div>
                    </div>
                    <span>{monthName(m.month)}</span>
                  </div>
                ))}
              </div>
              <details>
                <summary>Read the chart as a table</summary>
                <div
                  className="finance-table-wrap"
                  role="region"
                  aria-label="Scrollable cash flow table"
                  tabIndex={0}
                >
                  <table>
                    <caption>Recorded monthly cash flow in USD</caption>
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Income</th>
                        <th scope="col">Spending</th>
                        <th scope="col">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.analysis.months.map((m) => (
                        <tr key={m.month}>
                          <th scope="row">{monthName(m.month)}</th>
                          <td>{dollars(m.income)}</td>
                          <td>{dollars(m.expenses)}</td>
                          <td>{dollars(m.remaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </article>
            <article className="finance-card">
              <div className="finance-card-title">
                <h3>Where your money went</h3>
                <button disabled={disabled} onClick={() => ask('Explain my spending categories')}>
                  Read categories
                </button>
              </div>
              <ul className="finance-categories">
                {state.analysis.categories.slice(0, 6).map((c) => (
                  <li key={c.category}>
                    <div>
                      <span>{c.category}</span>
                      <strong>{dollars(c.current)}</strong>
                    </div>
                    <div className="finance-category-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.max(0, (c.current / Math.max(1, current!.expenses)) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {previous ? (
                        <>
                          {c.change > 0 ? (
                            <ArrowUpRight size={12} aria-hidden="true" />
                          ) : (
                            <ArrowDownRight size={12} aria-hidden="true" />
                          )}
                          {dollars(Math.abs(c.change))} {c.change >= 0 ? 'more' : 'less'} than
                          previous month
                        </>
                      ) : (
                        'Current recorded spending'
                      )}
                    </small>
                  </li>
                ))}
              </ul>
            </article>
            <article className="finance-card">
              <div className="finance-card-title">
                <h3>Try a budget change</h3>
                <button
                  disabled={disabled}
                  onClick={() => ask('Undo my finance change')}
                  aria-label="Undo finance change"
                >
                  <Undo2 size={15} aria-hidden="true" /> Undo
                </button>
              </div>
              <p>Adjust an assumption. Your original records stay intact.</p>
              <form
                className="finance-scenario-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(`Reduce ${category} by $${reduction}`);
                }}
              >
                <label>
                  Spending category
                  <select
                    aria-label="Scenario spending category"
                    value={
                      state.analysis.categories.some((c) => c.category === category) ? category : ''
                    }
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    disabled={disabled}
                  >
                    <option value="" disabled>
                      Choose category
                    </option>
                    {state.analysis.categories.map((c) => (
                      <option key={c.category}>{c.category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Monthly reduction ($)
                  <input
                    aria-label="Scenario monthly reduction"
                    type="number"
                    min="0"
                    step="0.01"
                    value={reduction}
                    onChange={(e) => setReduction(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
                <button disabled={disabled}>Apply scenario</button>
              </form>
              <div className="finance-assumptions">
                {Object.entries(state.reductions).length ? (
                  Object.entries(state.reductions).map(([name, cents]) => (
                    <span key={name}>
                      {name}: −{dollars(cents)}
                    </span>
                  ))
                ) : (
                  <span>No reductions assumed</span>
                )}
              </div>
              <p className="finance-small">
                Hypothetical reductions are plans, not achieved savings.
              </p>
            </article>
            <article className="finance-card">
              <div className="finance-card-title">
                <h3>Check a payment before committing</h3>
                <span className="finance-badge">YOUR ASSUMPTIONS</span>
              </div>
              <form
                className="finance-loan-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(
                    `Check a $${amount} loan at ${apr}% APR over ${months} months with a $${limit} limit`,
                  );
                }}
              >
                <label>
                  Amount ($)
                  <input
                    aria-label="Payment amount"
                    type="number"
                    min="1"
                    max="1000000"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
                <label>
                  APR (%)
                  <input
                    aria-label="Payment APR"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={apr}
                    onChange={(e) => setApr(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
                <label>
                  Term (months)
                  <input
                    aria-label="Payment term"
                    type="number"
                    min="1"
                    max="360"
                    step="1"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
                <label>
                  Your monthly limit ($)
                  <input
                    aria-label="Payment monthly limit"
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
                <button disabled={disabled}>Check payment</button>
              </form>
              {state.loan && (
                <div
                  className={`finance-payment-result ${state.loan.withinLimit ? 'fits' : 'over'}`}
                  role="status"
                >
                  <strong>
                    {dollars(state.loan.payment)}
                    <small> / month</small>
                  </strong>
                  <p>
                    {state.loan.withinLimit
                      ? 'Within your limit and scenario cash flow'
                      : state.loan.payment > state.loan.limit
                        ? `${dollars(state.loan.payment - state.loan.limit)} above your monthly limit`
                        : 'Above your scenario cash flow'}
                  </p>
                  <span>
                    {dollars(state.loan.interest)} estimated interest · {state.loan.months} months ·{' '}
                    {state.loan.apr}% APR
                  </span>
                </div>
              )}
              <p className="finance-small">
                Fixed-rate estimate, excluding fees. No lender offer or eligibility decision.
              </p>
            </article>
          </div>
          <article className="finance-next">
            <div>
              <span className="finance-kicker">FROM UNDERSTANDING TO ACTION</span>
              <h3>Take your plan with you.</h3>
              <p>
                Export an editable Excel workbook, make a presentation, or explore local
                energy-efficiency assistance.
              </p>
            </div>
            <div className="finance-next-buttons">
              <button
                disabled={disabled}
                onClick={() => ask('Export and open my finance Excel workbook')}
              >
                Open plan in Excel <ArrowUpRight size={15} aria-hidden="true" />
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  ask('Create a four-slide PowerPoint about my finance budget results')
                }
              >
                Make slides
              </button>
              <button disabled={disabled} onClick={() => ask('Open community energy assistance')}>
                Local assistance
              </button>
            </div>
          </article>
          {state.export && (
            <div className="finance-export">
              <FileSpreadsheet size={20} aria-hidden="true" />
              <span>
                <strong>Excel workbook ready</strong>
                <small>{state.export.filename}</small>
              </span>
              <a href="/api/computer/finance/export" download>
                Download workbook
              </a>
            </div>
          )}
          <footer className="finance-footnote">
            <span>
              Calculated from {state.transactions.length} records. Categories come from the source
              file. Months may contain partial records.
            </span>
            <button
              disabled={disabled}
              onClick={() =>
                databricksReady ? ask('Analyze my finance with Databricks') : settings?.()
              }
            >
              {databricksReady ? 'Run on Databricks' : 'Connect Databricks'}
            </button>
            {state.queryReference && <code>{state.queryReference}</code>}
            {state.narrativeProvider === 'hugging-face' && (
              <span>Latest voice intent interpreted by Hugging Face</span>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
