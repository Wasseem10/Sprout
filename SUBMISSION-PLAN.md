# Knight Hacks IX: InsightOS submission plan

## October 11, 2026 — focused product and remaining release work

**Current status:** source integration for branching diagrams, verified revenue-chart insertion and bounded layout control/readback is complete, with isolated provider and exported-file checks passing. The current desktop runtime has **not loaded these additions**. Final integrated release checks and physical voice/native PowerPoint rehearsal are still required. This block supersedes the older capability and “unimplemented” statements below; historical results do not prove the new release is ready.

**Submission pitch:** Insight is a Windows voice companion that lets blind and low-vision people direct visual work independently: create an editable presentation, explore a decision diagram, trace a chart to its data, change the design and undo a mistake through conversation. The distinguishing demonstration is the user's ability to **review, question and correct** the artifact, as well as generate it.

### Freeze the scope

| Capability | What we can demonstrate after rehearsal |
| --- | --- |
| Targeted presentation editing | Specific slide changes, retained context, scoped undo and one stable working PPTX. |
| Branching diagram | One decision, two labeled branches, up to seven nodes; insert, explain a branch, add a review step, undo. Native editable shapes and connectors. |
| Verified chart | Import the supported six-column CSV/plain-value XLSX from a named folder; insert or refresh its revenue comparison after a fresh Databricks check, and explain its saved source evidence. Arbitrary spreadsheet analysis is outside this workflow. |
| Visual direction | Picture left/right, two-column text, title size, editable picture descriptions, measured scene previews, keyboard graph exploration and spoken layout review. No arbitrary object dragging. |
| Persistence | Explicit save and same-laptop resume with structured project/history. Isolated Neon V3 round trip passed; the complete spoken save/resume demonstration remains to rehearse. |

Use the proposed **2:45 video** in [PRESENTATION-DEMO.md](PRESENTATION-DEMO.md): direct a slide's design → explain and change a diagram → undo → inspect a verified chart → save. Start from a clearly disclosed prepared source/base deck in an explicitly separate demo project. Preserve the user's Pet Behavior r4 project throughout. Keep finance/energy as possible source material, not competing product pitches.

### Finish in this order

1. Complete the integrated automated and actual-provider acceptance gate without lowering its criteria. Build and release only the accepted source; protect the current project and runtime checkpoint.
2. Verify graph, chart and layout state/history through save/resume, then rehearse the separate demo twice using the microphone and installed PowerPoint. Confirm interruptions, visible changes, same-file behavior and evidence-backed readback.
3. Record the shortest successful sequence; disclose synthetic data and edited waiting. A blindfolded sighted demonstration is not user validation. Remove any segment that cannot be demonstrated reliably.
4. Publish the tested source and update Devpost/video/screenshots to match what was actually shown. Select sponsor judging options only after checking their current requirements against the final artifact.

### Sponsor evidence to present honestly

Hugging Face Qwen powers semantic interpretation and generation; ElevenLabs Scribe/George supplies the existing voice pipeline. Neon provides owner-scoped project/history storage, with the new-state round-trip gate tracked separately. Databricks now has a concrete role in source-integrated chart insertion: it checks the supported revenue comparison before export. These are the relevant sponsor demonstrations to verify and describe. **Vultr is not deployed; Tiger Data and Gemini are absent.** Do not select or claim those integrations merely because accounts or credits exist. First-time-hacker eligibility was ruled out by the user. No outcome or placement can be promised.

Do not describe the product as unrestricted computer control, a general Excel analyst or an editor for arbitrary imported corporate PowerPoints. Its strongest claim is a bounded, editable visual-work workflow the user can inspect and revise independently. See AGENTS.md and VERIFICATION.md for final release status rather than treating this proposed script as execution evidence.

---

## October 11, 2026, 09:50 UTC — reliability milestone

Same-file presentation editing is implemented and loaded into the desktop app, with actual native repeated-edit/restoration and restart evidence. Pet Behavior r4 remains the current seven-slide project and actual Neon readback matches it. Keep the demo focused on creating, reviewing and revising visual work by voice; branching diagrams and active-deck chart insertion remain unimplemented. Phase A target continuity is in progress. No sponsor status changed.

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

**Visual work should not require sight to direct it.** InsightOS is a Windows voice companion for blind and low-vision people to create, review and revise editable presentations from their own ideas and files. The result is independent direction and verification of visual work, including corrections and undo.

## Finish the core workflow

A semantic presentation interpreter now operates a versioned ordered deck: 3–10 slides independent of 0–6 pictures, requested picture placement, three themes, scoped text revision/sizing, reordering, summary, undo and same-laptop save/resume. It interprets a whole turn with the current task and artifact context; it is not a growing list of individual spoken phrases.

Actual HF Qwen → editable six-slide deck → scoped revisions → Neon save → restart/resume passed again at 05:08:35 UTC using an isolated copy of the user's Marketing image. Ordered state/history and source bytes matched. The then-current **Cyber Monday Guide** checkpoint remained untouched. That provider/file test excluded native Office and microphone. A separate real typed-command rehearsal in the running buddy selected slide 2 → next slide 3 → last slide 4, independently confirmed in PowerPoint and backend state. Actual export QA passed for three themes, shortened text and a seven-slide summary. See `.local/ordered-controller-live-IAZULr/receipt.json` and `.local/native-navigation-rehearsal.json`.

