# InsightOS master implementation prompt

Prepared October 11, 2026. This is the staged build specification; use the implementation status below to distinguish completed checks from proposed features. It supersedes the proposed architecture in `INSIGHTOS-IMPLEMENTATION-PROMPT.md`, which describes an older project state. Newer runtime evidence and user instructions always take precedence.

### Prospective copy-editing policy correction — October 11, 2026, 11:59 UTC

Ordinary requests such as “tighten the wording” specify a direction, not an undisclosed minimum percentage. The implementation previously imposed a mandatory 20% reduction. Actual evaluations rejected useful shorter copy solely for missing that threshold, and repeated proportional compression eventually conflicts with retaining the original meaning. Remove that hidden requirement. Require a substantive normalized body edit, fewer body words, complete readable sentences, preserved essential claims/relationships/conditions and measured layout fit. Report the actual before/after count. Explicit user word limits or reduction percentages remain strict, bound to the original target at execution; an infeasible limit must fail truthfully or request a supported choice.

This is a prospective product correction, not a reassessment of prior failed trials. Preserve the original receipts and their failure classifications. The release requirement stays at least 90% feasible workflow completion with zero wrong-slide, stale, material-content-loss or false-success cases in the evaluated suite. Freeze this policy and implementation before a new evaluation; manually review the resulting prose in addition to software invariants.

Evaluate a dedicated Hugging Face instruction model for copy work separately from conversational intent routing. A direct source-versus-candidate review may reject material omissions, changed uncertainty or unsupported factual claims; it is fallible evidence, not proof. Bound editing to two candidates with at most one content review for each. Retain deterministic identity, source, numeric, layout and cancellation checks. Do not activate any model or build until the combined gate passes. The current accepted runtime and Pet Behavior r4 remain unchanged.

### Implementation status at 11:25 UTC

Phases A/B/C/D are integrated in source. Bounded branching diagrams, verified Databricks chart insertion, source/value readback, layout controls and saved-layout narration passed isolated real-provider/file checks; V3 Neon state was independently saved/read back. Software gate: 1,140 unit checks and 23 mocked browser checks passed, plus frontend and staged server production compilation. The accepted runtime still runs checkpoint zero and Pet Behavior r4 is unchanged.

The actual revision-model gate remains below target: 15/17 feasible workflows (88.24%), with two rejected shortening requests and two additional manually observed qualification omissions among programmatic passes. A stronger HF instruction model is being evaluated without production changes. Do not label the source fully reliable or release-ready, or treat passing unit counts as semantic proof. See the latest AGENTS.md for receipts. Final release/native checks and physical voice rehearsal remain.

### Historical implementation status at 10:26 UTC

Phase A source is built but not released: 939 unit tests and the scoped 22 browser checks pass, while actual HF controller evaluation completes only 12/17 feasible workflows (70.6%; 18/24 overall scenarios). The 90% completion gate is not met. General intent/recovery and model-output defects remain under repair. The current user Pet Behavior r4 remains unchanged in the running checkpoint-zero app. Graph and shared-scene modules for Phase B are tested foundations only, with no app integration. See the latest `AGENTS.md` checkpoint and `.local/phase-a-controller-final-uLrxCr/assessment.json` before proceeding.

Update 09:50 UTC: the user quit Insight normally and the accepted checkpoint-zero build is now running. Pet Behavior r4 restored into the same filename with unchanged ordered content/history, one verified native PowerPoint window, and matching actual Neon readback. The restart prerequisite below is resolved. Phase A work remains a separate source stage.

Checkpoint zero is implemented and built: one working PPTX, private revisions, guarded native refresh, stable file identity, crash recovery and stale-callback rejection. 724 automated tests passed, as did actual isolated PowerPoint edits/restoration with one QA window and same-file backend recovery. The user app still needs its normal tray Quit/relaunch to load the new controller; force-stop was automatically rejected. Phase A stable target binding is in progress; bounded direction/capacity repair is implemented but still returns truthful capacity failures for crowded slides. Branching diagrams, verified chart insertion, richer layout commands and final voice rehearsal remain incomplete. The active user project is now **Understanding Pet Behavior r4, seven slides**, saved to Neon at 09:26:55 UTC; the r3 description below is historical.

## Product and delivery objective

You are extending the existing InsightOS Windows desktop companion. Help blind and low-vision people independently create, understand, check and revise visual work through conversation. Keep the current React, Electron and TypeScript backend; do not rebuild the product or turn it into a collection of unrelated sponsor demos.

The product promise is: **“Create work you can share, understand how it looks, and change it without needing to see or operate the screen.”** The strongest demonstration is a user directing an editable presentation, examining a decision branch, changing its logic, explaining a chart’s source and undoing a change entirely by voice.

Deliver in this order:

