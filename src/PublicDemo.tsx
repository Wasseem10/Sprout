import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  CircleHelp,
  FileText,
  Github,
  Leaf,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { billFields, billLabels, checkBillValues, type BillValues } from '../shared/bills';
import { energyProgramUrl, type EnergyState } from '../shared/energy';
import {
  billNarration,
  compareBills,
  money,
  newEnergyState,
  recalculate,
  syntheticBills,
} from '../shared/energy-calculations';
import './public-demo.css';

const repository = 'https://github.com/Wasseem10/insightos';
const initial = () => {
  const s = newEnergyState();
  s.budget = 60;
  s.selected = 'ducts';
  return recalculate(s);
};
const initialBills = (): BillValues[] =>
  syntheticBills.map((b) => ({ ...b, total: b.energyCharge + b.otherCharges }));
const month = (s: string) =>
  new Date(`${s}-02T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function PublicDemo() {
  const [state, setState] = useState<EnergyState>(initial);
  const [bills, setBills] = useState<BillValues[]>(initialBills);
  const [drafts, setDrafts] = useState<BillValues[]>(initialBills);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [message, setMessage] = useState(
    'Your bill rose by $45. Explore the numbers, then change your budget.',
  );
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [name, setName] = useState('Alex Sample');
  const [ownership, setOwnership] = useState('homeowner');
  const form = useRef<HTMLFormElement>(null);
  const applicationHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const selected = state.quotes.find((q) => q.id === state.selected)!;
  const aboveBudget = selected.fitsBudget === false;
  const c = state.comparison;
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    if (applicationOpen) applicationHeading.current?.focus();
  }, [applicationOpen]);
  useEffect(() => {
    if (reviewOpen) reviewHeading.current?.focus();
  }, [reviewOpen]);

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }
  function speak(text: string) {
    stopSpeech();
    setMessage(text);
    if (!('speechSynthesis' in window)) {
      setError('Speech is unavailable in this browser. The complete explanation is shown below.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  function updateBudget(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 10000) {
      setError('Enter a monthly limit between $0 and $10,000.');
      return;
    }
    const next = recalculate({ ...state, budget: value });
    setState(next);
    setReviewed(false);
    setError('');
    const choice = next.quotes.find((q) => q.id === next.selected)!;
    setMessage(
      choice.fitsBudget
        ? `Your payment limit is now ${money(value)} a month. ${choice.name} still fits at ${money(choice.payment)}. Review the updated practice application before continuing.`
        : `Your payment limit is now ${money(value)} a month. ${choice.name} costs ${money(choice.payment)}, which is above your limit. Your answers are kept. Choose an affordable option to continue.`,
    );
  }
  function choose(id: string) {
    const q = state.quotes.find((q) => q.id === id);
    if (!q) return;
    setState(recalculate({ ...state, selected: id as EnergyState['selected'] }));
    setReviewed(false);
    setError('');
    setMessage(
      `${q.name} selected at ${money(q.payment)} a month. ${q.fitsBudget ? 'It fits your limit. You can prepare the practice application.' : 'It is above your limit. Choose another option before preparing the practice application.'}`,
    );
  }
  function prepare() {
    if (aboveBudget) {
      setError('Choose an option within your payment limit first.');
      return;
    }
    setApplicationOpen(true);
    setReviewed(false);
    setMessage(
      'Your practice application is prepared below. Check the details or have me read them back. Nothing will be submitted.',
    );
  }
  function reviewApplication() {
    if (!form.current?.reportValidity() || aboveBudget) return;
    const data = new FormData(form.current!);
    if (
      data.get('option') !== selected.name ||
      data.get('payment') !== money(selected.payment) ||
      data.get('limit') !== money(state.budget!)
    ) {
      setError('The practice form does not match your current choice. Prepare it again.');
      return;
    }
    setReviewed(true);
    speak(
      `Practice application for ${name}, ${ownership}. ${selected.name}, ${money(selected.payment)} per month for ${selected.months} months at ${selected.apr} percent assumed interest. Your monthly limit is ${money(state.budget!)}. These are fictional quotes. Nothing has been submitted.`,
    );
  }
  function run(text: string) {
    stopSpeech();
    setError('');
    setCommand('');
    const normalized = text.toLowerCase().trim();
    const amount = normalized.match(/\d+(?:\.\d{1,2})?/);
    const words = normalized.match(/\b(thirty|sixty|twenty five|twenty-five)\b/);
    if (/budget|afford|limit/.test(normalized) && (amount || words))
      updateBudget(
        amount
          ? Number(amount[0])
          : { thirty: 30, sixty: 60, 'twenty five': 25, 'twenty-five': 25 }[words![1]]!,
      );
    else if (/weather|sealing/.test(normalized)) choose('sealing');
    else if (/duct/.test(normalized)) choose('ducts');
    else if (/thermostat/.test(normalized)) choose('thermostat');
    else if (/application/.test(normalized) && /read|review/.test(normalized) && applicationOpen)
      reviewApplication();
    else if (/application/.test(normalized)) prepare();
    else if (/bill|why|explain|read/.test(normalized)) speak(billNarration(state));
    else
      setMessage(
        'Try “explain my bill,” “my budget is 30,” “choose weather sealing,” or “prepare my application.” This public sample supports these preset actions; open-ended AI conversation runs in the desktop app.',
      );
  }
  function applyBillCorrections() {
    const problems = drafts.flatMap(checkBillValues);
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    try {
      const comparison = compareBills(drafts.map(({ total: _total, ...bill }) => bill));
      setState(
        recalculate({
          ...state,
          bills: drafts.map(({ total: _total, ...bill }) => bill),
          comparison,
          sourceName: 'Public sample · reviewed bill values',
        }),
      );
      setBills(drafts.map((b) => ({ ...b })));
      setReviewOpen(false);
      setReviewed(false);
      setError('');
      setMessage(
        `Your corrections are applied. The bill changed by ${money(comparison.billChange)}. All quotes were recalculated; review any practice application again.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message.replace('Computer ', '') : 'Check the billing inputs.',
      );
    }
  }
  function reset() {
    stopSpeech();
    setState(initial());
    setBills(initialBills());
    setDrafts(initialBills());
    setReviewOpen(false);
    setApplicationOpen(false);
    setReviewed(false);
    setName('Alex Sample');
    setOwnership('homeowner');
    setError('');
    setMessage(
      'Sample reset. Your bill rose by $45. Explore the numbers, then change your budget.',
    );
  }
  function download() {
    const file = new Blob(
      [
        JSON.stringify(
          {
            sample: true,
            calculatedIn: 'browser',
            bills,
            budget: state.budget,
            selected,
            applicant: applicationOpen ? { name, ownership } : null,
            submitted: false,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'insightos-sample-plan.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={`public-demo ${largeText ? 'public-large' : ''}`}>
      <a className="public-skip" href="#public-main">
        Skip to bill analysis
      </a>
      <header className="public-nav">
        <a className="public-logo" href="/" aria-label="InsightOS home">
          <span className="public-mark">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          Insight<span>OS</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href={repository} target="_blank" rel="noreferrer">
            <Github size={16} aria-hidden="true" /> Source code
          </a>
          <button
            aria-label="Large text"
            aria-pressed={largeText}
            onClick={() => setLargeText(!largeText)}
          >
            Aa <span>Large text</span>
          </button>
        </nav>
      </header>
      <main id="public-main">
        <section className="public-hero">
          <div>
            <p className="public-eyebrow">
              <span /> FINANCIAL INDEPENDENCE, WITHIN REACH
            </p>
            <h1>
              Your finances are personal.
              <br />
              <span>Understanding them should be, too.</span>
            </h1>
            <p className="public-intro">
              A desktop companion built to help blind and low-vision people understand bills,
              explore affordable choices, and take the next step through conversation.
            </p>
          </div>
          <div className="public-mode">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <strong>Interactive public sample</strong>
              <p>Fictional bills and quotes. Calculations run in your browser.</p>
              <a href={`${repository}#run-the-desktop-app`}>
                Get the full desktop companion <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <div className="public-grid">
          <div className="public-workspace">
            <section className="public-card public-analysis" aria-labelledby="bill-title">
              <div className="public-card-top">
                <div>
                  <p className="public-eyebrow">01 / UNDERSTAND THE BILL</p>
                  <h2 id="bill-title">What changed this month?</h2>
                </div>
                <span className="public-chip">Sample household · Orlando</span>
              </div>
              <div className="public-big-number">
                <strong>{money(c.currentBill)}</strong>
                <span>
                  {money(c.billChange)} change from {month(state.bills[0].month)}
                </span>
              </div>
              <div
                className="public-bill-bars"
                role="img"
                aria-label={`Previous bill ${money(c.previousBill)}. Latest bill ${money(c.currentBill)}. Change ${money(c.billChange)}.`}
              >
                {[c.previousBill, c.currentBill].map((amount, i) => (
                  <div key={i}>
                    <span>{month(state.bills[i].month)}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(4, (amount / Math.max(c.previousBill, c.currentBill, 1)) * 100)}%`,
                        }}
                        className={i ? 'latest' : ''}
                      />
                    </div>
                    <strong>{money(amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="public-breakdown">
                {[
                  ['Usage', c.usageEffect],
                  ['Effective rate', c.rateEffect],
                  ['Other charges', c.otherEffect],
                ].map(([label, amount]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <strong>{money(Number(amount))}</strong>
                  </div>
                ))}
              </div>
              <p className="public-insight">
                <Sparkles size={17} aria-hidden="true" />
                Usage changed from {c.previousDailyKwh} to {c.currentDailyKwh} kWh/day. This
                comparison does not identify the appliance responsible.
              </p>
              <div className="public-card-actions">
                <button
                  onClick={() => {
                    setDrafts(bills.map((b) => ({ ...b })));
                    setReviewOpen(!reviewOpen);
                    setError('');
                  }}
                >
                  <FileText size={16} aria-hidden="true" />
                  {reviewOpen ? 'Close bill review' : 'Review or correct bill inputs'}
                </button>
                <button onClick={() => speak(billNarration(state))}>
                  <Volume2 size={16} aria-hidden="true" />
                  Read explanation
                </button>
              </div>
              {reviewOpen && (
                <section className="public-bill-review" aria-label="Bill input review">
                  <h3 tabIndex={-1} ref={reviewHeading}>
                    Check the original numbers
                  </h3>
                  <p>
                    Values are preloaded from the two synthetic PDFs. Edit and confirm to
                    recalculate. This browser sample does not extract uploaded documents with AI.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyBillCorrections();
                    }}
                  >
                    <div className="public-review-grid">
                      {drafts.map((bill, i) => (
                        <fieldset key={i}>
                          <legend>Sample bill {i + 1}</legend>
                          {billFields.map((field) => (
                            <label key={field}>
                              {billLabels[field]}
                              <input
                                aria-label={`Bill ${i + 1}: ${billLabels[field]}`}
                                type={field === 'month' ? 'month' : 'number'}
                                min={field === 'days' ? 1 : field === 'month' ? undefined : 0}
                                step={
                                  field === 'days' || field === 'kwh'
                                    ? 1
                                    : field === 'month'
                                      ? undefined
                                      : '0.01'
                                }
                                required
                                value={bill[field]}
                                onChange={(e) => {
                                  setDrafts((old) =>
                                    old.map((b, index) =>
                                      index === i
                                        ? {
                                            ...b,
                                            [field]:
                                              field === 'month'
                                                ? e.target.value
                                                : e.target.value === ''
                                                  ? NaN
                                                  : Number(e.target.value),
                                          }
                                        : b,
                                    ),
                                  );
                                }}
                              />{' '}
                            </label>
                          ))}
                          <a
                            href={`/samples/insight-sample-electricity-2026-${i ? '09' : '08'}.pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open original sample PDF ↗
                          </a>
                        </fieldset>
                      ))}
                    </div>
                    <button className="public-primary" type="submit">
                      <Check size={16} aria-hidden="true" />
                      Confirm numbers and recalculate
                    </button>
                  </form>
                </section>
              )}
            </section>
            <section className="public-card" aria-labelledby="choices-title">
              <div className="public-card-top">
                <div>
                  <p className="public-eyebrow">02 / MAKE YOUR OWN CHOICE</p>
                  <h2 id="choices-title">A plan that fits your life.</h2>
                </div>
                <Leaf size={22} aria-hidden="true" />
              </div>
              <div className="public-budget">
                <label htmlFor="public-budget">My monthly payment limit</label>
                <div>
                  <span>$</span>
                  <input
                    id="public-budget"
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    value={state.budget ?? ''}
                    onChange={(e) => updateBudget(Number(e.target.value))}
                  />
                  <span>/ month</span>
                </div>
              </div>
              {aboveBudget && (
                <div className="public-warning" role="status">
                  <strong>Your selected option is above your limit.</strong>
                  <p>
                    {selected.name} costs {money(selected.payment)}/month. Your limit is{' '}
                    {money(state.budget!)}. Existing answers are kept; choose an affordable option
                    before continuing.
                  </p>
                </div>
              )}
              <div className="public-options" role="group" aria-label="Choose a sample improvement">
                {state.quotes.map((q) => (
                  <button
                    key={q.id}
                    className={`public-option ${state.selected === q.id ? 'selected' : ''}`}
                    aria-pressed={state.selected === q.id}
                    onClick={() => choose(q.id)}
                  >
                    <span className="public-option-title">
                      {q.name}
                      {state.selected === q.id && <Check size={16} aria-hidden="true" />}
                    </span>
                    <strong>
                      {money(q.payment)}
                      <small>/mo</small>
                    </strong>
                    <span className={q.fitsBudget ? 'public-fit' : 'public-over'}>
                      {q.fitsBudget ? 'Within your limit' : 'Above your limit'}
                    </span>
                    <span>{q.annualKwh.toLocaleString()} kWh/year estimated reduction</span>
                  </button>
                ))}
              </div>
              <p className="public-fineprint">
                Fictional contractor quotes · 24 months · 0% assumed interest. Savings and rebates
                are hypothetical, not achieved impact or approved financing.
              </p>
              <div className="public-card-actions">
                <button className="public-primary" disabled={aboveBudget} onClick={prepare}>
                  Prepare practice application <ArrowRight size={16} aria-hidden="true" />
                </button>
                <button onClick={download}>
                  <ArrowDownToLine size={16} aria-hidden="true" />
                  Save sample plan
                </button>
              </div>
            </section>
            {applicationOpen && (
              <section
                className="public-card public-application"
                aria-labelledby="application-title"
              >
                <p className="public-eyebrow">03 / REVIEW THE NEXT STEP</p>
                <h2 id="application-title" tabIndex={-1} ref={applicationHeading}>
                  Your choice. Your final say.
                </h2>
                <p>
                  This is a local practice form. It does not send an application to a lender,
                  contractor, or utility.
                </p>
                <form
                  ref={form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    reviewApplication();
                  }}
                >
                  <div className="public-review-grid">
                    <label>
                      Applicant name
                      <input
                        name="name"
                        required
                        maxLength={80}
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setReviewed(false);
                        }}
                      />
                    </label>
                    <label>
                      Home status
                      <select
                        name="ownership"
                        value={ownership}
                        onChange={(e) => {
                          setOwnership(e.target.value);
                          setReviewed(false);
                        }}
                      >
                        <option value="homeowner">Homeowner</option>
                        <option value="renter">Renter</option>
                      </select>
                    </label>
                    <label>
                      Chosen improvement
                      <input name="option" readOnly value={selected.name} />
                    </label>
                    <label>
                      Monthly payment
                      <input name="payment" readOnly value={money(selected.payment)} />
                    </label>
                    <label>
                      Monthly limit
                      <input name="limit" readOnly value={money(state.budget!)} />
                    </label>
                    <label>
                      Term and interest
                      <input
                        name="term"
                        readOnly
                        value={`${selected.months} months · ${selected.apr}% assumed APR`}
                      />
                    </label>
                  </div>
                  {aboveBudget ? (
                    <p className="public-warning">
                      Review paused: choose an affordable option above.
                    </p>
                  ) : (
                    <button className="public-primary" type="submit">
                      <Volume2 size={16} aria-hidden="true" />
                      Read application back
                    </button>
                  )}
                  {reviewed && (
                    <p className="public-reviewed" role="status">
                      <ShieldCheck size={17} aria-hidden="true" />
                      Current fields checked in this browser. Nothing submitted.
                    </p>
                  )}
                </form>
                <a
                  className="public-local-program"
                  href={energyProgramUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore OUC’s real efficiency program ↗
                  <span>OUC determines eligibility and actual costs.</span>
                </a>
              </section>
            )}
          </div>
          <aside className="public-companion" aria-label="Sample companion">
            <div className="public-companion-top">
              <span className="public-mini-mark">
                <Sparkles size={19} aria-hidden="true" />
              </span>
              <div>
                <strong>Insight</strong>
                <span>Here with you</span>
              </div>
              <span className="public-online" />
            </div>
            <div className={`public-orb ${speaking ? 'speaking' : ''}`} aria-hidden="true">
              <AudioLines size={45} />
            </div>
            <p className="public-companion-label">ONE QUESTION AT A TIME</p>
            <h2>
              Hear the numbers.
              <br />
              Make the decision.
            </h2>
            <div className="public-response" aria-live="polite">
              <span>INSIGHT</span>
              <p>{message}</p>
            </div>
            {error && (
              <p className="public-warning" role="alert">
                {error}
              </p>
            )}
            <form
              className="public-command"
              onSubmit={(e) => {
                e.preventDefault();
                if (command.trim()) run(command);
              }}
            >
              <label className="public-visually-hidden" htmlFor="sample-command">
                Type a sample command
              </label>
              <input
                id="sample-command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Try: my budget is 30"
                maxLength={160}
              />
              <button type="submit" aria-label="Run sample command">
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
            <div className="public-prompts">
              <button onClick={() => run('Explain my bill')}>Why did my bill go up?</button>
              <button onClick={() => run('My budget is 30')}>Wait, I can only afford $30.</button>
              <button onClick={() => run('Choose weather sealing')}>Choose weather sealing.</button>
            </div>
            <div className="public-companion-bottom">
              <button onClick={() => (speaking ? stopSpeech() : speak(message))}>
                <span className="public-play">
                  {speaking ? (
                    <Square size={13} aria-hidden="true" />
                  ) : (
                    <Volume2 size={18} aria-hidden="true" />
                  )}
                </span>
                {speaking ? 'Stop speaking' : 'Read reply aloud'}
              </button>
              <button aria-label="Reset sample workflow" onClick={reset}>
                <RotateCcw size={17} aria-hidden="true" />
              </button>
            </div>
            <p className="public-voice-note">
              This public sample uses browser speech and preset commands. The desktop companion uses
              Hugging Face, ElevenLabs, and Databricks for the live workflow.
            </p>
          </aside>
        </div>
        <section id="how-it-works" className="public-about">
          <p className="public-eyebrow">THE FULL DESKTOP COMPANION</p>
          <h2>Independence is the feature.</h2>
          <p>
            Read a bill. Challenge a number. Change your mind. InsightOS carries your corrections
            through the workflow, so the decision stays yours.
          </p>
          <div>
            <article>
              <FileText aria-hidden="true" />
              <h3>Grounded in the document</h3>
              <p>
                Hugging Face open models extract PDF and scanned bill fields. You confirm or correct
                the numbers against source evidence.
              </p>
            </article>
            <article>
              <ShieldCheck aria-hidden="true" />
              <h3>Numbers you can check</h3>
              <p>
                Databricks SQL verifies bill-change components against deterministic calculations
                before the desktop shows a verification badge.
              </p>
            </article>
            <article>
              <AudioLines aria-hidden="true" />
              <h3>A conversation you control</h3>
              <p>
                ElevenLabs powers the desktop voice loop. A changed budget invalidates an old
                application review while keeping your answers.
              </p>
            </article>
          </div>
          <a className="public-primary" href={`${repository}#run-the-desktop-app`}>
            Open the source and setup guide <Github size={17} aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer className="public-footer">
        <span>InsightOS · Built at Knight Hacks IX</span>
        <a href={`${repository}/blob/master/DEVPOST-DRAFT.md`}>
          <CircleHelp size={15} aria-hidden="true" />
          Project details and limitations
        </a>
        <span>Public sample · No cloud AI calls or uploads</span>
      </footer>
    </div>
  );
}
