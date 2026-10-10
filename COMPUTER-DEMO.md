# Computer companion setup and demonstration

Run `npm run dev`, or build then `npm start`. The desktop app opens a small floating buddy at the top of the screen. Click the face or chevron to expand its conversation. Drag the name area to reposition it. The minus button hides it to the Windows system tray; click its tray icon to bring it back, or right-click for Settings, workspace and Quit. Closing the buddy hides it; Quit actually exits.

**Ctrl+Shift+Space** starts/sends voice from other apps. **Ctrl+Shift+Backspace** stops the task and audio globally; Escape stops while InsightOS has focus. Spoken replies default on for the buddy and can be muted. If Windows cannot reserve the voice shortcut, the panel directs you to its microphone button. No wake-word listening is implemented.

The expand-to-workspace button opens the larger tools view in the same window, preserving the conversation and active code. Return to desktop buddy restores the floating form. `electron . --workspace` opens the traditional view directly for testing. The buddy uses its own demo code folder automatically until another folder is chosen. Desktop control requires the local backend. Loading a hosted Vultr app does not give it control of your laptop.

## Setup

This laptop's ignored `.env` already points to Python and VS Code. On another machine, set `PYTHON_BIN` to an actual Python executable and `VSCODE_BIN` to `Code.exe`; avoid the WindowsApps Store alias. Run `npx playwright install chromium`.

`HF_TOKEN` enables flexible commands/code generation, even with `APP_MODE=sample`. `HF_MODEL_ID` selects text planning; `HF_VISION_MODEL_ID` selects screenshot interpretation. This team's account passed live checks with `Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway` and `Qwen/Qwen3-VL-30B-A3B-Instruct:deepinfra`. Other accounts must test their own selected routes. The adapter uses the [documented multimodal chat format](https://huggingface.co/docs/inference-providers/en/tasks/image-text-to-text). A configured badge only means a value is present; the provider Test button makes a real request.

Open **Settings & connections** to enter and test HF/ElevenLabs credentials; see [SPONSOR-SETUP.md](SPONSOR-SETUP.md). Saves apply immediately. The ElevenLabs test can select your first available voice if Voice ID is blank. `ELEVENLABS_API_KEY` enables microphone transcription; `ELEVENLABS_VOICE_ID` also enables spoken replies. Enable replies in Settings. Press the microphone, speak a command, then press it again to finish. Actual laptop audio is not verified yet. Keys stay in backend `.env`; restart after manually editing that file.

## Local demo

**Voice controls:** Ctrl+Shift+Space starts a recording; press again to send it. Escape stops the task and audio when a dialog is not open. Enable spoken replies using the speaker button. A synthetic WAV passed through real ElevenLabs transcription, Hugging Face generation, Python execution, VS Code opening, and ElevenLabs reply audio (`artifacts/accessibility-voice-rehearsal.json`). Test the laptop microphone and audible playback before presenting. Databricks is not required for this companion demo.

### Three-request accessibility demo

1. Say **“Write a Python program that prints the squares from one through five, run it, and open it in VS Code.”** The buddy creates a real file, runs it, opens the editor, and speaks the output. The demo folder is available automatically in the desktop buddy.
2. Say **“Open Google and search for accessible Python tutorials.”** The buddy reads numbered search results. If Google presents an automated-traffic challenge, it tells the user and uses Bing. Say **“Open result one”**, then **“Read this page.”** These actions use a dedicated visible Chromium browser, not the user's personal browser session.
3. Say **“What is on my screen?”** The desktop buddy captures one image of the main display, sends that image to the configured Hugging Face vision model, and speaks its description. To target another window, use **See my screen** and select it in the workspace.

The coding and browser sequence passed live integration checks (`artifacts/handsfree-workflow.json`); native main-display capture passed (`scripts/smoke-native-screen.mjs`). The combined physical microphone, speaker, and screen-description conversation still needs a human rehearsal on this machine. Rehearse these exact requests and record the actual result. This is a supported-task accessibility prototype, not unrestricted desktop control or blind-user validation.

1. **Choose folder** or **Use demo folder**. The native picker grants only that folder. Demo files go into `.local/code-workspace`.
2. Type **Write a Python Fibonacci program with 10 numbers**. Show the actual `.py` file, read-back source and hash. Without HF this is explicitly a starter template, not AI-generated code.
3. **Run my program** produces actual Python output `[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`, exit 0. **Open it in VS Code** shows the real file in the actual editor.
4. **Browse the web → Open practice book catalog**, then **Click A Light in the Attic**, **Read this page**. Headed Chromium operates the real [Books to Scrape](https://books.toscrape.com/) website. It is a practice catalog with example prices and no checkout, not a real purchase.
5. **See my screen**, choose the generated-code VS Code window and preview its capture. **Describe with AI** sends only that selected snapshot to Hugging Face. The model passed a separate synthetic-image check; rehearse this exact selected-window flow before claiming it worked in a live presentation. Capture again to refresh; this is not continuous monitoring.

Record the visible app, editor and browser. State whether commands are typed or genuinely transcribed and whether code is a template or model output. Screenshots: `artifacts/companion-code.png`, `companion-browser.png`, `companion-screen.png`. The existing CSV recording is a separate demo.

## Boundaries

One validated action per request, except an explicit code request can create, run, and open the file as one task. The browser uses a fresh Chromium session; it does not attach to personal passwords or other native apps. Click/type targets come from observed controls and are checked again. Public HTTPS only; private destinations, downloads and popups are blocked. Websites may require authentication or block automation; rehearse your target.

Payments, checkout, messages, login, personal fields and unknown buttons stop for manual review in the visible browser. No automatic purchase is implemented. The demo proves navigation and product inspection.

Python executes verified disk source using a restricted computation runner: math/statistics/random imports and terminal output; no file/network/shell access or private attributes. Ten-second/64-KB limits apply. This is not an OS sandbox for hostile code. Unique filenames preserve existing files. Files remain on disk; computer state and captures are ephemeral. CSV project persistence is separate.

Stop terminates Python and closes the controlled page. It cannot undo completed writes or web actions. Voice Stop also interrupts recording, transcription and playback. Captures remain local until explicit cloud interpretation; Clear snapshot removes the selected image.

## Checks

`npm test` covers real disk/Python, tampering, invalid model actions, private URLs, actual browser controls, purchase/personal-field review and cancellation. `npm run test:e2e` includes the new UI, accessibility scans and narrow layout, plus CSV tests.

Close the running app/API, build, then run `npm run test:computer`. Production Electron opens a real file in VS Code, captures that selected window and navigates a public website. Only native dialog selection is stubbed; interactive OS-picker operation remains manual. Evidence: `artifacts/computer-verification.json`. `npm run test:desktop` still checks the CSV module.
