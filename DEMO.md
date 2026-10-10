# Demonstration and recording

The default computer/editor/browser/screen demo is in [COMPUTER-DEMO.md](COMPUTER-DEMO.md). The CSV flow below remains under **Data workspace**.

Use `npm run dev` or the built desktop (`npm run build`, then `npm start`). Default sample mode is a real calculated workflow with a deterministic planner. Say that explicitly. A live sponsor demonstration requires the cloud checklist first; do not rename sample execution as AI or Databricks.

## Exact flow

1. Open `data/operations-synthetic.csv` through **Open CSV**. This is synthetic data. Describe the file: 39 rows, 7 locations, 5 regions, January–June 2026.
2. “Compare revenue this quarter with last quarter.” Show **$204,000, +52.2%, South**. Latest available quarter means Q2 2026, not today.
3. “Only include locations that were operating in both quarters.” Show **$141,000, +11.9%, East**. A new South site inflated the initial comparison; a Central site closed. Both had rows in both periods, so row intersection would be wrong.
4. “Show that as a chart.” Then “Describe this chart.” Point to the same periods, filter and numbers in the chart/table/summary.
5. “Only show the top three regions.” Show **East, North, South**. “What changed?” explains the actual view change. Totals remain $141,000 across all five eligible regions.
6. “How did you calculate that percentage?” Show formula `(141000 − 126000) / 126000 × 100`, 30 rows, 5 included/2 excluded sites, dataset version and source reference.
7. “Undo that change.” The top-three chart returns. “Save my workspace.” Quit and reopen, then Saved workspaces or “Resume my workspace.” Filters/results/view/history restore.

For live voice: enable spoken feedback in Settings, click Voice request, say one command, click Finish recording, and wait for actual transcription. Click Stop during spoken output to demonstrate interruption. Rehearse in the venue; use typed input if microphone permissions or room noise interfere. Do not run an unverified voice path for the first time in front of judges.

## Roughly two-minute narration

**0:00–0:15 — Problem.** “Working with data should not require visually scanning a dashboard. InsightOS is a companion designed to support independent work, starting with a bounded data workspace.” Show the app and open the file.

**0:15–0:35 — Understand.** “I can ask what is in this file, then compare the quarters. The answer comes from the selected data.” Execute comparison. Say whether this recording uses verified live integrations or local sample mode.

**0:35–0:55 — Correct.** “South appears to lead, but the comparison includes a newly opened location. I can refine the question to the same operating sites.” Apply the filter. “The real result changes: 11.9% growth, and East leads.”

**0:55–1:15 — Review.** Create chart and top-three view. “The chart, text description and table share one result. I can focus the view without changing the overall total.”

**1:15–1:35 — Evidence and control.** Ask calculation; undo. “I can inspect the formula, periods, excluded sites and data source, then undo the view change. Stop cancels queued work and prevents stale answers changing the workspace.” Only show a live cancellation if rehearsed.

**1:35–1:50 — Continue later.** Save/reopen/restore. “The project restores the actual file, filters, result and history.” State the actual storage provider.

**1:50–2:00 — Scope.** “This is our first supported workflow. We built the shared voice and task foundation so future workflows can use the same review and control loop.” Name only sponsor integrations verified in this recording. Acknowledge Codex assistance when explaining how it was built.

## Backup and submission

`artifacts/demo-sample.webm` is a short automated recording of the real working sample UI, including refinement, explanation, undo, save and resume. It is not narrated and is not a finished submission video. Screenshots: welcome.png, workspace.png, desktop.png, demo.png, mobile.png. Re-running E2E regenerates browser captures and recording; desktop smoke regenerates desktop capture.

Record a paced two-minute real session with Windows recording tools, add the narration above, preview the final video, and keep a playable local copy on the judging laptop. If a live service fails, state the failure and show the honest recorded run with its mode/provider labels. Do not splice prerecorded provider success over sample-mode execution or conceal a failed task.

Three automated typed sample rehearsals passed. Their exact per-request wall times are in `artifacts/rehearsals.json`; they include browser interactions/assertions and are not cloud or voice benchmarks. Repeat the demo three times after enabling live credentials.

Before submission: add both teammates to Devpost, publish a public GitHub repository without `.env`/`.local`, add its link and the final video, select only eligible completed sponsor entries, and verify the links from a signed-out browser. Repository publication and Devpost submission have not been done. The [event requirements](https://knight-hacks-ix.devpost.com/) say submit October 11 by 10 AM and stop GitHub commits by 11 AM; use Eastern/event time and confirm any newer organizer announcement.
