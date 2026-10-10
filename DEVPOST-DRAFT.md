# InsightOS — a voice-first desktop buddy for hands-free computer tasks

## One-line pitch

InsightOS lives above your desktop. Ask it to write and run a Python program, open the result in VS Code, browse a public site, or describe a screen you choose.

## Inspiration

Computer tasks often require many small visual and mouse steps. We wanted to explore a companion that makes a useful subset of those tasks available through a conversation, especially when looking at or operating the screen is difficult. This is an accessibility-motivated prototype; we have not tested it with blind users or certified it as assistive technology.

## What it does

The Windows Electron buddy stays in a compact, always-on-top pill and expands into a conversation when needed. Push-to-talk uses Ctrl+Shift+Space, and Ctrl+Shift+Backspace stops the current task. It can create a real Python file in a selected folder, run a bounded computation, display the actual output, and open the file in VS Code. It also controls a separate visible Chromium browser on public sites and captures only a window the user explicitly selects. The larger workspace is optional and preserves the same conversation.

Hugging Face open models plan flexible commands and generate Python. Its vision model describes a supplied screenshot. ElevenLabs transcribes recorded voice and produces spoken replies. A separate CSV data workspace demonstrates source-linked analysis, filtering, charts, explanation and undo. Browser checkout, personal fields and payments stop for manual review. InsightOS does not control arbitrary desktop apps or complete purchases.

## How we built it

Electron provides the native floating window, tray and global shortcuts; React and TypeScript render the interface. A Fastify backend validates each bounded action and keeps provider keys outside the renderer. Hugging Face inference calls use `Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway` for command planning/code generation and `Qwen/Qwen3-VL-30B-A3B-Instruct:deepinfra` for screenshot understanding in our verified account. ElevenLabs Scribe v1 and multilingual v2 handle speech input/output. Python source is saved to disk and run with a limited computation runner; Playwright drives a dedicated visible Chromium browser.

We used Codex to help write and test the code, then checked the actual application behavior and provider responses ourselves. Databricks, Neon and Vultr adapters/handoffs exist in the repository, but they are not part of the demonstrated live buddy and should not be listed as working sponsor integrations.

## Challenges and learning

The hardest problem was making the desktop assistant genuinely act while keeping its claims precise. We bounded AI-selected actions, inspect browser controls before interacting, limit Python execution, and stop at sensitive web actions. The voice chain needed cancellation so an old transcription or spoken reply could not continue after Stop. We also learned that configured credentials are not evidence of a working integration, so we tested real Hugging Face and ElevenLabs calls and recorded their outputs.

## Verified demo evidence

- A real Hugging Face request generated Python in the native buddy and the program ran with output `55, exit 0` (`artifacts/buddy-verification.json`). Another live request wrote and ran a Fibonacci program through 89.
- A real ElevenLabs transcription of synthetic WAV audio produced a command; Hugging Face generated its program; Python printed `1, 4, 9, 16, 25`; ElevenLabs generated reply audio (`artifacts/live-voice-rehearsal.json`).
- The configured Hugging Face vision model identified a synthetic image, and the native app captured a selected window. A physical microphone, audible laptop playback, and live interpretation of a user-selected window still need a manual rehearsal.
- The controlled browser opened and clicked a link on a real public site. No online purchase was attempted.

## What's next

Rehearse the physical microphone, speaker and selected-window description with the exact live demo setup; then test with blind and low-vision users. The present project is a supported-task prototype, not a general-purpose computer controller.

## Submission fields still required

- Public GitHub repository URL: **pending**.
- Final narrated demo-video URL: **pending**. Existing automated clips are not the final submission video.
- Add both teammates, select **Hugging Face: Best Use of Open Source AI** and **[MLH] Best Use of ElevenLabs**, and attach screenshots on Devpost. General Best AI judging is automatic.
- Do not select Figma Best Design unless an actual Figma file URL and picture of that file are supplied.
