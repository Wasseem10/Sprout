# InsightOS implementation prompt for reliable voice directed presentations

Continue the existing Windows InsightOS project. Make it possible for a blind or low vision person to create, review, and revise an editable presentation using conversation and their own files, without touching the mouse. Prioritize reliable intent handling and correct outputs, then improve slide design and editing. Finish a dependable recording workflow before adding integrations or broader computer tasks.

Work in this repository. Read `AGENTS.md`, `ARCHITECTURE.md`, `SUBMISSION-PLAN.md`, `SPONSOR-INTEGRATIONS.md`, `PRESENTATION-DEMO.md`, and current implementation before editing. Preserve unrelated working changes, the user's current Black History Month deck, and existing files. Keep credentials private. Implement the phases below in order; pass each phase's checks before starting the next.

## Current implementation to preserve

Hugging Face powers language and vision; ElevenLabs provides realtime transcription and George speech. Recent microphone changes preserve capture through pauses and interruptions. Keep those improvements. A new model or fine tuning is not the first fix for incorrect routing.

Picture presentations currently use a fixed cover, one content slide per source image, and a final process diagram. Their schema requires every image exactly once. One source image therefore produces three slides; changing a prompt alone cannot make six flexible slides. Generic, research, and Studio decks use separate formats. Real PPTX files are generated programmatically, with native editable text, shapes, and supported charts.

Image insertion into an existing Insight-generated deck uses a separate deterministic OOXML edit. It preserves the original file and unrelated slides. Native slide selection is a separate operation: a saved edit does not prove that PowerPoint navigated successfully. Preserve this distinction and never tell the user an action succeeded after a failed tool call.

Neon already saves and resumes supported structured picture projects and bounded undo history on the same laptop. Extra image patches and other deck formats are outside that saved contract. Databricks already verifies a constrained Studio spreadsheet analysis and exports matching Excel and PowerPoint reports. Inserting its chart into the active picture presentation remains an extension. Vultr is not deployed; Tiger Data and Gemini are not integrated. Freeze sponsor work during these phases.

## Phase one repair conversation and task state

Reproduce this exact sequence before changing the implementation:

1. User: “Can you create a, uh, PowerPoint about Black History Month in, um...”
2. User: “No, don't do that, actually.”
3. User: “Okay. Can you create a PowerPoint for me, uh, based on, um...”
4. User, after a pause: “Cyber Monday, and I want you to add in the first slide a picture from my, uh, marketing folder in desktop.”

The current parser can treat “Cyber Monday, and I want you” as the folder name. Fillers and commas in “my, uh, Marketing folder” break explicit extraction; an awaiting-name fallback then accepts the topic as a path. Cancellation and topic continuation also need semantic state beyond the short audio buffer.

Use one typed active task draft that distinguishes topic, total slide count, folder name, folder location, selected image, image destination, theme, pending question, and the last successful artifact revision. Resolve a user's reply against the field actually being requested. An explicit new topic replaces a stale creation draft; an ordinary follow-up retains useful context. Preserve the original transcript while normalizing conversational fillers for interpretation. Do not alter literal quoted folder names or paths.

For the Cyber Monday request, extract topic `Cyber Monday`, folder `Marketing`, location `Desktop`, and destination `slide 1`. Explicit folder phrases take precedence over bare-name guesses. Never use the whole request, topic, or action clause as a folder path. If a name remains ambiguous, ask one short question and retain the other fields. Cache a resolved folder location for the session unless the user changes it.

Keep hesitant continuations in the task draft even when the finite audio joining window expires. If the topic is missing, ask what the presentation should be about; do not execute an unfinished request or ask for an unrelated folder. Avoid increasing all voice silence thresholds and making every response slower.

Recognize whole-task cancellations such as “No, don't do that, actually” before folder or style routing. Cancel pending work and stale replies, clear its draft, and keep the conversation microphone available. Preserve completed files and report any already-completed write honestly. Distinguish cancellation from corrections such as “No, use dark blue instead.”

Use validated structured interpretation with the existing language provider, plus deterministic handling for clear commands. Treat tool results as authoritative. A request containing several instructions should become an ordered plan with explicit targets. Resolve missing required fields once; use a reasonable style default when the user says “you choose.” Speak brief confirmations without raw URLs, identifiers, or repeated questions. Preserve immediate speech interruption and suppress delayed replies from cancelled tasks.

Inspect `shared/spoken-folder.ts`, `shared/presentation-task-intent.ts`, `shared/presentation-edit-intent.ts`, `src/voiceTurns.ts`, `src/voice.ts`, and `server/computer/controller.ts`. Add meaningful regressions for the failure above, cancellation, topic continuation, filler-rich folder names, ambiguity, and style corrections. Consolidate conflicting parsing paths instead of adding another unrelated fallback.

## Phase two support flexible slides and useful spoken edits

