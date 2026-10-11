# Insight: voice-directed presentation demo

## October 11, 2026 — proposed recording after the release gate

**Current status:** branching flowcharts, verified chart insertion and bounded visual design/readback are integrated in source. Their isolated provider and exported-file checks passed. This source is **not yet loaded in the current desktop runtime**; physical voice and native PowerPoint checks for the new features remain pending. The final integrated release gate is recorded separately in AGENTS.md and VERIFICATION.md. This block supersedes older “unimplemented” statements and recording instructions below; those sections remain historical evidence.

**Pitch:** “Visual work should not require sight to direct it. Insight lets blind and low-vision people create an editable presentation, understand its layout and decision logic, check where its numbers came from, and make precise changes by conversation.”

### Prepare an isolated demo

Prepared locally at 11:48 UTC: **Desktop → Insight Demo** contains `marketing.jpg` (an unchanged copy of the user's Marketing image), `brief.txt` (explicitly fictional proposed plan), and `fictional-revenue.csv` (the packaged 39-record sample). The preparation did not create a project, call a provider or change Pet Behavior. Private receipt: `.local/recording-folder-receipt.json`. After the new build is accepted, start with: “Create a new three-slide presentation from my Insight Demo folder on the Desktop. Use the picture on slide two and the brief for the content.” Then load the named CSV by voice for the chart segment. Keep the fictional-data disclosure in the recording.

Preserve the user's **Pet Behavior r4, seven slides and three undo entries**. Rehearse in an explicitly new, separate project; never load a fixture over Pet. Prepare a named local demo folder with one PNG/JPG and a short factual or clearly labeled proposed campaign brief. Use a three-slide base deck, with its image on slide two. Prepare the supported Studio revenue comparison from a known CSV before the chart segment; label synthetic data visibly. The prepared source and base deck should be disclosed in the video.

### Proposed 2:45 video

| Time | Spoken action and visible proof |
| --- | --- |
| 0:00–0:15 | State the accessibility barrier and pitch. Show the original image/brief and the separate editable demo deck. |
| 0:15–0:45 | “Move the picture on slide two to the left and make only its title larger.” Then “Describe how slide two looks.” Show the changed slide and accurate spoken layout readback. |
| 0:45–1:30 | “Insert a campaign approval flowchart after slide two. Start at Submit campaign. If approved, Launch, then Finish. If rejected, Revise campaign, then Finish.” Then ask, “What happens on the rejected branch of slide three?” Show the editable decision and labeled arrows. |
| 1:30–1:55 | “Add an accessibility review before Launch on the approved branch.” Then “Undo that.” Show the exact branch change and restoration in the same working file. |
| 1:55–2:25 | “Insert the verified revenue chart after slide three.” Then “Where did the numbers on slide four come from?” Show the chart and its saved source/filter/date evidence. |
| 2:25–2:45 | “Save my presentation.” Show the confirmed save outcome and editable output. Close with: “I can create, check and correct visual work independently.” |

These are editing targets for the video, **not measured end-to-end execution times**. Rehearse before recording; disclose cuts or sped-up waiting. Save/resume can be a separate short verified clip if it fits. If time is tight, keep the diagram edit/undo sequence and omit the chart rather than rush past its evidence. A sighted participant wearing a blindfold must be described as a demonstration, not a substitute for testing with blind users.

### Supported boundaries and final rehearsal

- Flowcharts have one decision, two labeled branches, at most seven nodes and forward paths. Readback uses the stored graph; it does not infer unseen visual state.
- Design commands support picture left/right, single/two-column text and bounded title sizing on supported slide types. Large-image layout requires no body text. “Describe the layout” uses the saved export's measured scene and verified file hash; it distinguishes file evidence from native-view verification. The app cards are not a spatial preview.
- Chart insertion uses the current supported Studio **revenue** comparison, freshly verified by Databricks. Reading figures or their source uses the saved dated snapshot. This is not arbitrary Excel analysis or automatic refresh.
- The result is native editable PowerPoint content. Insight does not simulate constructing every shape with the mouse or provide unrestricted desktop control.

After the root release gate passes, load the accepted build and rehearse this sequence twice with the physical microphone and installed PowerPoint. Check complete utterances, interruption, correct slide targeting, unchanged unrelated slides, one working filename, actual chart values, undo and the save receipt. Rehearsal must use the separate demo project. Report local save, cloud save and native display outcomes independently; do not present mocked or provider-only checks as a live voice rehearsal.

---

## October 11, 2026, 09:50 UTC — same-file demo baseline

The running app now keeps structured edits, Undo and resume in one working PPTX with private recovery versions. Current Pet Behavior r4 has seven slides and three undo entries, saved/read back in Neon, with one verified native PowerPoint window. Try a targeted spoken slide edit next: it should refresh that same file rather than leave another presentation open. Native deterministic repeated-edit/restoration and restart checks passed; a new physical voice rehearsal is still required. Stable semantic target binding and the proposed diagram/chart additions are subsequent work. See latest AGENTS.md and VERIFICATION.md.

## October 11, 2026, 08:26 UTC — pet-deck repair and native recovery verified

**Current user project is Understanding Pet Behavior, revision 3, seven slides, file insight-presentation-r3-c9c2fa8c.pptx.** It supersedes pet revision 1 and every older Site/Cyber Monday checkpoint. Do not resume an older recovery snapshot over it. Original pet recovery files remain preserved under .local/pet-recovery-*; latest full state, checkpoint and Neon row are .local/pet-final-*.

Actual production typed UI request expanded slide two from **48 to 86 body words**. The following exact summary request through the production API added slide seven. Stable slide identity/font and the other five slides remained unchanged; the summary preserved all six preceding slides. Original file hash and PPTX counts passed. Receipt: .local/pet-content-repair-verification.json. Actual expanded and summary exports were rendered and visually checked with no clipping or overlap (.local/pet-actual-file-qa/r2-export-check.json and r3-export-check.json). The renderer produced complete PNGs before exiting 1 during teardown.

Revision 3 was saved to the same owner-scoped Neon project at 08:01:15.905 UTC. Direct SELECT at 08:01:31.200 UTC matched the active ordered deck, local session and output hash: seven slides, two undo entries, zero sources. Receipt: .local/pet-final-neon-verification.json. Do not use .local/resume-pet-recovery.ts now: it targets the original revision-1 snapshot.

General fixes: terminal failures end their executable queue while retaining bounded failure context; explicit new operation plans cannot revive that queue through model retry metadata. Explicit retries and matching corrections remain. Qwen revises content fields only; the app retains slide IDs, image references, layout and font. Topic-appropriate bounded rewriting and measured readability/numeric checks remain. An isolated compiled-controller test with the captured failure injected at execution then actual HF summary produced seven slides without replaying the failed edit (.local/pet-failed-summary-compiled-TvC53P/receipt.json). Three actual compiled HF expansion probes passed, preserving unrelated slides.

Final gate: **664/664 unit tests, 48 files, 16.73 seconds; production build and TypeScript passed.** Logs: .local/pet-repair-final2-unit.log and .local/pet-repair-final2-build.log. Current Electron runs that production build. No model switch, fine-tuning, new sponsor integration or native helper change was made.

**Native recovery completed at 08:26 UTC:** the user approved force-closing the frozen process, but a fresh check found PowerPoint had recovered by itself. No force-close/restart was performed. A typed “Open the presentation” through Insight verified slide seven; “Go to slide two” then verified slide two in both backend and the actual PowerPoint View Indicator. Managed opening retired the old same-project windows and left exactly one current project window plus six unrelated recovery windows. Current revision 3, ordered content and file hash remain unchanged from the Neon save. Receipts: .local/pet-recovered-native-open.json, .local/pet-recovered-native-slide-two.json, .local/pet-native-recovery-final.json. Earlier automatic opening did fail while Office restored its old recovery windows; this later explicit opening succeeded. Physical microphone was not exercised in this repair. Rehearse voice and record next; sponsor/chart additions remain deferred.

## October 11, 2026, 07:09 UTC — final recovery gate and active checkpoint

**Preserve the active user project: Site in One-Day Campaign, revision 10, six slides**, file `insight-presentation-r10-e12d6627.pptx`. It is open in PowerPoint with slide six verified and saved to Neon. This supersedes r5, r6, r8, r9 and earlier Cyber Monday checkpoint instructions. The original r5 file and its SHA remain preserved; do not restore it over the current revision.

The current app's typed UI rehearsal expanded slide two **16 → 62 body words**, shortened it to **37**, then undid that change to restore the exact expanded deck. The other five slides remained unchanged. Receipt: `.local/revision-text-invariants.json`. The current deck therefore has its expanded slide two, not an automatic rewrite of every older slide. New generations use richer, distinct explanatory content; detail direction, meaningful change, factual numbers and measured readability are validated before commit. No model switch or fine-tuning was introduced.

Actual native PowerPoint opening now passed on the first request: adding a summary created r9 with seven slides and verified slide 7 of 7; undo created r10 with six slides and verified slide 6 of 6. Each action left exactly **one window for this project and five unrelated presentations**. No extra Open click or manual PowerPoint intervention was needed. Receipts: `.local/native-summary-window-receipt.json`, `.local/revision-rehearsal-summary.json`, `.local/native-undo-window-receipt.json`, `.local/revision-rehearsal-undo-final.json`. The helper allows bounded initial readiness within a 45-second overall cancellation budget, uses temporary PowerShell files to avoid command-line length limits, and closes only exact same-project paths with matching hashes and no unsaved changes. These were typed UI tests, separate from physical microphone evidence.

Revision 10 saved to the same owner-scoped Neon project at **07:09:02.400 UTC**. Direct SELECT at **07:09:03.734 UTC** matched the active ordered deck, local session and output hash: six slides, three history entries and one source. Receipt: `.local/revision-progress-neon-verification.json`. The earlier actual r5 verification is retained in `.local/current-rehearsal-neon-verification.json`; it is historical, not the latest saved revision.

Actual Hugging Face Qwen editing of an isolated copy separately passed **16 → 63 → 40 body words**, with the other five slides unchanged; both edited slides were exported and visually inspected (`.local/content-depth-live-e644c6dc/edit-receipt.json`). Fresh six-slide generation passed with body-word counts **9, 47, 46, 44, 43, 39**, the original Marketing image on the cover and all six slides visually inspected (`.local/content-depth-live-cd13283a/receipt.json`). The renderers produced the inspected PNGs before exiting 1 during teardown. Those isolated content tests did not change the active deck, write Neon, operate native Office or use the microphone.

Final source gate: **638/638 unit tests in 47 files, 15.94 seconds**, including 23 focused native-helper tests; production frontend/server build and TypeScript passed. Logs: `.local/revision-final-unit.log`, `.local/revision-final-build.log`. Source is frozen. The user previously confirmed full-sentence capture and live interruption/correction/readback, and physically exercised creation/revisions/summary/undo/save; the latest fixes were verified through typed UI/provider/native tests. Rehearse the corrected flow by voice and record the demo next. Optional chart insertion and new sponsor work remain deferred.

Earlier sections below retain previous architecture and dated evidence; this latest checkpoint and recovery status take precedence.

**Pitch:** Visual work should not require sight to direct it. Insight helps blind and low-vision people turn their own files and ideas into an editable presentation, hear what is on each slide, and direct specific changes through conversation.

The focus is create → review → revise → undo. Hugging Face Qwen interprets whole turns against the current task and artifact, then validated tools execute the plan. This is a general semantic pipeline with defined capabilities, not a separate scripted phrase for every way of speaking.

## Prepare and protect the current work

The current user checkpoint is **Site in One-Day Campaign, revision 10, six slides**, file `insight-presentation-r10-e12d6627.pptx`, saved to Neon with slide six verified in PowerPoint. Do not replace it with a fixture or an earlier user deck during restart. New rehearsals must preserve the existing project, original r5 file and source files.

The Desktop Marketing folder currently has the original images.jpg; another Marketing folder exists in Downloads. Say **“Marketing on my Desktop.”** One image can appear on the title slide of a six-slide deck; image count no longer determines slide count. New decks support 3–10 slides and zero to six PNG/JPG sources. Add brief.txt or brief.md for factual company information. Without a factual brief, marketing content must be described as a **proposed plan**, not actual business results.

Use the local Windows companion and installed PowerPoint. The published browser sample cannot control this laptop.

## Recording script

Rehearse these requests naturally, with pauses and corrections:

1. **Create:** “Create a six-slide Cyber Monday campaign presentation. Use the picture in my Marketing folder on my Desktop on the title slide. Make it dark minimal.” Show the actual source and editable file.
2. **Review:** “Read slide two.” Then, “Make it less wordy.” The last reviewed slide provides the target; other slides should remain unchanged.
3. **Direct the design:** “Make the text larger on slide two.” Then, “Use clean blue.”
4. **Change the structure:** “Move slide four before slide two.” Then, “Add a summary slide at the end.” Show the actual order and seven-slide count.
5. **Recover:** “Undo that change.” The deck returns to six slides. “No, use dark blue instead” is a correction; “No, don't do that, actually” cancels a pending task.
6. **Remember:** “Save my presentation.” Verify Neon saved status. In a separately rehearsed restart shot, say “Resume my last presentation” and review the saved revision. Keep the original sources on the same laptop.

For two minutes, keep creation, spoken review, one content change, summary and undo. Add Neon after its complete voice sequence works. The strongest moment is directing and checking a change without needing to inspect the slide visually.

For image replacement, use an ordered project such as the current Site in One-Day Campaign deck. Say “Use the same Marketing picture on slide two,” or supply a second real filename for a different picture. One picture cannot supply an unseen alternative. Ordered projects retain inserted source references in saved V2 sessions. Older non-ordered decks with separate OOXML patches still use their legacy recovery rules.

## Capabilities and boundaries

| Capability | Current extent |
| --- | --- |
| Conversation | Semantic requests, follow-ups, corrections, questions and cancellation; partial speech retains a task draft instead of becoming a folder name. |
| Creation | 3–10 ordered slides, 0–6 pictures, cover/text/image/process layouts, stable slide IDs and requested image placement. |
| Styling by voice | Clean blue, bright minimal or dark minimal, plus bounded text sizing. Readability validation rejects changes that cannot fit. |
| Scoped changes | Read, navigate, expand/shorten/revise a slide, insert/replace a picture, move a slide, add summary, change theme, undo up to eight revisions. Text revisions report the actual target and word-count change when expanding or shortening. |
| Persistence | Explicit Neon V2 content/source/history save; same-laptop hash-verified resume; supported V1 migration. |
| Native view | PowerPoint selection is verified separately from saved-file success. |
| Data | Separate Studio/Databricks Excel/PPT export works. Verified-chart insertion into this active deck is **not implemented**. |

PptxGenJS creates the Office file directly. Text, pictures and process boxes/arrows remain editable; generation does not simulate typing and dragging in PowerPoint. The renderer supports split and large-image layouts, but switching to a large-image layout by voice is not implemented. Arbitrary imported PPTX editing, free object positioning/animations, unrestricted mouse control, purchases and form submission are outside this demo. A chart schema/renderer alone is not a voice chart-insertion feature.

“Go to slide two, then shorten it” must verify native selection before continuing. On Office failure, retain the saved-file result, report the view failure, and do not claim navigation succeeded.

## Evidence and remaining checks

Actual HF Qwen plus a byte-identical copy of the Marketing image passed the full controller sequence again at **05:08:35 UTC, October 11**: six-slide creation, read, shorten, larger text, clean blue, reorder, summary, undo, Neon save, restart and exact ordered-state/history resume. Creation took 7.64 seconds in this run, excluding audio. Native Office was disabled and the microphone was not exercised. Receipt: `.local/ordered-controller-live-IAZULr/receipt.json`.

Five actual PPTX variants—six-slide dark/blue/light, shortened revision and seven-slide summary—passed package/layout checks with zero findings. All dark slides and representative theme/revision slides were inspected from 31 rendered PNGs. The renderer exited nonzero during teardown after writing PNGs; a transient missing light-cover image was resolved by sequential rendering of the unchanged file. This is export evidence, not native Office evidence. Receipt: `.local/ordered-visual-qa/receipt.json`.

Separate typed requests in the actual buddy selected slide 2, next slide 3, and last slide 4 in installed PowerPoint. Both its View Indicator and backend verified state matched; the current user's checkpoint stayed unchanged. Receipt: `.local/native-navigation-rehearsal.json`. UI inspection sometimes stayed stale while Insight was inactive and updated on activation; no product change was made for that observation. Failure feedback now uses the current requested slide, not an old picture's slide, and only current edits receive a saved-edit confirmation.

The user confirmed full-sentence capture at 04:10 UTC and subsequently replied “it worked” to the live Play → “Read slide two” → interrupt with “Wait, read slide one” check. This confirms the requested stop-speaking, complete-correction and slide-one readback behavior by user report. Before filming, rehearse the complete voiced create/review/revise/undo/save sequence above, including revised-file opening. Picture replacement is an optional extra after the main sequence succeeds. A sighted blindfolded demonstration is not blind-user validation.

Final automated gates passed: 638/638 unit tests in 47 files and production build/typecheck. The earlier 21 focused desktop/image/semantic browser cases passed with mocked native IPC/providers. Detailed and historical evidence is in [VERIFICATION.md](VERIFICATION.md). Fix failures from the physical voice rehearsal before adding any sponsor or workflow.
