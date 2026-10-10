# InsightOS — a voice-first desktop buddy for hands-free computer tasks

## One-line pitch

InsightOS lives above your desktop. Ask it to make a PowerPoint, analyze an Excel workbook, write and run code, browse the web, help fill a form, or describe what's on your screen.

## Inspiration

Computer tasks often require many small visual and mouse steps. We wanted to explore a companion that makes a useful subset of those tasks available through a conversation, especially when looking at or operating the screen is difficult. This is an accessibility-motivated prototype; we have not tested it with blind users or certified it as assistive technology.

## What it does

The Windows Electron buddy stays in a compact, blue-glass always-on-top pill and expands into a conversation when needed. One center play button starts a voice session: InsightOS detects the end of each utterance, responds aloud, and listens while speaking so the user can interrupt with the next request. Ctrl+Shift+Space toggles the conversation, and Ctrl+Shift+Backspace stops the current task. A spoken request can generate an editable slide deck and open it in PowerPoint; read a real `.xlsx` workbook, calculate a summary, and open it in Excel; or create, run and open a Python file in VS Code. It can search public sites, read numbered results, open an observed Apply control on a job listing, help fill an observed form field, and describe a one-time capture of the main display. It can also locate a clearly named navigation control on the visible Windows desktop, move the real pointer and click it once, or scroll on request. Personal contact fields require a second spoken confirmation. The larger workspace preserves the same conversation.

Hugging Face open models plan flexible commands and generate Python and slide outlines. Its vision model describes a supplied screenshot and grounds a named visible click target. ElevenLabs streams microphone transcription and produces concise spoken replies; long page text and tracking IDs remain in the visual transcript. ExcelJS reads spreadsheet cells for deterministic totals and group comparisons; PptxGenJS writes editable slides. A separate CSV data workspace demonstrates source-linked analysis, filtering, charts, explanation and undo. Browser workflows can navigate to checkout, but payment, credentials and final form submission require manual completion. Native desktop control is limited to one clearly named navigation click per turn or a fixed scroll, with fresh screenshot validation. InsightOS does not autonomously complete multi-step tasks across arbitrary apps or complete purchases.

## How we built it

A goal coordinator now observes the current browser, chooses a typed action, checks the result, and continues up to six actions before yielding. It retains questions and refinements within the current session. A live Hugging Face rehearsal navigated a public practice bookstore into Travel and read its first displayed title and price from the page. Explicit user preferences can persist locally or in Neon; an authenticated inference service is ready for Vultr hosting. Neon and Vultr remain unverified pending real account connections, so these are implementation details rather than demonstrated sponsor claims.

Electron provides the native floating window, tray and global shortcuts; React and TypeScript render the interface. A Fastify backend validates each bounded action and keeps provider keys outside the renderer. Hugging Face inference calls use `Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway` for command planning/code generation and `Qwen/Qwen3-VL-30B-A3B-Instruct:deepinfra` for screenshot understanding in our verified account. Electron captures the main display and sends a one-use screen token to its isolated bridge; Windows pointer calls move and click at a vision-grounded coordinate only after the target area is checked again. ElevenLabs Scribe v2 Realtime uses a temporary token for streaming recognition; Flash v2.5 supplies short replies, with recorded Scribe as fallback. Python source is saved to disk and run with a limited computation runner; Playwright drives a dedicated visible Chromium browser. Recent conversation context supports follow-ups, and bounded job/product workflows continue from search into an observed result.

We used Codex to help write and test the code, then checked actual application behavior and provider responses. The buddy now has an Excel-to-Databricks SQL path for totals, averages and category ranking, but warehouse credentials and live verification are still pending. Databricks, Neon and Vultr must not be listed as demonstrated live sponsor integrations until their actual services pass.

## Challenges and learning

The hardest problem was making the desktop assistant genuinely act while keeping its claims precise. We bounded AI-selected actions, inspect browser controls before interacting, limit Python execution, and stop at sensitive web actions. The voice chain needed silence detection and cancellation so it could keep a conversation going without sending silent audio or continuing an old transcription after Stop. We also learned that configured credentials are not evidence of a working integration, so we tested real Hugging Face and ElevenLabs calls and recorded their outputs.

## Verified demo evidence

- A real Hugging Face request generated Python in the native buddy and the program ran with output `55, exit 0` (`artifacts/buddy-verification.json`). Another live request wrote and ran a Fibonacci program through 89.
- A synthetic WAV passed through real ElevenLabs transcription, Hugging Face code generation, Python execution, actual VS Code opening, and ElevenLabs reply audio. Python printed squares `1, 4, 9, 16, 25` (`artifacts/accessibility-voice-rehearsal.json`).
- A live Google request encountered verification, and the buddy announced its Bing fallback, read numbered results, then opened the first observed result (`artifacts/handsfree-workflow.json`).
- A live Hugging Face request generated a four-slide editable PowerPoint that opened in the installed app. The same flow read a six-row synthetic Excel workbook, calculated revenue of 6,200 and East as the top region at 2,700, then launched Excel (`artifacts/office-workflows.json`).
- The public Selenium practice form accepted a spoken field instruction; the password and submit controls remained blocked (`artifacts/form-assist.json`). A local form test verified personal-contact confirmation before typing.
- A public Greenhouse job listing exposed an Apply button that opened its real application form. The buddy identified text fields but blocked final submission; no personal information was entered (`artifacts/job-apply.json`).
- The configured Hugging Face vision model interpreted a real buddy screenshot, and native Electron captured the main display on request. In an isolated Electron smoke, the configured Hugging Face vision model located a synthetic local button, and the real Windows cursor clicked it, scrolled that page, and rejected reuse of the capture token. Automated browser tests verified a new utterance interrupting speech during an in-progress task. The physical microphone/speaker and combined voice-guided click still need a demo rehearsal.

## What's next

Rehearse the physical microphone, speaker, and vision-guided desktop click with the exact live demo setup; then test with blind and low-vision users. The present project is a supported-task prototype with bounded native pointer actions.

## Submission fields still required

- Public GitHub repository URL: **pending**.
- Final narrated demo-video URL: **pending**. Existing automated clips are not the final submission video.
- Add both teammates, select **Hugging Face: Best Use of Open Source AI** and **[MLH] Best Use of ElevenLabs**, and attach screenshots on Devpost. General Best AI judging is automatic.
- Do not select Figma Best Design unless an actual Figma file URL and picture of that file are supplied.