0. Keep edits in one working presentation and one managed PowerPoint view, with private revision backups.
1. Repair target binding, conversational recovery and content fitting.
2. Add an editable branching flowchart with branch explanations and targeted changes.
3. Insert a verified data chart into the same presentation.
4. Complete bounded visual layout controls and spoken visual review.
5. Rehearse, freeze the working scope and record the demo.

Build the shared layout and change-reporting foundation during steps 1–2 because subsequent features depend on it. Reliability is a release gate, not a parallel task to leave unfinished. Do not promise 100% success with arbitrary requests or guaranteed hackathon placement.

## Establish and preserve the baseline

Before editing, read `AGENTS.md`, `ARCHITECTURE.md`, `VERIFICATION.md`, `PRESENTATION-DEMO.md`, `STUDIO-DEMO.md`, `SUBMISSION-PLAN.md` and `SPONSOR-INTEGRATIONS.md`. Inspect current source, process configuration and Git changes. Preserve unrelated changes and private credentials. Do not print `.env`, connection strings or tokens.

At this specification’s checkpoint, the user’s active project is **Understanding Pet Behavior, revision 3, seven slides**, exported as `insight-presentation-r3-c9c2fa8c.pptx`. Slide two has 86 body words; slide seven, Pet Behavior Summary, has 57. The exact project was saved and verified in Neon. The current recovery evidence is `.local/pet-final-*`; `.local/resume-pet-recovery.ts` targets an obsolete revision and must not be run. Check fresh state before acting: a later user revision must supersede this checkpoint.

Use isolated copies and separate test project identities for validation. Never replace the active deck with a fixture, rewrite the user’s Neon project during tests, or close unrelated PowerPoint windows. Current Electron uses the compiled app served on port 4311; source edits alone do not update that process. Rebuild and restart the owned app only after preserving and verifying its state.

The most recent investigation found unresolved defects, despite earlier passing checks:

- A failed expansion used slide-two content when the user requested slide seven. The original intent trace is absent, so the precise originating turn is unproven. An isolated complete request selected seven correctly; a constructed follow-up, “For the summary,” became summary creation.
- Repeated expansion can manufacture an infeasible word budget. Repair guidance can demand compression after an insufficient-expansion failure.
- Correctly targeting the summary still produced an output that failed measured fit. Fixing target selection alone is insufficient.

Read the 08:42 entries in `AGENTS.md` and `VERIFICATION.md` and the private summary-target and repeated-expansion receipts. Treat historical test counts as historical evidence, not proof of current reliability.

### Existing capability and remaining work

| Area          | Existing implementation                                                                               | Required extension                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Conversation  | Typed Qwen intent, pending fields, cancellation, bounded failed-task context                          | Bind each action to stable slide identity; clarify and recover without changing its meaning |
| Presentations | Ordered V2 deck, stable slide IDs, 3–10 slides, 0–6 pictures, revisions, summary, undo, themes        | Capacity-aware revision and new typed graph/layout operations                               |
| Diagrams      | Editable linear processes with 3–5 stages                                                             | One decision, two labeled branches, graph edits and path explanations                       |
| Data          | Constrained Studio analysis, local reconciliation, actual Databricks verification, standalone exports | Frozen verified snapshot inserted into the active deck                                      |
| Chart export  | Native chart schema and renderer with embedded data                                                   | Command execution, complete provenance and chart-aware speech                               |
| Persistence   | Owner-scoped Neon presentation state, sources and eight-entry undo history                            | Versioned graph/layout/provenance migration, including history                              |
| Desktop       | Managed native opening and verified slide selection                                                   | Preserve this integration and truthful file-versus-view outcomes                            |

Hugging Face Qwen, ElevenLabs and Neon are live. Databricks is live in the constrained Studio workflow. Vultr is undeployed; Tiger Data and Gemini are absent. Do not add sponsors, switch models or fine-tune as a substitute for repairing application defects. These features need no additional service by design.

## Architectural decisions

### One working presentation before other changes

Every project has one stable working PPTX filename. Creation establishes it; text edits, image changes, summary insertion, undo, styling and resume reuse it. Existing projects may adopt their current verified filename. Render new revisions privately, preserve the prior bytes for recovery, then publish the validated revision to the working file. Revision numbers remain internal metadata rather than additional visible documents.

On Windows, refresh the exact owned working presentation safely: verify its file hash and saved state, capture its selection, close only that saved view if replacement requires it, atomically promote the staged file and reopen/select the intended slide. Keep unrelated PowerPoint windows and unsaved manual edits intact. A modified working file must produce an actionable conflict, never a silent overwrite or another visible fork. A brief reload is acceptable; do not describe this as direct object editing inside PowerPoint.

