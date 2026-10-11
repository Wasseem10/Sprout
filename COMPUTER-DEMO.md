# Computer companion setup and demonstration

## Focused video script

Record one story: **a household bill becomes an understandable, affordable decision through voice**. Target about two minutes, subject to the event's video limit. Rehearse the physical microphone and interruption before recording. Use the floating buddy alongside Bills & energy; keep the source PDF, comparison and browser review visible at the relevant moments.

| Scene          | What to show / say                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening        | “A utility bill should not take away your independence. InsightOS helps blind and low-vision people understand a bill and decide what to do through conversation.”                                                                  |
| Read           | “Read sample PDF bills.” Say “yes,” then confirm each bill. Show the original PDFs and extracted numbers. Keep the synthetic label visible.                                                                                         |
| Explain        | “Analyze my energy bills using Databricks.” Show **Verified with Databricks SQL** and the $195 → $240 comparison: the $45 increase comes from usage.                                                                                |
| First choice   | “I can afford sixty dollars a month.” “Choose duct repair.” “Prepare my energy application.” “Use demo details.” Show the fictional practice form and its verified review.                                                          |
| Change of mind | While Insight speaks, say “Wait, I can only afford thirty dollars a month.” Show the $41.67 option above the new limit and the withdrawn verification. Then say “Choose weather sealing.” The $25 option and browser review update. |
| Finish         | “Read the application back.” Explain: “Hugging Face reads text and scanned bills, Databricks checks the numbers, and ElevenLabs supports conversation. The user stays in control.”                                                  |

The practice form is owned by this project and is not an OUC or lender submission. Quotes and projected energy savings are assumptions. The real OUC program link is the actual local next step. If the microphone misses a phrase during rehearsal, resolve that before recording; textbox input proves the workflow but does not prove voice accessibility. The final recording and public repository URL still need to be supplied by the team.

## Bill-to-action recording sequence

Use the floating buddy for conversation and **Bills & energy** for visible results.

1. Say **“Read sample PDF bills”**, then **“yes.”** Insight finds two synthetic PDFs in the bundled sample folder, asks before reading, then uses Hugging Face to extract them. For real saved files, say **“find my latest two electricity bills in Downloads.”** Matching names need bill, utility, electricity, energy, statement or a supported utility-name hint. Use the native folder picker or Choose bills for other names.
2. Say **“confirm this bill”** for each document. Insight reads usage, days, energy charges, other charges and current total. Correct a number with **“usage is twelve hundred”** or the editable form. Missing, duplicate-month and inconsistent amounts block comparison. Text quotes are checked against the PDF; scanned-image quotes need human review.
3. The sample comparison shows **$195 → $240**, **$45 from usage**, **$0 from effective rate** and **$0 from other charges**. Say **“explain why my electricity bill changed.”** The bill does not identify an appliance.
4. Say **“Analyze my energy bills using Databricks.”** The connected warehouse verifies the four components; the workspace shows a truthful cloud verification label and statement reference.
5. Say **“I can afford sixty dollars a month”**, then **“choose duct repair”**, **“prepare my energy application”** and **“use demo details.”** Change your limit to **“thirty dollars a month.”** Insight withdraws the previous verification and flags the $41.67 choice as above budget. Say **“choose weather sealing.”** The $25/month fictional quote fits and the form is verified again. Savings of $7.50/month and 600 kWh/year are estimates.
6. Optionally say **“open the real OUC energy program.”** OUC determines actual eligibility and costs.

Revising a confirmed document: **“review bill 2026-09”** clears the comparison, then correction and confirmation rebuild it. **“Clear bill documents”** clears only the workspace. Evidence: `artifacts/bill-rehearsal.json`; `npm run test:bills` uses real HF calls and a verified browser form. Physical microphone/speaker interruption and blind-user validation still need rehearsal.

## Finance recording sequence

Use the floating buddy for the voice session and **Finance & Excel** for the visible results. Keep the recording to one story: a person who cannot see a spreadsheet can understand spending, correct a payment assumption, and take an editable plan into Excel.

