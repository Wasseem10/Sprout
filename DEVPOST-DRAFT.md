# InsightOS — visual work, directed by voice

> Working draft. The one-file editing repair is running. Branching diagrams, integrated charts and spoken layout review are being completed and tested in the next build. Update this draft after the final voice rehearsal before submitting; the public browser sample still shows an earlier bill workflow.

## One-line pitch

InsightOS helps blind and low-vision people explore data and create, review, and revise visual presentations using their own files and their voice.

## Inspiration

A presentation is more than its text. Its images, charts and diagrams communicate information that can be difficult to direct and check without sight. We wanted a person to be able to say what they want, hear what was made, challenge it, and change it independently.

## What it does

Insight lives in a floating Windows companion. The user presses Play and speaks naturally, including interrupting a reply to correct the task. They can name a folder on their Desktop, Documents or Downloads without uploading it or knowing its full path.

Insight uses original pictures and an optional brief to create a real editable PowerPoint. Slide count is independent of picture count. It reads slide content and image descriptions aloud. The user can navigate to a specific slide, replace an image, revise text or process steps, change the theme, and undo a supported revision. Edits refresh the same working presentation, with private recovery copies rather than a new visible document for every change. Explicitly saved projects and bounded undo history can resume through Neon on the same laptop with the original source files.

Our supporting data workflow shows why conversation matters. In a labeled fictional quarterly operations dataset, revenue appears to grow 52.2%. The user interrupts: “Wait, compare only the same locations.” Growth becomes 11.9%, because newly opened locations changed the original comparison. Insight exposes the contributing source rows, verifies the calculation with actual Databricks SQL, and creates an Excel workbook with formulas plus a six-slide PowerPoint with an editable chart. The exports match the verified calculation.

These are two supported workflows in the same companion. The image deck and the data report are not automatically merged. The prototype also opens common applications, supports web research decks, and performs bounded, verified navigation of named screen controls.

## How we built it

Electron provides the floating buddy, shortcuts and Windows integration. React and TypeScript render keyboard-accessible workspaces. Fastify validates actions and keeps credentials outside the renderer. Local tools write PowerPoint and Excel files directly; generating a deck does not require simulated mouse dragging.

Hugging Face hosted open models interpret requests, describe source pictures and screens, and plan structured presentation content. Qwen text and vision outputs pass typed validation; file operations and numerical calculations use deterministic tools. ElevenLabs Scribe handles streaming speech recognition, and Flash generates spoken replies using the British male George voice. The microphone stays available during replies and task processing, and cancellation prevents an older reply from playing after an interruption.

Databricks ingests the supported operations records and runs bound SQL. Returned results must reconcile against the source calculation before a report receives a Databricks verification label. Neon stores explicitly saved structured image decks and up to eight prior revisions in owner-scoped JSONB. Source-folder bindings and original picture bytes stay local, and resume checks their hashes.

Vultr deployment is prepared for an authenticated HTTPS AI backend; desktop execution remains on the user's laptop. **The server is not yet deployed or verified. Remove this paragraph or replace it with actual deployment evidence before claiming the Vultr prize.**

## Challenges and learning

The difficult part was keeping a correction consistent across conversation, files and cloud services. An image swap must change the actual embedded image; a changed data filter must invalidate the old reports; interrupted speech must not resume later. We fixed workflow routing so a selected image folder cannot intercept an Excel analysis report. We also made an explicit “verify with Databricks and create a report” request verify first, rather than exporting a local result and ignoring the provider request.

The voice pipeline has separate transcription, model planning and speech generation stages. We improved interruption and listening behavior without fine-tuning a model. It does not yet match the timing of an integrated speech-to-speech assistant in every situation.

## Verification and limits

- Actual source images were checked against the bytes embedded in generated slides. Native PowerPoint slide selection has been verified on this laptop.
- Actual Hugging Face and Databricks calls reconciled $126,000 to $141,000, 30 contributing rows and two excluded locations. The Excel formula caches, PowerPoint figures, native chart and its embedded editable workbook matched those numbers.
- Actual Neon save, backend restart, resume, swap and undo passed with original source hashes.
- Recorded/realtime ElevenLabs provider checks passed. Automated interruption tests use synthetic audio and mocked providers; physical microphone and speaker timing still need the final human rehearsal.
- Supported spreadsheet imports use a constrained six-column operations format. Arbitrary existing-PPTX editing, unrestricted Office mouse editing, completed purchases and application submissions are outside this prototype's demonstrated scope.
- A blindfolded demonstration by a sighted teammate is a rehearsal, not validation by blind users.

## Submission links

- Source: https://github.com/Wasseem10/insightos — publish the tested local changes before submission.
- Public sample: https://insightos-livid.vercel.app/ — earlier browser bill-calculation sample; it does not demonstrate local desktop access.
- Demo video: attach the recorded Windows companion workflow after rehearsal.

Hugging Face, ElevenLabs and Neon support the main presentation demo. Include Databricks when showing the separate verified data segment. Select Vultr only after the real deployment passes. The current demonstration does not establish OneEthos environmental impact or a Figma file submission.