Retain the previous working bytes if promotion fails. If publishing succeeds but native viewing fails, preserve the committed revision and report that distinction. Use revision/hash/project identity with native callbacks: the same filename now identifies multiple successive revisions, so filename-only callbacks cannot verify current selection. Test repeated edit, summary, undo and resume against the same path and one owned window, including cancellation, locked files and stale callbacks.

### One authoritative project and one execution path

Keep the ordered deck as the source of truth. User speech, typed commands and accessibility controls must enter the same semantic pipeline. A language model proposes intent, bounded copy or graph relationships; trusted application code owns identity, source bindings, geometry, calculations, validation and commits.

```text
Continuous voice or typed input
    → complete/corrected turn with generation and turn ID
    → semantic intent using actual project and task context
    → resolve references and bind each operation
    → execute on an isolated candidate
    → validate content, graph or data invariants
    → measure layout and export a staged PPTX
    → verify package and commit the project revision
    → optionally open and verify the native view
    → report the actual change and persistence status
```

Keep content editing, diagram editing, data verification, layout and native viewing as separate services behind this pipeline. Avoid adding more overlapping phrase handlers to the controller. Extend existing modules incrementally; extract bounded executors where it reduces coupling, without a wholesale rewrite or unnecessary framework.

### Bind references to stable identity

Numeric positions are presentation views, not durable slide identity. Extend the interpreter’s context with each slide’s ID, index, title and type, plus separately recorded reviewed slide, verified native selection, last edit and pending operation.

Use a contract equivalent to this. These names are proposed, not existing APIs:

```ts
type BoundOperation = {
  operationId: string;
  turnId: string;
  generation: number;
  projectId: string;
  baseRevision: number;
  operation: PresentationOperation;
  refs: Partial<
    Record<
      'target' | 'source' | 'destination' | 'anchor',
      {
        slideId: string;
        reference: string; // grounded in the user's actual words
        basis: 'explicit-index' | 'unique-title' | 'relative' | 'context';
      }
    >
  >;
};

type TaskStatus =
  'awaiting_input' | 'executing' | 'recoverable_failure' | 'completed' | 'cancelled';
```

Validate explicit indexes, ordinals and unique titles against the real deck. An explicit “seventh slide” overrides selected slide two. A model cannot invent a reference to justify a different target. Bind every operation independently: “shorten slide two and read slide seven” must retain two targets. Bind every named reference within an operation as well: “move slide two before slide four” requires both source and destination IDs; insertion requires a stable anchor.

For a dependent plan such as “create a presentation, then edit its last slide,” allow typed references to an earlier operation's output. Resolve those references into a `BoundOperation` only after that prerequisite commits successfully. These references must never fall back to the previously active presentation. A failed prerequisite prevents its dependent operations from executing.

After binding, preserve the ID through follow-ups, native operations and reordering. Convert it to a current position at execution. Validate project/revision again after awaited work; never silently rebind an old numeric position after the deck changes. A compound plan may advance its expected revision only through its own verified commits. Cancel or replan if external state invalidates it.

Use this reference policy:

- Explicit index or unique title wins.
- A clarification amends the pending operation it answers.
- “That slide” can use the last discussed slide when unambiguous. If native selection and discussion disagree in a way that changes the answer, clarify.
- “For the summary” after an unresolved expansion should resolve the existing summary target, or ask “Expand the existing summary or add a new one?” It must not automatically create one.
- A fresh request replaces the failed executable queue. Failed operations remain diagnostic context until explicitly retried or corrected.

Do not persist unfinished executable queues to Neon or revive them on resume. Runtime bindings can remain outside the persisted deck schema.

### Commit changes transactionally and report evidence

Serialize project mutations and give each operation an idempotency key. Stage content and files first; validate generation, base revision and sources immediately before the commit boundary. Failed or cancelled candidates cannot change the active deck, history or current output. Duplicate completion callbacks cannot create another revision.

Atomically retain a bounded durable record of committed operation IDs and their result receipts with the local project manifest. A lost response followed by the same operation ID must return its existing result, including after restart, without another edit or undo entry. Define a supported retry window; expired unknown retries fail safely instead of replaying work. A new user request gets a new operation ID. Receipts are evidence, not saved executable queues.

Use the existing revision/export mechanism, with an atomic local manifest update that points to the verified file. Keep old valid output until the new file and state are durable. Recover orphaned staging files without promoting them. A file-write failure must never publish a new active revision.

Treat an edit as one user-level transaction. For a compound instruction about the same slide, stage its compatible mutations together and commit once. For independent sequential actions, retain a receipt per committed action and explicitly report partial completion if a later step fails. A cancellation after a commit does not silently undo that committed work.

Preserve separate outcomes for:

1. Structured content and PPTX saved locally.
2. PowerPoint opened and the intended slide selection verified.
3. The matching revision saved and verified in Neon.