1. Say **“Start the finance demo.”** The clearly labeled synthetic records show $3,000 income, $2,810 spending and a $190 recorded difference.
2. Say **“Why did my spending increase?”** Groceries increased $100 and utilities $90. These are record comparisons, not proof of causes.
3. Say **“What happens if I spend one hundred dollars less on groceries?”** Live HF interprets this flexible request. The hypothetical difference becomes $290; source records remain intact.
4. Say **“Check a $1200 loan at 12% APR over 24 months with a $30 limit.”** The estimate is $56.49 per month, above the stated limit.
5. Interrupt the spoken reply with **“Wait, change the payment limit to $60.”** Rehearse the actual microphone/speaker interruption before filming. The comparison updates; it does not approve financing.
6. Say **“Export and open my finance Excel workbook.”** Show Transactions, Monthly totals, Budget scenario, Payment comparison, Amortization and Read me. Excel formulas recalculate when assumptions change. Generated exports provide a verified download too.
7. Optional: **“Create a four-slide PowerPoint about my finance budget results.”** Office generation uses the verified aggregate figures.

Open the workspace's **Import transactions** control for real CSV/XLSX. Files need Date, Category and Amount; use optional Type=income/expense, or positive income/negative spending without Type. USD only, exclude transfers, maximum 3 MB/3,000 rows. Imports use the first populated sheet and cached source-formula results.

For a secondary community-energy segment, use the existing energy sequence below and **Local assistance** for OUC's public information. Clearly distinguish fictional quotes, estimated conservation and the owned application rehearsal from a real program or lender application. Do not claim measured savings.

**Sponsor recording:** show HF's live intent request. Show Databricks statement IDs only after entering credentials and clicking **Run on Databricks**. Show Vultr only after deploying the documented backend and completing its authenticated inference check. Account signup and adapter code alone are not live-use evidence.

Run `npm run dev`, or build then `npm start`. The desktop app opens a small floating buddy at the top of the screen. Click the face or chevron to expand its conversation. Drag the name area to reposition it. The minus button hides it to the Windows system tray; click its tray icon to bring it back, or right-click for Settings, workspace and Quit. Closing the buddy hides it; Quit actually exits.

Click the buddy's center **play** button once to start a conversation. It detects when you finish speaking, handles the request, speaks the reply, and keeps listening. You can speak over a reply to interrupt it. Click **pause** to end the voice session. **Ctrl+Shift+Space** toggles the conversation from other apps; **Ctrl+Shift+Backspace** stops the task and audio globally. Escape stops while InsightOS has focus. Spoken replies default on for the buddy and can be muted. No wake-word listening is implemented.

The expand-to-workspace button opens the larger tools view in the same window, preserving the conversation and active code. Return to desktop buddy restores the floating form. `electron . --workspace` opens the traditional view directly for testing. The buddy uses its own demo code folder automatically until another folder is chosen. Desktop control requires the local backend. Loading a hosted Vultr app does not give it control of your laptop.

## Setup

This laptop's ignored `.env` already points to Python and VS Code. On another machine, set `PYTHON_BIN` to an actual Python executable and `VSCODE_BIN` to `Code.exe`; avoid the WindowsApps Store alias. Run `npx playwright install chromium`.

`HF_TOKEN` enables flexible commands/code generation, even with `APP_MODE=sample`. `HF_MODEL_ID` selects text planning; `HF_VISION_MODEL_ID` selects screenshot interpretation. This team's account passed live checks with `Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway` and `Qwen/Qwen3-VL-30B-A3B-Instruct:deepinfra`. Other accounts must test their own selected routes. The adapter uses the [documented multimodal chat format](https://huggingface.co/docs/inference-providers/en/tasks/image-text-to-text). A configured badge only means a value is present; the provider Test button makes a real request.

Open **Settings & connections** to enter and test HF/ElevenLabs credentials; see [SPONSOR-SETUP.md](SPONSOR-SETUP.md). Saves apply immediately. The ElevenLabs test can select your first available voice if Voice ID is blank. `ELEVENLABS_API_KEY` enables microphone transcription; `ELEVENLABS_VOICE_ID` also enables spoken replies. Enable replies in Settings. Press play once and speak naturally; pause when finished. The user reported that the prior microphone flow created a PowerPoint and read web text aloud; rehearse the new continuous mode on this laptop. Keys stay in backend `.env`; restart after manually editing that file.

## Local demo

**Voice controls:** The center play button or Ctrl+Shift+Space starts continuous conversation. After you speak, a short silence sends the request automatically. While it speaks, say the next request to interrupt the reply. Press pause to end the voice session; Escape stops the task and audio when a dialog is not open. Enable spoken replies using the speaker button. A synthetic WAV passed through real ElevenLabs transcription, Hugging Face generation, Python execution, VS Code opening, and ElevenLabs reply audio (`artifacts/accessibility-voice-rehearsal.json`). Test the laptop microphone, speaker echo cancellation, and interruption before presenting. Databricks is not required for this companion demo.

