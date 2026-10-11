import { useState } from 'react';
import {
  FileSpreadsheet,
  Presentation,
  RotateCcw,
  Upload,
  ArrowUpRight,
  Check,
  Database,
} from 'lucide-react';
import type { StudioState } from '../shared/studio';
import { includedStudioRows, studioMoney, studioPercent } from '../shared/studio';
import Chart from './Chart';
import './studio.css';

type Props = {
  state: StudioState | null;
  disabled: boolean;
  compact?: boolean;
  cloudReady?: boolean;
  ask: (request: string) => void;
  importFile?: (file: File) => void;
  workspace?: () => void;
};
export default function StudioPanel({
  state,
  disabled,
  compact,
  cloudReady,
  ask,
  importFile,
  workspace,
}: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const result = state?.workspace.result;
  if (!state || !result)
    return (
      <section className="studio" aria-label="Insight Studio">
        <div className="studio-intro">
          <span className="studio-kicker">YOUR DATA. YOUR DECISIONS.</span>
          <h2>Your work, within reach.</h2>
          <p>
            Explore a spreadsheet by conversation. Check the evidence, change the analysis, and
            create Excel and PowerPoint files from the same results.
          </p>
        </div>
        <div className="studio-start">
          <button
            className="studio-primary"
            disabled={disabled}
            onClick={() => ask('Start the analysis demo')}
          >
            <FileSpreadsheet size={19} /> Try sample analysis <ArrowUpRight size={17} />
          </button>
          {importFile && (
            <label className="studio-upload">
              <Upload size={17} /> Import CSV or Excel
              <input
                aria-label="Import studio CSV or Excel"
                type="file"
                accept=".csv,.xlsx"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importFile(file);
                  event.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        <p className="studio-help">
          Try: “Compare only the same locations.” Then: “Create an Excel and PowerPoint report.”
        </p>
        <details className="studio-format">
          <summary>Supported dataset format</summary>
          <p>
            Six columns: date, location_id, region, revenue, operating_start, operating_end. ISO
            dates, revenue in USD, blank operating_end for active locations. CSV or plain-value XLSX
            under 1 MB. The first populated Excel sheet contains the data.
          </p>
          <a href="/samples/operations-synthetic.csv" download>
            Download sample CSV
          </a>
        </details>
      </section>
    );
  const regions = result.regions.slice(0, state.workspace.view.topN ?? undefined);
  const rows = includedStudioRows(state);
  const sourceRows = focused ? rows.filter((row) => row.included && row.region === focused) : rows;
  const excluded = [...new Set(rows.filter((row) => !row.included).map((row) => row.location_id))];
  return (
    <section
      className={`studio ${compact ? 'studio-compact' : ''}`}
      aria-label={compact ? 'Studio result' : 'Insight Studio'}
    >
      <header className="studio-heading">
        <div>
          <span className="studio-kicker">
            {state.workspace.dataset?.synthetic
              ? 'FICTIONAL SAMPLE RECORDS'
              : 'YOUR IMPORTED RECORDS'}
          </span>
          <h2>{compact ? 'Your analysis, ready.' : 'Your work, within reach.'}</h2>
        </div>
        <span className="studio-revision">Revision {state.revision}</span>
      </header>
      {!compact && (
        <p className="studio-source">
          {state.workspace.dataset?.name}{' '}
          <span>{state.workspace.dataset?.rows.length} source records</span>
        </p>
      )}
      {!compact && importFile && (
        <div className="studio-start">
          <button
            className="studio-primary"
            disabled={disabled}
            onClick={() => ask('Start the analysis demo')}
          >
            <FileSpreadsheet size={19} /> Try sample analysis <ArrowUpRight size={17} />
          </button>
          <label className="studio-upload">
            <Upload size={17} /> Replace CSV or Excel
            <input
              aria-label="Import studio CSV or Excel"
              type="file"
              accept=".csv,.xlsx"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      <div className="studio-metrics">
        <div>
          <span>Previous revenue</span>
          <strong>{studioMoney(result.previousTotal)}</strong>
          <small>{result.comparison.previous.label}</small>
        </div>
        <div>
          <span>Current revenue</span>
          <strong>{studioMoney(result.currentTotal)}</strong>
          <small>{result.comparison.current.label}</small>
        </div>
        <div className="studio-growth">
          <span>Revenue growth</span>
          <strong>{studioPercent(result.percent)}</strong>
          <small>{result.includedLocations} locations included</small>
        </div>
      </div>
      <div className="studio-coverage">
        <div>
          <Check size={17} />
          <strong>
            {result.comparison.commonLocations
              ? 'Continuously operating locations'
              : 'All reported locations'}
          </strong>
        </div>
        <p>{state.lastChange}</p>
        <div className="studio-actions">
          <button
            disabled={disabled}
            aria-pressed={result.comparison.commonLocations}
            onClick={() =>
              ask(
                result.comparison.commonLocations
                  ? 'Include all locations in the studio analysis'
                  : 'Compare only the same locations',
              )
            }
          >
            {result.comparison.commonLocations ? 'Include all locations' : 'Compare same locations'}
          </button>
          <button
            disabled={disabled || !state.canUndo}
            onClick={() => ask('Undo the studio analysis change')}
          >
            <RotateCcw size={15} /> Undo
          </button>
          <button
            disabled={disabled}
            onClick={() => ask('Show the source rows and how you calculated the result')}
          >
            Show your work
          </button>
        </div>
      </div>
      {compact ? (
        <button className="studio-primary" onClick={workspace}>
          Open full analysis
        </button>
      ) : (
        <>
          <div className="studio-chart">
            <div className="studio-section-heading">
              <h3>Revenue by region</h3>
              <span>
                {result.comparison.previous.label} / {result.comparison.current.label}
              </span>
            </div>
            <Chart state={state.workspace} palette="blue" />
            <p>
              Choose a region to inspect its source records. Chart order follows absolute revenue
              change.
            </p>
            <div className="studio-regions" aria-label="Explore chart regions">
              {regions.map((group) => (
                <button
                  key={group.region}
                  aria-pressed={focused === group.region}
                  onClick={() => {
                    setFocused(group.region);
                    ask(`In the studio, describe the chart for ${group.region}`);
                  }}
                >
                  <strong>{group.region}</strong>
                  <span>
                    {studioMoney(group.current)} / {studioPercent(group.percent)} change
                  </span>
                </button>
              ))}
            </div>
            <details>
              <summary>Read the chart as a table</summary>
              <div className="studio-table">
                <table>
                  <caption>Regional revenue in USD</caption>
                  <thead>
                    <tr>
                      <th scope="col">Region</th>
                      <th scope="col">Previous</th>
                      <th scope="col">Current</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regions.map((group) => (
                      <tr key={group.region}>
                        <th scope="row">{group.region}</th>
                        <td>{studioMoney(group.previous)}</td>
                        <td>{studioMoney(group.current)}</td>
                        <td>{studioPercent(group.percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
          <details className="studio-evidence" open={state.evidence.length > 0}>
            <summary>Source evidence {focused ? `for ${focused}` : ''}</summary>
            <p>
              {result.includedRows} contributing rows. Excluded locations:{' '}
              {excluded.join(', ') || 'none'}.{' '}
              {focused && <button onClick={() => setFocused(null)}>Show every source row</button>}
            </p>
            <div className="studio-table">
              <table>
                <caption>{state.sourceSheet} source rows and analysis inclusion</caption>
                <thead>
                  <tr>
                    <th scope="col">Original row</th>
                    <th scope="col">Location</th>
                    <th scope="col">Date</th>
                    <th scope="col">Region</th>
                    <th scope="col">Revenue</th>
                    <th scope="col">Included</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((row) => (
                    <tr key={row.sourceRow}>
                      <th scope="row">{row.sourceRow}</th>
                      <td>{row.location_id}</td>
                      <td>{row.date}</td>
                      <td>{row.region}</td>
                      <td>{studioMoney(row.revenue)}</td>
                      <td>{row.included ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <div className="studio-deliverables">
        <div className="studio-section-heading">
          <h3>Your deliverables</h3>
          <span>Same analysis. Matching figures.</span>
        </div>
        <div className="studio-actions">
          <button
            className="studio-primary"
            disabled={disabled}
            onClick={() => ask('Create an Excel and PowerPoint report from this studio analysis')}
          >
            <FileSpreadsheet size={17} /> Create Excel + PowerPoint
          </button>
          {!compact && (
            <button
              disabled={disabled || !cloudReady}
              onClick={() => ask('Verify this studio analysis with Databricks')}
            >
              <Database size={16} /> Verify with Databricks
            </button>
          )}
        </div>
        {state.outputs.excel || state.outputs.powerpoint ? (
          <div className="studio-downloads">
            {state.outputs.excel && (
              <a
                href="/api/computer/studio/export/excel"
                download
                aria-label="Download Excel workbook"
              >
                <FileSpreadsheet size={18} />
                <div>
                  <strong>Download Excel workbook</strong>
                  <small>Editable formulas and every source record</small>
                </div>
                <ArrowUpRight size={17} />
              </a>
            )}
            {state.outputs.powerpoint && (
              <a
                href="/api/computer/studio/export/powerpoint"
                download
                aria-label="Download PowerPoint"
              >
                <Presentation size={18} />
                <div>
                  <strong>Download PowerPoint</strong>
                  <small>6 slides with an editable data chart</small>
                </div>
                <ArrowUpRight size={17} />
              </a>
            )}
          </div>
        ) : (
          <p className="studio-help">
            Create reports after your last change. PowerPoint captures this revision; Excel formulas
            can recalculate when you edit the workbook.
          </p>
        )}
      </div>
      {!compact && (
        <p className="studio-provider">
          {result.provider === 'databricks' ? 'Verified Databricks SQL' : 'Local calculations'} ·{' '}
          {state.interpretation === 'hugging-face'
            ? 'Hugging Face interpreted the request'
            : 'Direct commands available'}{' '}
          · Original file unchanged
        </p>
      )}
    </section>
  );
}