Generate UI feedback and speech from one structured change receipt containing operation/project/revision IDs, changed slide IDs, actual content/graph/layout differences, file hash, native-view result and cloud-save result. A model may phrase that receipt naturally but cannot add claims. “Saved the picture; PowerPoint did not switch slides” is valid. “Everything is set” after failed navigation is not.

Never claim the pointer constructed a slide. Insight generates native editable files with PptxGenJS and uses separate desktop automation for opening and navigation.

## Phase one reliable conversation and content editing

### Preserve the working voice transport

Keep the current ElevenLabs Scribe capture, George speech, full-sentence handling, interruption and fallback behavior. Do not change microphone timing without measured capture evidence. Correlate transcripts, tasks, provider requests, native callbacks and playback with turn/generation IDs.

When the user interrupts, stop speech promptly, keep listening, cancel unfinished work and interpret the complete correction. Late audio, transcripts or provider results cannot revive an obsolete generation. Fragments arriving after dispatch need conversational interpretation, not a new regex for every phrase. Keep readiness and speaking/listening status accurate and keyboard accessible.

### Separate content generation from fitting

The content editor receives the bound slide, requested change, relevant source material and a feasible layout budget. It returns content fields only. Application code retains slide ID, type, images, graph identity, theme and typography unless the request explicitly changes them.

Replace the current expansion-budget behavior with a capacity analysis derived from the renderer’s geometry, font measurements, paragraph gaps and image space. An estimate is advisory; measured fit is authoritative. Never raise an estimated upper bound merely to satisfy a minimum-growth rule or force four paragraphs when three would fit better.

Use this bounded process:

1. Resolve the target and inspect the requested direction and available space.
2. Generate one candidate within realistic content and layout constraints.
3. Validate numerical claims, substantive change, required content, scope and measured fit.
4. Make at most one failure-specific repair request. Insufficient expansion asks for meaningful elaboration; overflow asks for a fitting arrangement that still meets the original goal. Neither receives contradictory generic guidance.
5. If no acceptable candidate results, return a typed recovery choice without changing the deck.

For expansion, prefer fuller explanations of existing claims; do not add unrelated presenter instructions or invent statistics. For shortening, preserve the requested essential information. A word-count difference alone does not establish usefulness, correctness or a successful edit. Number preservation is a deterministic check, not a guarantee of factual accuracy in all prose.

Do not silently shrink fonts, hide points, remove pictures or truncate text to pass validation. If content genuinely needs more room, offer one focused choice such as: “This slide is full. Shall I add a continuation slide?” Only offer a fallback that is implemented. An accepted continuation must split complete ideas deterministically, retain the original slide ID, assign a new slide ID, preserve unrelated slides and respect the ten-slide ceiling. It is one undoable change. If the deck is already full, explain the limit and offer a supported alternative.

### Typed failures and recovery

Use discriminated results rather than catching every issue as an undifferentiated exception:

```ts
type FailureCode =
  | 'ambiguous_target'
  | 'missing_source'
  | 'stale_revision'
  | 'invalid_content'
  | 'no_meaningful_change'
  | 'layout_capacity'
  | 'invalid_graph'
  | 'unverified_data'
  | 'provider_unavailable'
  | 'file_write_failed'
  | 'native_view_failed'
  | 'cloud_save_failed';

type RecoveryChoice = {
  id: string;
  label: string;
  // A validated typed intent; never an executable free-form instruction.
  intent: PresentationOperation;
};
```

Separate pending recovery choices from ordinary topic/folder fields. Include the bound task, failure category, candidate measurements, whether anything committed and available choices. A focused correction may update that pending task; a fresh unrelated request must proceed independently. No-op changes should explain the result without creating fake revisions.

**Phase gate:** repeat expansion and shortening on several slides, target a summary while another slide is selected, handle a target correction, recover from overflow, cancel mid-request, then make a fresh request after failure. Verify correct slide IDs, exact unchanged unrelated content, truthful receipts and no stale queue replay through actual Qwen calls. Do not begin feature release work until these cases pass or have correct, useful recovery.

## Phase two editable branching diagrams

### Graph representation

Add a distinct `flowchart` slide type. Keep existing linear `process.stages` supported; do not coerce every process into a decision graph. Initial scope is an acyclic graph with one decision, two labeled branches, up to seven total nodes, an optional shared beginning and optional shared ending.

```ts
type FlowNode = {
  id: string;
  kind: 'start' | 'process' | 'decision' | 'end';
  label: string;
};
type FlowEdge = {
  id: string;
  from: string;
  to: string;
  branchLabel?: string;
};
type Flowchart = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  orientation: 'vertical';
};
```

Use strict schemas, bounded labels and application-assigned IDs. Start with one deterministic vertical layout; add another orientation only after its fit and readback are verified. The model proposes relationships using temporary references during creation; the application validates them and assigns permanent IDs.