### Accessibility demo

1. Say **“Write a Python program that prints the squares from one through five, run it, and open it in VS Code.”** The buddy creates a real file, runs it, opens the editor, and speaks the output. The demo folder is available automatically in the desktop buddy.
2. Say **“Open Google and search for accessible Python tutorials.”** The buddy reads numbered search results. If Google presents an automated-traffic challenge, it tells the user and uses Bing. Say **“Open result one”**, then **“Read this page.”** These actions use a dedicated visible Chromium browser, not the user's personal browser session.
3. Say **“What is on my screen?”** The desktop buddy captures one image of the main display, sends that image to the configured Hugging Face vision model, and speaks its description. To target another window, use **See my screen** and select it in the workspace.
4. Say **“Create a four-slide PowerPoint about preparing for a job interview.”** The buddy saves a real editable `.pptx` in the selected folder and opens it in PowerPoint. It reads the slide titles back. The sample deck was opened and visually inspected in PowerPoint (`artifacts/office-workflows.json`).
5. Say **“Analyze the Excel sales workbook, tell me the top region, and open it in Excel.”** The demo folder contains a clearly named synthetic `.xlsx`. The buddy reads its cells, calculates total revenue and top region, speaks those values, and opens the workbook in Excel. For your own workbook, choose its folder first. This prototype reads one `.xlsx` workbook in the folder, with a 3 MB, 3,000-row and 40-column limit; name the file when the folder contains more than one.
6. On a public form, say **“Fill Email with jane@example.com.”** The buddy reads back the value and field, then waits for **“confirm fill”** before typing. It never clicks a final submit, payment, or login control. A public practice form was filled without submission (`artifacts/form-assist.json`); the contact-field confirmation was verified with a local test form.
7. For a job application, say **“Open https://job-boards.greenhouse.io/k18inc/jobs/4065057008”**, then **“click Apply.”** The tested public listing reveals a real application form. The buddy identifies its fields and can help fill observed fields one at a time; contact details still require “confirm fill.” You review and submit the final application yourself. This exact listing may change after the rehearsal (`artifacts/job-apply.json`).
8. To show the real Windows pointer, open a public page with a clearly labelled navigation button in your normal browser and say **“Click the Apply button on my screen”** or **“Click the Next link on my screen.”** The buddy captures the main display, locates the named control using Hugging Face vision, checks that it is still there and has one matching accessible label, moves the cursor and clicks once, then captures the result. Say **“Scroll down”** to move the page. Rehearse with a harmless link first; an isolated local page passed real Hugging Face vision, Windows click and scroll, while the combined physical voice path still needs rehearsal.

For a short video, show the blindfolded buddy describing the screen, creating the deck, analyzing the workbook, and filling one practice form field with confirmation. Show the actual PowerPoint and Excel windows and the browser; describe the workbook as synthetic. Use the coding flow as a bonus if time permits. Record only after a physical microphone and speaker rehearsal.

The coding and browser sequence passed live integration checks (`artifacts/handsfree-workflow.json`); native main-display capture passed (`scripts/smoke-native-screen.mjs`), and a synthetic local button passed the configured Hugging Face vision locator, real Windows pointer click, replay rejection, and scroll (`node scripts/smoke-native-pointer.mjs --live-vision`). The Office workflows passed live Hugging Face and native application checks (`artifacts/office-workflows.json`). The combined physical microphone, speaker, and vision-guided desktop conversation still needs a human rehearsal on this machine. This is a supported-task accessibility prototype, not unrestricted desktop control or blind-user validation.

## Boundaries

Single-action commands remain available. Explicit code, presentation and spreadsheet requests can finish their stated create/analyze and open steps together. The controlled browser uses a fresh Chromium session; it does not attach to personal passwords. Its click/type targets come from observed controls and are checked again. Public HTTPS only; private destinations and downloads are blocked in that browser. A popup opened by an observed Apply control stays in the controlled browser after its URL is checked. The Windows pointer path supports an explicit navigation goal with up to six named clicks and fixed scrolls. It uses a fresh screenshot for every decision, requires one matching accessible button/link/menu/tab label for each click, and refuses ambiguous or changed targets. It stops if the screen does not visibly change. Custom controls without accessible names are declined. Arbitrary desktop typing and dragging remain unsupported. See PRESENTATION-DEMO.md for voice-folder, research-deck and screen-goal commands. Websites may require authentication or block automation; rehearse your target.

