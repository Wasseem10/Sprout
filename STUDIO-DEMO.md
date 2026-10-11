# Insight Studio

## Pitch

Insight helps blind and low-vision people do the work behind a presentation: explore spreadsheet data, question a result, change the analysis, and create Excel and PowerPoint files they can independently check. A floating desktop companion keeps the conversation available throughout the task.

## Three-minute demo

1. Open the desktop buddy and press Play. Say **“Start the analysis demo.”** The clearly labeled fictional dataset contains 39 source records. Overall revenue increases from $134,000 to $204,000, or 52.2%.
2. Interrupt with **“Wait, compare only the same locations.”** Insight applies the precise rule: locations operating continuously throughout both quarters. It excludes two locations, uses 30 rows, and recalculates $126,000 to $141,000, or 11.9%.
3. Ask **“How did you get that number? Show the source rows.”** Hear the calculation and inspect the contributing records. In the workspace, use Tab and Enter on a region to hear its figures and inspect the associated source rows.
4. Say **“Verify this studio analysis with Databricks.”** Real parameterized SQL calculates the comparison and reconciles against the source. If the warehouse is unavailable, report the failure and explicitly use the labeled local calculation for rehearsal.
5. Say **“Create an Excel and PowerPoint report.”** Download the actual two-sheet Excel workbook and six-slide PowerPoint. The workbook contains source records, an editable coverage control and SUMIFS formulas. The presentation contains an editable native chart, coverage comparison and source evidence.
6. Ask **“Open the spreadsheet”** and **“Open the presentation.”** Installed Office must be configured. Review the files. Changing the studio analysis clears current report links and blocks opening an older studio artifact until regeneration.

## Sponsor implementation

- **Hugging Face:** Qwen interprets open-ended requests as validated analysis operations. Immediate supported commands use direct routing. Calculations come from code or SQL, not generated prose.
- **Databricks:** source ingestion and parameterized regional/period aggregation. The live studio rehearsal reconciled the SQL figures with the source calculation.
- **ElevenLabs:** the existing continuous transcription and spoken-response integration, with user-reported interruption success. The new studio sequence still requires a physical microphone rehearsal.
- **Neon:** connected for the separate image-deck save/resume workflow, not Studio analytics persistence. Vultr is prepared but not deployed. No additional sponsor service is claimed.

## Verified and remaining

Unit integration checks cover source import, row references across blank rows, calculation changes, matching Office outputs, native editable PowerPoint chart packaging, report invalidation, undo and file tampering. Browser checks cover downloads, keyboard region exploration, source evidence, CSV upload and the floating buddy. Automated axe checks found no violations on the tested desktop studio page. Workbook import/recalculation verified the filtered totals and restoration to unfiltered totals. Every generated sample slide was rendered and inspected.

This is a bounded quarterly operations workflow. Uploaded files require the documented six-column format and plain Excel values. It does not handle arbitrary workbooks, edit the user's existing Excel session, or provide universal computer automation. Native Office launch and physical speech for the final new sequence, along with evaluation by blind users, remain to be checked. PowerPoint is a snapshot of the current revision, not a live connection to later Excel edits.

## Run

Open `http://127.0.0.1:5173/?workspace=studio` while the local services are running. The existing InsightOS desktop shortcut opens the native buddy. Run `npm run build` after changes for the compiled desktop version.

`npm run test:studio` uses supported commands and local calculation. `npm run test:studio -- --live` makes real Hugging Face and Databricks requests. Both create private review files in `.local/studio-rehearsal`. Provider receipts are in `artifacts/studio-rehearsal*.json`. No private credentials are included.

The latest actual rehearsal is `npx tsx scripts/smoke-studio-live.ts`. On October 11 at 02:47:27 UTC it verified live HF interpretation, Databricks SQL and contributing records, Excel formula caches, and the PowerPoint chart plus embedded editable workbook. Private outputs are `.local/studio-live-verified/verified-analysis.xlsx` and `.pptx`; the statement and checks are in `receipt.json`. The combined command “Verify the studio analysis with Databricks and create an Excel and PowerPoint report” now verifies before exporting. Changing an analysis still requires regenerating its reports. No microphone or native Office launch was exercised by this script.