Graph rules: unique IDs, valid endpoints, no self-links, duplicate edges, cycles or disconnected nodes; exactly one start and one decision; exactly two distinct labeled outgoing decision edges; at least one end; every node reachable from start and able to reach an end. Start has no incoming edge, ends have no outgoing edges, other non-decision nodes have at most one outgoing edge. Allow at most one merge with two incoming edges; otherwise each non-start node has one incoming edge. Each branch must contain its own node before any merge. Count start/end/merge nodes in the seven-node limit.

Use a valid six-node demo: Start → Approval decision; Approved → Launch → Campaign launched; Rejected → Revise → Revision required. “Campaign launched” and “Revision required” are two distinct terminal nodes. Adding Accessibility review before Launch produces seven nodes. Do not promise a rejection loop back to approval in this first acyclic version.

### Typed graph operations

Extend the existing semantic operation union and executor with:

- `insert_flowchart`: graph request plus an explicit before/after/end insertion position bound to slide ID.
- `edit_flowchart`: validated patches such as rename node, insert process on an edge, remove process with reconnection, or relabel a branch.
- `read_flowchart`: whole diagram, named node, decision or particular branch.
- `set_layout` and `describe_layout`, shared with other compatible slide types.

Resolve node and branch references against current IDs and labels. Ask one focused question for duplicate labels or ambiguous “before approval.” Wording edits preserve topology; structural edits preserve unaffected node IDs, edges, branches and slides. Removing a decision, introducing a second decision, exceeding node limits or creating a cycle must produce useful recovery without a mutation. Undo restores the exact graph and layout.

Do not regenerate an entire graph for a small change. Apply patches to an isolated graph and validate the resulting graph before layout and commit. A canceled or duplicate patch must not create a revision.

### Layout and editable export

Compute a deterministic scene from graph structure: centered common beginning and decision, separated left/right branch lanes, optional shared continuation below. Measure wrapped labels, route arrows between shape boundaries and reserve space for branch labels. Validate slide bounds, forbidden overlaps, label collisions and unintended connector crossings. Intended connector-to-node attachment is not an overlap error.

Export real text, rectangles, a decision diamond and editable arrow/connector objects. Give objects stable names derived from slide/node IDs. Use the installed PptxGenJS capabilities; inspect actual OOXML before claiming connectors remain attached when a user moves a shape in PowerPoint. Editable arrows alone do not establish attached connectors. Include readable branch narration in speaker notes where supported and verify it in the exported package.

Do not add Google Drawings, a second graph editor or another graph library by default. Reuse React for a lightweight scene preview and an accessible node/branch list. A keyboard or voice user must be able to explore the graph without interpreting its visual arrows.

**Phase gate:** insert the six-node demo graph into a copy of an existing deck; explain the rejected branch; insert review on the approved branch; explain the actual delta; save and resume the seven-node graph; undo to restore the six-node graph. Verify graph identity, unrelated-slide equality, native editable shapes and rendered layout. Branch explanations must traverse stored edges, not guess from slide text or XML ordering.

## Phase three verified data in the current presentation

### Keep the supported source boundary

Use the existing Studio CSV/XLSX importer: at most 1 MB, 5,000 rows, with the six columns `date, location_id, region, revenue, operating_start, operating_end`. XLSX uses the first populated sheet and plain values; formulas and rich text are currently rejected. Preserve existing date, duplicate-row and location validation. Do not advertise arbitrary Excel analysis or financial advice.

Reuse spoken folder resolution and ask for a filename only when necessary. If a named folder contains several plausible datasets, clarify the choice. Source content and model-generated text are data, not authority to execute commands or SQL.

### Freeze verified results before insertion

Expose a reusable verification operation from Studio. Retain local integer-cent calculations and constrained Databricks queries, reconciling rows, totals and regional results. Never accept chart numbers, percentages or executable SQL from language-model output.

Define an immutable verified snapshot containing:

- Dataset identity and content fingerprint; analysis revision and comparison periods.
- Filters, continuously operating-location rule, included/excluded counts and chart scope.
- Exact ordered categories, series, values and units; baseline/current totals and defined growth calculation.
- Provider, verification timestamp and a safe query reference.
- Local evidence references and a hash of the reconciled result.

The current chart provenance lacks the dataset fingerprint, comparison and displayed scope; extend it deliberately. Respect the current 12-category ceiling. Any top-N selection must be explicit in title/readback, preserve a truthful full-total versus displayed-subset distinction and never imply omitted regions were analyzed as zero.

Before commit, recheck dataset fingerprint, Studio revision, filters, category selection, project and base revision. A change during verification invalidates the pending insertion. Databricks failure must leave the deck unchanged; local calculation must not be relabeled as Databricks verification.

### Insert without replacing the project