Introduce a versioned ordered slide model with stable slide IDs and validated cover, text, image, chart, and process slide types. Support three to ten total slides independently of the one to six source images. Count the cover and requested diagram within the user's total. Allow an image on slide one and text-only slides. Repeat an image only when requested; never invent missing source images.

Update planning, rendering, editing, reading, slide navigation targets, undo, and supported persistence together. Preserve or migrate existing saved projects through a compatible versioned adapter. Do not discard old sessions. Keep existing file validation, source hashes, and safe local folder resolution.

Provide three consistent themes: clean blue, bright minimal, and dark minimal. Implement deterministic layouts for a hero cover, image and text split, large image with caption, concise text or metrics, native chart, and linear process diagram. Use readable typography, consistent spacing, sufficient contrast, and image sizing that preserves aspect ratio. Detect overflow; shorten content or choose a suitable layout rather than making text unreadable. Preserve source-derived facts and distinguish proposed plans from actual results.

Support these commands through the same active project:

- “Make six slides and put the Marketing picture on the first slide.”
- “Read slide two,” followed by “Make it less wordy.”
- “Make the text larger” and “Use dark minimal.”
- “Add a summary slide at the end.”
- “Move slide four before slide two.”
- “Undo that change.”

Resolve references such as “it,” “that slide,” and “the last slide” against the current task and verified selection or explicit reviewed slide. If two targets are plausible, ask once. Resolve slide IDs before mutating order. A navigation command should navigate; it should not regenerate the deck or merely focus PowerPoint.

Scoped edits must preserve unaffected slides, source images, chart data, and diagram structure. Write each successful revision to a new file and maintain bounded undo. Read back actual saved content. If native PowerPoint selection fails, report that separately from a successful file edit and offer a spoken recovery action.

Inspect `shared/presentation-project.ts`, `shared/presentation-session.ts`, `server/computer/presentation-project.ts`, `server/computer/presentation-image-edit.ts`, `shared/presentation-feedback.ts`, and `server/providers/presentationStore.ts`. Keep arbitrary imported corporate PowerPoint editing outside this phase.

## Phase three add a verified spreadsheet chart if time remains

Start only after the core creation and revision rehearsal passes. Reuse the existing Studio analysis result and Databricks verification to support “Add our verified sales chart to slide four.” Create an editable native chart with an embedded workbook. Values, labels, units, comparisons, and spoken explanations must match the verified result and its data revision; the language model must not calculate or invent financial totals.

Keep chart provenance and invalidate stale verification when the source or analysis changes. Updating a supported comparison should refresh the chart while preserving unrelated slides. If no verified dataset is available, ask for it rather than claiming a chart is verified. Reuse `server/computer/studio-assistant.ts` and the current import schema. Named-folder CSV/XLSX import is a further bounded extension; arbitrary workbooks and direct Excel UI edits are not assumed to work.

Extend the existing Neon project contract to preserve newly supported slide types and attachments before claiming they survive restart. Keep private source bytes and absolute local paths off the cloud. Preserve owner-scoped parameterized SQL and same-laptop source verification. “Resume my last presentation” already has a supported baseline; “resume yesterday's presentation” requires real date selection and should not be claimed until implemented.

## Acceptance and recording

The core is ready only when these checks pass:

1. The exact hesitant Cyber Monday sequence cancels the previous task and extracts the correct topic, folder, location, and slide destination without a bogus folder lookup.
2. One local picture produces exactly six editable slides when requested, including the picture on slide one. No obsolete image-count validation rejects it.
3. Spoken shortening, theme changes, slide reordering, summary insertion, and undo affect the intended slides and preserve unrelated content.
4. Speech remains captured through a natural pause. Interrupting a reply stops it, accepts the correction, and prevents stale execution or speech.
5. Repeated native slide two, next slide, and last slide commands report verified selection or a truthful failure. No success is inferred from opening an app.
6. Saving and restarting restore the supported project and revision history without losing newly supported assets. Unsupported persistence is explained before saving.

For the optional chart, compare actual PPTX chart values and embedded workbook contents with the verified analysis. Check refresh, readback, undo, and persistence. Inspect and render real exported files to verify layout, slide count, embedded assets, and editability. Run focused regressions, then the required unit suite, typecheck, and build after final changes. Synthetic browser or provider tests do not prove physical microphone behavior or installed PowerPoint control; complete a real voice rehearsal.

Record this short workflow: “Create a six-slide Cyber Monday campaign presentation. Use the picture in Marketing on my Desktop on the title slide. Make it dark minimal.” Then: “Read slide two. Make it less wordy. Add a summary slide. Undo that change. Save my presentation.” Add the verified chart only if phase three actually passes. Demonstrate the editable result and a spoken revision, without manual mouse intervention.

Update continuity and submission documents with implemented capabilities, outstanding limits, and actual validation. Report a short capability table and a usable recording script. Freeze further features once this workflow passes; a reliable accessible creation and revision loop is the submission priority.
