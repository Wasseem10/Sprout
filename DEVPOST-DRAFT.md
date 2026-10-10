# InsightOS — hear the numbers, make the decision

## One-line pitch

A voice-first desktop companion that helps blind and low-vision people understand household bills, compare affordable options, and prepare their next step.

## Inspiration

Reading a bill, checking a spreadsheet, and completing a form can require many visual and mouse interactions. We built InsightOS to make a useful financial workflow possible through conversation, while preserving source evidence and the user's choices.

## What it does

The demonstration starts with two electricity-bill PDFs. Insight finds saved documents, asks before reading, and extracts their billing fields. It reads the numbers aloud and waits for the user to confirm or correct them. The workspace keeps the original pages and source quotes beside the editable values.

After confirmation, Insight explains the change in usage, effective energy rate, and other current charges. A real Databricks SQL query verifies those components against the local calculation, with the statement reference available in the workspace. Our clearly labeled sample bills rise from $195 to $240, with the $45 change coming from increased usage.

The user sets a maximum monthly improvement payment and compares fictional efficiency quotes. The key interaction is a change of mind: after preparing a practice application at a $60 limit, the user says “Wait, I can only afford thirty dollars a month.” Insight invalidates the old verification, flags the selected $41.67 payment as above budget, and keeps the existing applicant answers. Choosing the $25 weather-sealing option updates the browser form and verifies its eight review values again before reading them back. Nothing is submitted.

A real OUC conservation-program link provides a local next step; OUC determines actual eligibility and costs. Follow-up usage recording is supported, but weather and occupancy can affect it. The prototype does not claim measured energy savings, approved financing, or blind-user validation.

Insight lives in a native Windows floating buddy, with a center Play button, global shortcuts, spoken replies, and interruption support. Its accessible companion workspace includes keyboard controls, larger text, source previews, and chart descriptions. It also supports transaction CSV/XLSX analysis, reversible budget scenarios, editable Excel exports, and PowerPoint generation. These are additional capabilities; the recording follows one bill-to-decision story.

## How we built it

Electron provides the floating window, tray and global shortcuts. React and TypeScript render the companion workspace; Fastify validates requests and keeps provider credentials outside the renderer.

Hugging Face open models extract text and scanned bill fields, interpret flexible requests, and generate supported files. Text-field proposals need an observed source quote containing their numeric value; scanned-image fields require user review. Missing fields, inconsistent totals and duplicate billing months block comparison. ElevenLabs provides streaming transcription and short spoken replies. Deterministic tools validate fields and calculate financial results rather than accepting model-generated arithmetic.

Databricks runs parameterized SQL over confirmed numeric inputs and reconciles the returned bill-change components before displaying the cloud-verification label. Its real warehouse connection test also passed both known operations-data fixtures. Keys are saved privately in a Git-ignored local environment file. Neon and Vultr adapters exist, but neither is deployed or live verified and neither is a demonstrated sponsor integration.

We used Codex to help implement and test the project, and checked actual provider responses, PDFs, generated files, browser fields and UI behavior.

## Challenges and learning

The difficult part was carrying corrections through an entire workflow. A revised bill must invalidate its old comparison; a changed budget must invalidate an old application; a canceled request must release its settings lock. Source checks, typed actions, deterministic calculations and fresh browser read-back make these transitions reviewable. We also separated calculated estimates from observed results, and tested actual services rather than treating saved credentials as proof of connectivity.

## Verified evidence

- Live Hugging Face text extraction of two genuine synthetic PDFs and vision extraction of a rasterized bill: `artifacts/bill-rehearsal.json`.
- Live Databricks bill reconciliation and statement reference: `artifacts/databricks-energy-live.json`; the combined rehearsal also includes a real SQL verification step.
- The $60 → $30 correction withdraws stale verification, then the selected $25 option is checked in the owned browser practice form.
- Desktop, mobile and buddy bill workflows passed automated accessibility checks. UI screenshots: `artifacts/bill-workspace.png`, `artifacts/bill-mobile.png`, `artifacts/bill-buddy.png`.
- Earlier live ElevenLabs transcription/audio checks passed. The physical laptop microphone, speaker echo and spoken interruption still need a human rehearsal before the final recording.

## Challenge fit

Hugging Face and Databricks are the clearest demonstrated sponsor fits: open text/vision models make documents conversational, and live SQL turns confirmed data into a useful decision. ElevenLabs powers the spoken interaction. The BNY angle is an accessible financial-data and client workflow; the separate transaction/Excel capability can support that pitch. OneEthos is a local conservation extension, with projected reductions and a follow-up measurement plan rather than a claim of achieved community impact. These are proposed fits, not prize guarantees.

## Submission still needed

- Final narrated video: use the focused script in `COMPUTER-DEMO.md` after a physical voice rehearsal.
- Public repository URL and both teammates' details.
- Select only relevant tracks, attach evidence screenshots, and attend the sponsor judging rooms announced by the event.
- Do not claim a Vultr or Neon deployment, completed purchases, real application submissions, or measured savings.