Payments, checkout, messages, login, passwords, identity/payment numbers, final submission and unknown buttons stop for manual review in the visible browser. Personal contact fields can be typed only after an explicit value and separate confirmation; websites may save data as soon as it is typed. No automatic purchase or job-application submission is implemented. The demo proves browsing and form assistance, not completed transactions.

Python executes verified disk source using a restricted computation runner: math/statistics/random imports and terminal output; no file/network/shell access or private attributes. Ten-second/64-KB limits apply. This is not an OS sandbox for hostile code. Unique filenames preserve existing files. Files remain on disk; computer state and captures are ephemeral. CSV project persistence is separate.

Stop terminates Python and closes the controlled page. It cannot undo completed writes or web actions. Voice Stop also interrupts recording, transcription and playback. Captures remain local until explicit cloud interpretation; Clear snapshot removes the selected image.

## Checks

`npm test` covers real disk/Python, tampering, invalid model actions, private URLs, actual browser controls, purchase/personal-field review and cancellation. `npm run test:e2e` includes the new UI, accessibility scans and narrow layout, plus CSV tests.

Close the running app/API, build, then run `npm run test:computer`. Production Electron opens a real file in VS Code, captures that selected window and navigates a public website. Only native dialog selection is stubbed; interactive OS-picker operation remains manual. Evidence: `artifacts/computer-verification.json`. `npm run test:desktop` still checks the CSV module.

## Energy, accessibility and affordability demonstration

This is a bounded accessibility workflow inside the existing desktop buddy. The bill math and application verification use deterministic tools; open models remain responsible for general planning, vision and generated presentations. The application rehearsal is a known, owned browser form, not proof of general autonomous lending applications.

Try these commands, with Play running:

1. “Start the energy demo.” Insight labels the bills synthetic and asks a payment limit.
2. “I can afford sixty dollars a month.”
3. “Choose duct repair.”
4. “Prepare my energy application.”
5. “Use demo details.” This explicitly authorizes fictional Alex Demo/homeowner details.
6. Interrupt or follow up: “Wait, I can only afford thirty dollars per month.” Insight invalidates the previous verification and flags the $41.67 payment above the new limit.
7. “Choose weather sealing.” The browser changes to $25/month, verifies all eight review values, and reads the corrected answers back.
8. “Save my energy plan.” Only this command saves the baseline, budget and application answers. “Resume my energy plan” restores them after a backend restart but requires new browser verification.
9. “Create a four slide PowerPoint about my energy savings plan.” The real Hugging Face model receives calculated findings and explicit synthetic/estimate labels. Applicant identity is excluded from presentation context.

The payment limit applies to the gross financing payment, not payment minus predicted bill savings. If a $30 budget is set, the hypothetical $41.67/month duct repair remains unaffordable even though its payment minus predicted savings is $26.67. No qualifying contribution, credit approval, rebate or achieved energy reduction is promised.

For personal bills, choose their folder with the buddy’s folder button, then say “import energy.csv.” CSV columns are `month,days,kwh,energyCharge,otherCharges`; use 2–36 distinct months. `data/energy-bills-synthetic.csv` illustrates the schema. Imported bills stay labeled imported, never silently replaced with sample values. Comparison separates consumption, effective variable charge per kWh, and other charges; daily usage accounts for billing-period length. It does not identify which appliance caused an increase.

“Record usage 1000 kilowatt-hours over 30 days” records a subsequent observation and compares daily usage against the baseline. This is not weather-normalized and does not prove that an upgrade caused a reduction. A synthetic baseline cannot substantiate real community impact.

“Analyze my energy bills using Databricks” sends six bound usage/charge values to a real SQL statement when configured. Returned billing contributions must match the independently checked totals. It errors without the host, warehouse and token; it does not substitute local results under a Databricks badge.

“Open the real OUC program” opens the official program page. Reference: https://www.ouc.com/solutions-programs/savings/efficiency-delivered/homeowners-renter/ (checked October 10, 2026). OUC’s process starts with a conservation audit; its own eligibility and actual offers govern. The owned rehearsal is independent of OUC and no real application is submitted.

Sponsor story: Hugging Face and ElevenLabs support accessible task execution; the energy workflow provides a BNY financial-process demonstration and a OneEthos local environmental use case with transparent projections and a measurement path. Neither challenge eligibility nor a prize is guaranteed. Neon and Databricks must be connected and rehearsed live before claiming use. Vultr remains optional inference hosting; Tiger Data is not included.