Implement `insert_verified_chart` through the active presentation executor and revision save path. **Do not call `writeStudioReports` for this operation:** its PowerPoint path creates a separate report and replaces presentation state. The requested chart must become a new slide in the existing ordered deck, with a stable ID, preserved other slides and one undo entry.

Disambiguate insertion from replacement. “Add a chart after slide four” inserts after that bound ID. “Replace slide four with the chart” requires an explicit replacement operation; do not infer destructive replacement from “to slide four.” Start with a clustered period-comparison chart and an evidence-based takeaway. Preserve the existing 3–10-slide limit.

Export a native chart and embedded workbook with matching values. Readback must use the verified snapshot plus the matching exported-file hash: current generic XML text extraction omits chart series. Answer “Where did that number come from?” with period, filter, aggregation, source identity and relevant local row evidence. Do not fabricate business causes for an observed change.

### Persistence and refresh semantics

Persist the chart’s values and bounded provenance as a dated snapshot in Neon. Keep raw source rows/workbooks, credentials and absolute source paths local. Extend privacy checks to new metadata. Resume reproduces the snapshot without inference or SQL and must not claim current live verification.

If source data or filters change later, retain the saved chart’s original snapshot and label its status accurately. Refresh is an explicit action requiring the source and new verification; it creates an undoable revision. If original row evidence is unavailable after resume, explain the saved calculation and disclose that source-level drilldown requires the original file.

**Phase gate:** actual HF interpretation → actual Databricks reconciliation → chart inserted into the existing deck → accurate value/source readback → save/restart/resume → verify exact chart values, provenance and history → undo the restored insertion. Inspect chart XML, embedded workbook and rendered output. Cover zero denominator, negative/decimal amounts, empty results and changes during verification. Studio-wide cloud resume is outside this phase.

## Phase four visual direction and spoken review

### A shared scene for rendering and explanation

Create one scene/layout representation used by export, preview, validation and spatial descriptions. Include a layout version, stable slide/object IDs, bounds in slide units, shape roles, text runs, font sizes, colors, image bindings, connector paths and reading order. The layout engine owns coordinates. The frontend draws the measured scene proportionally instead of independently reflowing its text in CSS. A missing font requires a declared fallback and remeasurement.

Keep semantic content and selected layout in the deck. Save a local export manifest tying the scene to the project revision, content fingerprint, renderer/layout version and output hash. Retain compatible layout versions or migrate explicitly; do not describe an old exported file using unrelated geometry from a newer renderer.

A scene does not become a second editable source of truth. If geometry and semantic content disagree, regenerate or fail validation rather than silently modifying content. Use exhaustive type switches: existing chart fallthrough branches must not accidentally handle a new flowchart variant.

### Bounded styling operations

Offer a small compatible layout catalog:

| Slide content     | Initial supported controls                                              |
| ----------------- | ----------------------------------------------------------------------- |
| Text              | Single body or two columns; larger/smaller title within measured limits |
| Picture with text | Picture left or right; image size within an explicit content region     |
| Picture-led       | Large image with caption when all existing content can remain visible   |
| Flowchart         | The verified vertical branch layout                                     |
| Chart             | Verified comparison chart with a short takeaway and source caption      |

Theme changes remain blue/light/dark initially. Keep typography settings separate from content rewriting. “Move the picture left” preserves words and source bytes. “Shorten the text and put the picture left” stages both requested changes as one transaction.

A large-image layout cannot hide existing bullet points. Offer a fitting alternative or an explicit content change. Two columns preserve a defined spoken reading order and complete content. Do not promise arbitrary object dragging, corporate-template import or synchronization of edits manually made inside PowerPoint.

### Ground every description in the saved result

Provide three distinct readbacks:

1. **Content:** the slide’s actual words, graph logic or verified chart values.
2. **Appearance:** spatial arrangement from the matched scene, including picture position, columns, branch lanes and measured text size.
3. **Change:** the committed before/after delta, such as “Added accessibility review on the approved branch before launch; the rejection branch is unchanged.”

Default to a short answer; expand on request. Avoid speaking hashes, internal IDs, raw URLs or diagnostic strings. Keep all speech interruptible. Distinguish a saved-slide description from a verified currently displayed native slide. If the output hash no longer matches because someone edited the file manually, do not describe stale structured state as that file’s current appearance.

Add deterministic checks for bounds, clipped text, forbidden overlaps, contrast and missing image descriptions. Use documented role-specific text-size floors with measured wrapping, not one font minimum that makes all diagrams impossible. Contrast calculations must state their limits, especially images and gradients; they are not a full accessibility certification. Generated image descriptions should be labeled as such and remain editable.

Offer narrow actions tied to actual findings: enlarge title if it fits, select a higher-contrast theme, move an image to a compatible region, or ask to split content. Do not invent a “looks perfect” verdict from a successful model call. Validate logical reading order and exported accessibility metadata where supported; report unsupported checks honestly.