1. Source is frozen after the updated gate: 638/638 unit tests in 47 files plus production build/typecheck. Actual native summary creation and undo each opened and selected the correct new revision on the first request; final r10 Neon save matched the active/local state and hash. Preserve all original user files.
2. Repeat the corrected microphone/PowerPoint workflow: create six slides from Desktop Marketing → read slide two → shorten → larger text → clean blue → reorder → summary → undo → save. The user has already exercised creation, revisions, summary, undo and saving, and confirmed the interruption/correction/readback trial. The new fixes and final recording still need rehearsal. Report file saving and native selection separately.
3. Record and watch the shortest successful sequence from [PRESENTATION-DEMO.md](PRESENTATION-DEMO.md). Include Neon only after spoken save/resume works. Label a sighted blindfolded demo accurately.
4. Update Devpost, screenshots and tested published source to the finished behavior. Keep finance/energy secondary. Submit and attend judging.

**No further expansion before core physical rehearsal.** Verified-chart insertion into the active deck is optional phase three and is not implemented. Existing separate Studio/Databricks analytics can support a short second segment. New sponsors, fine-tuning and a model switch are not needed to prove the core product.

## Proposed two-minute video

- Explain the barrier: creating a deck is only the beginning; the user needs to review, correct and trust it without seeing the canvas.
- “Create a six-slide Cyber Monday campaign presentation using the Marketing picture on my Desktop on the title slide. Make it dark minimal.” Show the original picture and editable output; label it a proposed campaign.
- “Read slide two.” Then, “Make it less wordy.” Show only that slide changing.
- “Add a summary slide at the end.” Show seven slides; “Undo that” returns to six.
- Finish with the actual editable file and spoken review. Add a verified Neon resume shot if time permits.

## Sponsor targets

| Product/entry | Meaningful use and status |
| --- | --- |
| Hugging Face | Primary evidenced fit: hosted Qwen text/vision interpret turns, describe sources and plan/revise slides. Actual calls passed; no team training/local hosting claimed. |
| ElevenLabs | Primary evidenced fit: Scribe recognition and George/Flash speech. Provider checks passed; the user confirmed physical interruption/correction/readback and exercised creation/editing/save. Rehearse the corrected flow before recording. |
| Neon | Explicit owner-scoped V2 project/history persistence, verified restart/resume and local source-hash checks. Show saved/resumed state. |
| Databricks | Optional separate Studio segment with actual SQL and matching Excel/PPT exports. No chart insertion into the active presentation yet. |
| Vultr | Not deployed. Accounts, credits and packaging are not evidence of use. Existing bundles are stale; approval, actual hosting and a genuine request remain required. |
| Gemini / Tiger Data | Not integrated. |
| Design / general categories | Show the actual buddy, accessible workspace and output. No Adobe API or native Figma file is claimed; check current challenge requirements. |

The clearest evidenced sponsor story is Hugging Face, ElevenLabs and Neon. BNY/OneEthos are not established fits for this presentation demo. The team is not eligible for Best First-Time Hacker. No placing or prize eligibility is guaranteed.

## Links and submission checklist

- Public source: https://github.com/Wasseem10/insightos
- Published sample: https://insightos-livid.vercel.app/

The published sample is an older bill/browser-speech workflow. It cannot control this laptop or prove that the latest local presentation code is published. Record the Windows companion and actual output.

- [x] Earlier baseline unit suite (600/600), scoped browser suites and production build/typecheck pass.
- [x] Updated gate: 638/638 unit tests in 47 files and production build/typecheck passed.
- [x] Actual native summary revision opened on its first request, selecting slide 7 of 7 and retaining one project window plus five unrelated presentations.
- [x] Actual undo opened revision 10 on its first request, selecting slide 6 of 6; final Neon save matched the active/local session and file hash.
- [x] Actual typed commands repeatedly select slides 2 → 3 → 4 in installed PowerPoint, with verified backend state.
- [x] User confirmed the physical “Read slide two” → interrupt “Wait, read slide one” trial worked, including correction capture and readback.
- [x] User exercised spoken creation/revisions/summary/undo/save and exposed specific defects to correct.
- [ ] Rehearse the corrected create/revise/undo/save flow and record the demo.
- [ ] Record and watch the final video; include only demonstrated capability and sponsor use.
- [ ] Update DEVPOST-DRAFT.md, screenshots and tested public source; add both teammates.
- [ ] Select applicable prizes and attend organizer-announced judging rooms.
- [ ] Reconfirm the deadline. The October 10 check found 10 AM EDT October 11 in submission requirements despite an 11 AM event header; follow newer organizer instructions.

Event source last checked October 10: https://knight-hacks-ix.devpost.com/. Architecture, evidence and rehearsal details live in [ARCHITECTURE.md](ARCHITECTURE.md), [SPONSOR-INTEGRATIONS.md](SPONSOR-INTEGRATIONS.md), [PRESENTATION-DEMO.md](PRESENTATION-DEMO.md) and [VERIFICATION.md](VERIFICATION.md).
