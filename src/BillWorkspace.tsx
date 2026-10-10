import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Check,
  CheckCheck,
  FileText,
  FolderSearch,
  Leaf,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type { ComputerState } from '../shared/computer';
import {
  billFields,
  billLabels,
  checkBillValues,
  type BillValues,
  type BillDocument,
} from '../shared/bills';
import { energyProgramUrl } from '../shared/energy';
import EnergyPanel from './EnergyPanel';
import './bills.css';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const monthLabel = (s?: string) =>
  s
    ? new Date(`${s}-02T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Month to review';

function BillReview({
  document,
  disabled,
  confirm,
}: {
  document: BillDocument;
  disabled: boolean;
  confirm: (id: string, values: BillValues) => void;
}) {
  const [draft, setDraft] = useState<Partial<BillValues>>(document.values);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setDraft(document.values);
    setMessage('');
  }, [document]);
  const errors = checkBillValues(draft);
  return (
    <div className="bill-review" aria-label="Review bill numbers">
      <div className="bill-card-heading">
        <div>
          <span className="bill-overline">
            {document.confirmed ? 'SOURCE DOCUMENT' : 'CHECK THE NUMBERS'}
          </span>
          <h3>{monthLabel(document.values.month)}</h3>
        </div>
        <span className={`bill-status ${document.confirmed ? 'confirmed' : ''}`}>
          <ShieldCheck size={13} aria-hidden="true" />
          {document.confirmed ? 'Confirmed by you' : 'Needs your review'}
        </span>
      </div>
      <p className="bill-review-intro">
        {document.filename} {document.synthetic && <strong>· Synthetic sample</strong>}
      </p>
      {!!document.correctedFields?.length && (
        <p className="bill-note">
          Your corrections: {document.correctedFields.map((field) => billLabels[field]).join(', ')}.
          Quotes below retain the original document text.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const problems = checkBillValues(draft);
          if (problems.length) setMessage(problems.join(' '));
          else confirm(document.id, draft as BillValues);
        }}
      >
        <div className="bill-field-grid">
          {billFields.map((field) => (
            <label key={field}>
              <span>{billLabels[field]}</span>
              <input
                aria-label={billLabels[field]}
                type={field === 'month' ? 'month' : 'number'}
                step={field === 'days' ? 1 : field === 'month' ? undefined : 'any'}
                min={field === 'month' ? undefined : 0}
                max={field === 'days' ? 366 : field === 'month' ? undefined : 1000000}
                value={draft[field] ?? ''}
                disabled={disabled}
                required
                onChange={(event) =>
                  setDraft((old) => ({
                    ...old,
                    [field]:
                      field === 'month'
                        ? event.target.value
                        : event.target.value === ''
                          ? undefined
                          : Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        {(message || errors.length > 0) && (
          <p className="bill-warning" role="status">
            {message || errors[0]}
          </p>
        )}
        {document.warnings
          .filter((w) => w.startsWith('Image') || w.startsWith('AI'))
          .map((w) => (
            <p className="bill-note" key={w}>
              {w}
            </p>
          ))}
        <div className="bill-review-footer">
          <span>
            <AudioLines size={15} aria-hidden="true" /> Say “confirm this bill” or “usage is 1200”
          </span>
          <button className="bill-primary" type="submit" disabled={disabled || errors.length > 0}>
            <Check size={16} aria-hidden="true" />
            {document.confirmed ? 'Update confirmed numbers' : 'Confirm bill numbers'}
          </button>
        </div>
      </form>
      <details className="bill-evidence">
        <summary>Where these numbers came from</summary>
        <ul>
          {document.evidence.map((e, i) => (
            <li key={i}>
              <strong>
                {billLabels[e.field]} · page {e.page}
              </strong>
              <q>{e.quote}</q>
            </li>
          ))}
        </ul>
        <p>
          {document.provider === 'hugging-face'
            ? 'Extracted with an open model through Hugging Face. Your review confirms the inputs.'
            : 'Extracted from labeled PDF text. Your review confirms the inputs.'}
        </p>
      </details>
    </div>
  );
}

export default function BillWorkspace({
  state,
  disabled,
  busy,
  ask,
  importFiles,
  confirm,
  settings,
  databricksReady,
}: {
  state: ComputerState;
  disabled: boolean;
  busy: boolean;
  ask: (text: string) => void;
  importFiles: (files: File[]) => void;
  confirm: (id: string, values: BillValues) => void;
  settings: () => void;
  databricksReady?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const workspace = state.bills;
  const documents = workspace?.documents ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  useEffect(() => {
    if (workspace?.reviewId) setSelectedId(workspace.reviewId);
    else if (documents.length && !documents.some((d) => d.id === selectedId))
      setSelectedId(documents.at(-1)!.id);
  }, [workspace?.reviewId, documents.length]);
  const selected = documents.find((d) => d.id === selectedId) ?? documents[0];
  const energy = state.energy,
    ready = !!energy;
  useEffect(() => {
    if (ready) setReviewExpanded(false);
  }, [ready]);
  const confirmed = documents.filter((d) => d.confirmed).length;
  const pending = workspace?.pendingReadIds ?? [];
  const steps = ['Choose bills', 'Check numbers', 'Understand changes', 'Take action'];
  const stage = ready ? (energy.budget !== null ? 3 : 2) : documents.length ? 1 : 0;
  const reviewing = documents.find((doc) => doc.id === workspace?.reviewId);
  const nextWords = pending.length
    ? 'Yes.'
    : reviewing
      ? 'Confirm this bill.'
      : !ready
        ? 'Read sample PDF bills.'
        : databricksReady && energy.provider !== 'databricks'
          ? 'Analyze my energy bills using Databricks.'
          : energy.budget === null
            ? 'I can afford sixty dollars a month.'
            : energy.applicationVerified
              ? 'Read the application back.'
              : 'Compare my options.';
  return (
    <section className="bill-workspace" aria-label="Accessible bill workspace">
      <div className="bill-top">
        <div>
          <div className="bill-overline">
            <ScanLine size={15} aria-hidden="true" /> INSIGHT / HOME & ENERGY
          </div>
          <h2>Your bills, understood.</h2>
          <p>Read the numbers. Understand the change. Make your next move.</p>
        </div>
        <div className="bill-voice-pill">
          <AudioLines size={17} aria-hidden="true" />
          <span>Every step, by voice</span>
        </div>
      </div>
      <ol className="bill-progress" aria-label="Bill workflow progress">
        {steps.map((step, index) => (
          <li
            key={step}
            className={index === stage ? 'current' : index < stage ? 'done' : ''}
            aria-current={index === stage ? 'step' : undefined}
          >
            <span>{index < stage ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <details className="bill-voice-guide">
        <summary>
          <AudioLines size={16} aria-hidden="true" /> What can I say next?
        </summary>
        <div>
          <span className="bill-overline">YOUR NEXT STEP</span>
          <p className="bill-guide-command">“{nextWords}”</p>
          {reviewing && (
            <p>
              Review {monthLabel(reviewing.values.month)} before confirming. You can correct a
              number instead.
            </p>
          )}
          <p>
            Press Play once to start talking. Speak again to interrupt a reply; pause ends the
            conversation.
          </p>
          <ol>
            <li>
              <strong>Find and read:</strong> “Read sample PDF bills,” then “yes.”
            </li>
            <li>
              <strong>Check both:</strong> “Confirm this bill” for each document.
            </li>
            <li>
              <strong>Understand:</strong> “Explain why my electricity bill changed.”
            </li>
            <li>
              <strong>Set your limit:</strong> “I can afford sixty dollars a month.”
            </li>
            <li>
              <strong>Change your mind:</strong> “Wait, I can only afford thirty dollars a month.”
            </li>
            <li>
              <strong>Take a real next step:</strong> “Open the real OUC energy program.”
            </li>
          </ol>
          <p>
            Sample bills and improvement quotes are fictional. Practice application fields are
            checked before your review; nothing is submitted.
          </p>
        </div>
      </details>
      <div className="bill-toolbar">
        <button
          className="bill-primary"
          disabled={disabled}
          onClick={() => picker.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          Choose bills
        </button>
        <button
          disabled={disabled}
          onClick={() => ask('Find my latest two electricity bills in Downloads')}
        >
          <FolderSearch size={16} aria-hidden="true" />
          Find in Downloads
        </button>
        <button disabled={disabled} onClick={() => ask('Read sample PDF bills')}>
          <FileText size={16} aria-hidden="true" />
          Try sample PDFs
        </button>
        {documents.length > 0 && (
          <button
            className="bill-clear"
            disabled={disabled}
            onClick={() => ask('Clear bill documents')}
          >
            <X size={15} aria-hidden="true" />
            Clear
          </button>
        )}
        <input
          ref={picker}
          className="bill-file-input"
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg"
          aria-label="Import electricity bill PDFs or images"
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) importFiles(files);
          }}
        />
      </div>
      {busy && (
        <p className="bill-loading" role="status">
          <LoaderCircle size={16} aria-hidden="true" />
          Reading your request…
        </p>
      )}
      {!!pending.length && (
        <div className="bill-found" role="status">
          <div>
            <span className="bill-overline">FOUND IN {workspace?.location?.toUpperCase()}</span>
            <h3>Ready when you are.</h3>
            <p>
              {workspace?.candidates
                .filter((c) => pending.includes(c.id))
                .map((c) => c.filename)
                .join(' + ')}
            </p>
            <small>
              Say “yes” to read these files. Scanned bills are sent to the connected vision model.
            </small>
          </div>
          <button className="bill-primary" disabled={disabled} onClick={() => ask('Read both')}>
            <ScanLine size={16} aria-hidden="true" />
            Read {pending.length > 1 ? 'both bills' : 'this bill'}
          </button>
        </div>
      )}
      {!documents.length && !energy && (
        <div className="bill-empty">
          <div className="bill-empty-copy">
            <span className="bill-overline">A LITTLE CLARITY GOES A LONG WAY</span>
            <h3>
              “Why is my bill
              <br />
              higher this month?”
            </h3>
            <p>
              Start with two electricity bills. Insight reads each document, checks the totals with
              you, and breaks down what changed.
            </p>
            <div className="bill-speech-example">
              <AudioLines size={18} aria-hidden="true" />
              <span>“Read my latest electricity bills in Downloads.”</span>
            </div>
            <div className="bill-empty-notes">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                PDF or image · up to 5 MB each
                <br />
                You confirm the numbers before comparison.
              </span>
            </div>
          </div>
          <div className="bill-paper-art" aria-hidden="true">
            <div className="bill-paper-back" />
            <div className="bill-paper">
              <div className="bill-paper-logo">
                <ScanLine size={24} />
                <span>ELECTRICITY STATEMENT</span>
              </div>
              <div className="bill-paper-line long" />
              <div className="bill-paper-line" />
              <div className="bill-paper-total">
                $240<span>Current charges</span>
              </div>
              <div className="bill-paper-row">
                <span>Energy used</span>
                <strong>1,200 kWh</strong>
              </div>
              <div className="bill-paper-row">
                <span>Billing days</span>
                <strong>30 days</strong>
              </div>
              <div className="bill-paper-stamp">
                <CheckCheck size={16} />
                Made understandable
              </div>
              <small>Synthetic preview</small>
            </div>
            <div className="bill-paper-bubble">
              <AudioLines size={19} />
              Let’s look at what changed.
            </div>
          </div>
        </div>
      )}
      {documents.length > 0 && (
        <>
          <div className="bill-documents" aria-label="Your bill documents">
            {documents.map((doc) => (
              <button
                key={doc.id}
                disabled={busy}
                className={selected?.id === doc.id ? 'selected' : ''}
                aria-pressed={selected?.id === doc.id}
                onClick={() => {
                  setSelectedId(doc.id);
                  setReviewExpanded(true);
                }}
              >
                <span className="bill-doc-icon">
                  <FileText size={21} aria-hidden="true" />
                </span>
                <span>
                  <strong>{monthLabel(doc.values.month)}</strong>
                  <small>
                    {doc.synthetic ? 'Sample PDF' : 'Imported document'} ·{' '}
                    {doc.confirmed ? 'Confirmed' : 'Review needed'}
                  </small>
                </span>
                <span className="bill-doc-value">
                  {doc.values.total === undefined ? '—' : usd(doc.values.total)}
                  {doc.confirmed && <Check size={14} aria-label="Confirmed" />}
                </span>
              </button>
            ))}
          </div>
          <details
            className="bill-source-details"
            open={!ready || reviewExpanded}
            onToggle={(event) => setReviewExpanded(event.currentTarget.open)}
          >
            <summary>
              <ShieldCheck size={16} aria-hidden="true" />
              {ready
                ? 'Review confirmed numbers and original documents'
                : 'Check each bill before we compare'}
            </summary>
            <div className="bill-review-layout">
              {selected && (
                <BillReview
                  key={selected.id}
                  document={selected}
                  disabled={disabled}
                  confirm={confirm}
                />
              )}
              <aside className="bill-source-preview" aria-label="Bill document preview">
                <div className="bill-card-heading">
                  <span className="bill-overline">ORIGINAL DOCUMENT</span>
                  <span>Page 1</span>
                </div>
                {selected?.preview ? (
                  <img
                    src={selected.preview}
                    alt={`First page of ${selected.filename}; extracted values and source quotes are available in the review form.`}
                  />
                ) : (
                  <div className="bill-no-preview">
                    <FileText size={40} aria-hidden="true" />
                    <p>Source preview appears here.</p>
                  </div>
                )}
              </aside>
            </div>
          </details>
          {!ready && (
            <p className="bill-note bill-confirm-count" role="status">
              <ShieldCheck size={16} aria-hidden="true" />
              {confirmed} of {documents.length} documents confirmed.{' '}
              {documents.length < 2
                ? 'Add another month to compare.'
                : 'Confirm every document to unlock the comparison.'}
            </p>
          )}
        </>
      )}
      {ready && (
        <>
          <div className="bill-insight">
            <div>
              <span className="bill-overline">THE CHANGE, EXPLAINED</span>
              <p className="bill-verification">
                <ShieldCheck size={14} aria-hidden="true" />
                {energy.provider === 'databricks'
                  ? 'Verified with Databricks SQL'
                  : 'Your confirmed numbers · calculated locally'}
              </p>
              <h3>
                Your bill {energy.comparison.billChange >= 0 ? 'rose' : 'fell'}{' '}
                {usd(Math.abs(energy.comparison.billChange))}.
              </h3>
              <p>
                From {usd(energy.comparison.previousBill)} to {usd(energy.comparison.currentBill)}.
                Here is how the current charges changed.
              </p>
              <div className="bill-effects">
                {[
                  [
                    'Usage',
                    energy.comparison.usageEffect,
                    'Change in kWh, at the previous effective rate',
                  ],
                  [
                    'Effective rate',
                    energy.comparison.rateEffect,
                    'Change in energy charges per kWh',
                  ],
                  [
                    'Other charges',
                    energy.comparison.otherEffect,
                    'Change in remaining current charges',
                  ],
                ].map(([label, value, note]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <strong>
                      {Number(value) > 0 ? '+' : ''}
                      {usd(Number(value))}
                    </strong>
                    <small>{note}</small>
                  </div>
                ))}
              </div>
              <p className="bill-note">
                Daily usage: {energy.comparison.previousDailyKwh} →{' '}
                {energy.comparison.currentDailyKwh} kWh. Bills alone cannot identify the appliance
                responsible.
              </p>
              <button
                disabled={disabled}
                onClick={() => ask('Explain why my electricity bill changed')}
              >
                <AudioLines size={15} aria-hidden="true" />
                Explain this aloud
              </button>
            </div>
            <div
              className="bill-usage-chart"
              role="img"
              aria-label={`Latest two bills: ${energy.comparison.previousBill} dollars and ${energy.comparison.currentBill} dollars. Usage: ${energy.comparison.previousDailyKwh} and ${energy.comparison.currentDailyKwh} kilowatt-hours per day.`}
            >
              <span className="bill-overline">CURRENT CHARGES / USD</span>
              <div className="bill-bars">
                {[...energy.bills]
                  .sort((a, b) => a.month.localeCompare(b.month))
                  .slice(-2)
                  .map((bill, index, all) => (
                    <div key={bill.month}>
                      <strong>{usd(bill.energyCharge + bill.otherCharges)}</strong>
                      <div
                        className={`bill-bar ${index === 1 ? 'latest' : ''}`}
                        style={{
                          height: `${Math.max(5, ((bill.energyCharge + bill.otherCharges) / Math.max(...all.map((b) => b.energyCharge + b.otherCharges), 1)) * 140)}px`,
                        }}
                      />
                      <span>{monthLabel(bill.month).split(' ')[0]}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <div className="bill-next">
            <span className="bill-next-icon">
              <Leaf size={23} aria-hidden="true" />
            </span>
            <div>
              <span className="bill-overline">MAKE THE NEXT STEP YOURS</span>
              <h3>A plan that fits your household.</h3>
              <p>
                Compare clearly labeled sample improvements, or open real local conservation-program
                information.
              </p>
            </div>
            <ArrowDown size={21} aria-hidden="true" />
          </div>
          <div className="bill-program">
            <div>
              <span className="bill-overline">A REAL LOCAL STARTING POINT / ORLANDO</span>
              <h3>Start with a free home conservation audit.</h3>
              <p>
                OUC’s Efficiency Delivered program begins with an audit to identify useful
                improvements. OUC determines eligibility and actual costs; the sample quotes below
                are separate.
              </p>
              <a href={energyProgramUrl} target="_blank" rel="noreferrer">
                Source: OUC · checked October 10, 2026 ↗
              </a>
            </div>
            <button disabled={disabled} onClick={() => ask('Open the real OUC energy program')}>
              <ArrowRight size={16} aria-hidden="true" />
              Open program
            </button>
          </div>
          <EnergyPanel state={energy} disabled={disabled} ask={ask} />
          <div className="bill-cloud-row">
            <span>
              <ShieldCheck size={15} aria-hidden="true" />
              {energy.provider === 'databricks'
                ? energy.queryReference
                : 'Calculations checked locally against your confirmed numbers'}
            </span>
            <button
              disabled={disabled}
              onClick={() =>
                databricksReady ? ask('Analyze my energy bills using Databricks') : settings()
              }
            >
              {databricksReady ? 'Verify with Databricks' : 'Connect Databricks'}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