## Persistence and compatibility

Introduce an explicit new deck/session version for persistent graph, richer layout and chart-provenance fields. Migrate supported V1/V2 sessions deterministically, including every undo snapshot, without model calls. Preserve all existing V2 slide IDs verbatim, source IDs, project identity and order. For V1 content without slide IDs, assign deterministic IDs from project identity and stable legacy source/image identity or unique slide role, consistently across current content and history. Do not use array positions as identity across reordered snapshots. If identity cannot be established safely, report a migration limitation instead of attaching an existing identity to unrelated content. Existing linear diagrams stay linear. Choose defaults that reproduce the old renderer’s actual appearance, not guessed left/right semantics.

Update schema validation, controller version checks, local manifests, store serialization, frontend consumers and compatibility projections together. Unsupported future versions must fail clearly rather than partially load and lose content. The compatibility projection is display-only and must never overwrite authoritative data.

Retain the eight-entry history bound, source hash verification, same-laptop source bindings and owner-scoped Neon access. Do not turn legacy standalone OOXML image patches into structured state by assumption. Any explicit conversion must verify preservation; otherwise retain the existing limitation.

Cloud saving must verify the matching revision, not merely receive an HTTP success. If local editing succeeds and Neon fails, retain local work and say that cloud saving failed. Resume/undo must reproduce content, graph identities, values, source references and layout settings without another inference request. Never imply presentation persistence also saves all Studio analytics state.

## Implementation map and sequencing

| Responsibility                       | Existing seams                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Intent schema and grounding          | `shared/presentation-intent.ts`, `server/computer/presentation-intent.ts`                                                   |
| Task lifecycle and reference context | `server/computer/presentation-conversation.ts`, controller planning context and target resolver                             |
| Ordered content and validation       | `shared/presentation-deck.ts`, `server/computer/presentation-deck.ts`                                                       |
| Bounded operation execution          | `server/computer/controller.ts`, existing revision/save methods                                                             |
| Feedback and voice                   | `shared/presentation-feedback.ts`, `src/voice.ts`, `src/voiceTurns.ts`, `src/ComputerCompanion.tsx`, `src/DesktopBuddy.tsx` |
| Persistence                          | `shared/presentation-session.ts`, `server/providers/presentationStore.ts`, local manifests                                  |
| Data bridge                          | `server/computer/studio-assistant.ts`, `server/providers/databricks.ts`, `shared/studio.ts`, `shared/analysis.ts`           |
| Preview and exploration              | `src/PresentationProjectPanel.tsx`, existing presentation styles                                                            |
| Native view                          | `electron/powerpoint-navigation.cjs`, `electron/presentation-windows.cjs`, existing IPC                                     |

New small modules for target binding, graph patches, layout scenes and chart snapshots are appropriate. Avoid duplicating existing source resolution, native control, authentication or storage adapters.

For parallel work, agree on shared contracts first. One owner handles conversation/transactions; another handles graph and layout; another handles Studio provenance and chart insertion. Keep migrations and integration under one owner. Read-only reviews can overlap immediately, but do not allow concurrent edits to the controller and schema files without explicit coordination.

Use these release checkpoints:

- **0 — one working document:** stable working filename, private revision history, guarded refresh and one owned native view. Verify this before feature expansion.
- **A — reliability:** binding, task recovery, feasible revision and receipts. No new diagram feature released before this passes.
- **B — diagram demo:** versioned graph, deterministic scene, native export, branch readback, targeted edit, undo and persistence.
- **C — verified data:** snapshot bridge into the same deck, source explanations and stale-result protection.
- **D — design controls:** compatible layout changes, richer scene readback and measured finding/fix flow.
- **E — recording:** production build, same-project native behavior and physical voice rehearsal.

If time runs short, freeze after a complete checkpoint. The minimum compelling release is A+B with truthful spatial/change readback. Chart insertion and extra layouts can remain clearly deferred. Do not add half-working features to the recording or claim all phases can be completed in a fixed two-hour window without measuring the work.

## Verification that measures the system

Use tests to protect invariants and state transitions, not to add another hardcoded handler for each sentence. Build reusable scenario families over sparse/dense text, images, summaries, linear diagrams, branching diagrams and charts. Exercise creation, clarification, correction, cancellation, retry, questions, reordering and stale callbacks across operation types.

Assert stable target IDs, changed-slide sets, history entries, file hashes, source integrity and truthful outcomes. Do not assert a particular model’s prose as the definition of correctness. Property tests can vary slide order, labels, lengths, graph patches and event ordering while checking the same rules.

### Required acceptance families

| Family                    | Required outcome                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target conflict           | Request summary seven while native selection is two; edit seven or clarify, never two                                                                                   |
| Fragment correction       | “For the summary” amends the unresolved edit or asks a precise question; no accidental new slide                                                                        |
| Dense expansion           | Add useful detail that fits, or offer a supported continuation; no contradictory shortening repair                                                                      |
| Fresh task after failure  | Execute the new request without replaying the old failed edit                                                                                                           |
| Interruption              | Cancel obsolete work and playback; capture the complete correction; report any already-committed change                                                                 |
| Graph revision            | Insert review on one branch; preserve the other branch; explanation and undo match actual edges                                                                         |
| Graph capacity            | Reject a loop, second decision or eighth node with an actionable explanation and no write                                                                               |
| Verified chart            | Exported chart/workbook values equal the reconciled snapshot; explain calculation and scope                                                                             |
| Stale data or deck        | Reject/replan after a source/filter/revision change; no stale commit                                                                                                    |
| Styling                   | Apply requested compatible layout; preserve text, images and reading order; describe measured result                                                                    |
| Persistence               | Save/restart/resume exact state and undo; no inference; isolate owner/project identities                                                                                |
| Crash and duplicate retry | Lose the response after commit, restart and retry its operation ID; retain one revision and undo entry. A manifest-publication failure cannot promote unverified output |
| Native failure            | Local file success remains distinct from failed opening; no false view or cloud-save claim                                                                              |

Run a small held-out real-Qwen suite after deterministic checks. Include complete requests, hesitation, unfamiliar paraphrases and multi-turn corrections across several deck types. Report attempted tasks, successful completions, useful recoveries, wrong actions, false claims, bounded retries and per-stage median/tail latency. Separate naturally occurring provider failures from injected faults. Save redacted receipts with model/provider and artifact evidence.

Set concrete release targets before evaluation: zero wrong-slide commits, lost content, stale commits or false success claims in the suite; every requested demo task must complete on a suitable fixture. For supported feasible tasks, target at least 90% completion within the bounded attempt policy on at least 20 varied multi-turn scenarios. Report the denominator and remaining failures. Clarifications are recoveries, not completed edits; impossible requests must not be counted as successful edits. These are finite release checks, not a 100% real-world guarantee.

Run relevant tests while implementing. At an integrated release gate run the repository’s production build/typecheck and unit suite, plus relevant browser orchestration checks. Inspect current package scripts rather than inventing commands. Do not rerun the entire suite after every documentation or prompt adjustment.

Verify actual PPTX packages, slide relationships, editable objects, chart workbook data and representative rendered slides. Use the presentation skill and bundled artifact runtime when generating/inspecting test decks; keep those tests isolated from the active project. A renderer producing PNGs and then exiting nonzero is not a clean process pass; record both results.

Report these evidence levels separately: mocked tests, real provider calls, generated-file inspection, installed PowerPoint operation and physical microphone rehearsal. A TTS endpoint success is not evidence that audio played or interruption worked.

## Demo and submission handoff

Prepare a small separate marketing-review demo project using user-provided images, a brief and a clearly labeled synthetic supported sales file. Do not overwrite the Pet Behavior presentation. Keep the story about independent authorship; finance is an example of work, not another product pitch.

Record a focused sequence after the supported phases pass:

1. “Create a presentation from my Marketing folder.” Use the known folder without a mouse-operated upload prompt when it is unambiguous.
2. “Add a campaign approval flowchart after slide three. Approved campaigns launch; rejected campaigns need revision.”
3. “What happens if it’s rejected?” Give the actual branch path.
4. “Add accessibility review before launch.” Show an editable seventh node and explain the change.
5. “Undo that.” Restore the exact previous graph.
6. If checkpoint C passed: compare the supported sales data, insert the verified chart into this deck and answer “Where did that percentage come from?”
7. If checkpoint D passed: move a picture left and describe the resulting arrangement.
8. Save to Neon and demonstrate exact resume if recording time permits; verify it before claiming persistence regardless.

Aim for a clear two-to-three-minute recording, trimming steps to the event’s actual rules. Include a natural interruption and one correction; do not stage false tool execution. A blindfold demonstrates hands-free operation, not usability validation with blind participants. Seek real user feedback when feasible and describe any research honestly.

The pitch is: **“Insight lets blind and low-vision people author visual work by conversation. You can create an editable presentation, follow a diagram’s branches, change its logic and check a chart’s evidence—all without relying on someone else to inspect the screen.”** Only include capabilities in the final pitch after they pass their gates.

Maintain the context documents with current architecture, limitations, verified sponsor use, exact evidence and remaining work. Keep Vultr and other unimplemented services out of submission claims. At completion, return the changed modules, actual acceptance results, remaining limitations, preserved user checkpoint and the exact spoken rehearsal instructions. Finish working through the current gate rather than replacing it with another list of future ideas.
