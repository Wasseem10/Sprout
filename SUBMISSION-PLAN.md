# Knight Hacks IX: InsightOS submission plan

Official source: [Knight Hacks IX Devpost](https://knight-hacks-ix.devpost.com/), checked October 10, 2026. Its banner says **October 11, 11:00 AM EDT**, while its requirements say **submit by 10:00 AM** and **stop GitHub commits by 11:00 AM**. Use **10:00 AM EDT** as the submission deadline unless the organizers clarify it.

## Prize targets

1. **Hugging Face: Best Use of Open Source AI** (three winners). The two Qwen open models power command planning, presentation outlines, code generation and screen description. This is the strongest sponsor fit, backed by live inference evidence.
2. **[MLH] Best Use of ElevenLabs** (one winner). Transcription and speech generation passed real API checks. Physical microphone and speaker use still need a human rehearsal before the live demo.
3. **Best AI Hack** (automatic category judging). Show the completed voice → model → real computer action → output loop.
4. **Adobe: Prettiest Hack** (three winners). Select it if the final video clearly shows the compact buddy, expanded conversation, typography and cohesive colors. The prompt judges visual quality; no Adobe API is required.

Gemini is **not required** for these targets. Overall and Best AI judging are automatic; select Hugging Face, ElevenLabs and Adobe as sponsor/category prize entries on Devpost. Sponsor prizes require attending the announced judging room(s) Sunday morning.

**Do not select yet:** Tiger Data has no integration or time-series feature in InsightOS; a database added only to qualify would be weak. Neon has an adapter but no live database or buddy-critical persistence. Databricks has an analytics adapter but no verified warehouse and tells a different story from the desktop buddy. OneEthos requires measurable local environmental impact, which this prototype does not have. Figma requires an actual editable file URL and screenshot. Vultr, Gemini, Solana, Presage, AMD, GoDaddy and the hardware tracks have no meaningful demonstrated use here. The team is not eligible for Best First-Time Hacker.

## Rubric: what the demo must show

| Published criterion | InsightOS proof to show |
| --- | --- |
| Originality | A floating desktop buddy that completes a supported hands-free task rather than another website chat box. |
| Technical Understanding | Explain Electron/native shortcuts, Hugging Face models, ElevenLabs speech, bounded tools, and where Codex helped. State limitations plainly. |
| Functionality | Show one-button conversation creating an editable PowerPoint and following a real job listing's Apply control to its form. Show Excel analysis as a second recorded example; have a typed backup if venue audio fails. |
| Design | Start with the compact buddy, expand it, and show the clear task transcript/output. |
| Wow Factor | Hands off keyboard: press play once, speak two requests without touching the microphone again, and show real PowerPoint and a real application form opening. |

The event page publishes these five criteria without numeric weights. No placement is guaranteed.

## Record this 90-second video

1. **0–10s:** Show the compact buddy hovering over the Windows desktop. Click its center play button once. Say: “InsightOS helps people use a computer through conversation.”
2. **10–33s:** Ask for a four-slide PowerPoint. Let the buddy send after silence, reply, and listen again without another click. Show the editable deck opening in PowerPoint.
3. **33–62s:** Show the rehearsed public job listing. Say “click Apply” and show the actual form fields the buddy finds. State clearly that the person reviews and submits the application. The tested listing and evidence are in [COMPUTER-DEMO.md](COMPUTER-DEMO.md) and `artifacts/job-apply.json`.
4. **62–79s:** Ask what is on the screen, or use the reliable Excel result if vision is slow. For Excel, label the workbook as synthetic and show the real calculated East/2,700 result.
5. **79–90s:** Show pause and Stop. State that Hugging Face handles planning/slides/vision and ElevenLabs handles the conversation.

Use a real recording of the app. Keep the screen uncluttered and readable; show the result long enough to read. The Devpost description is drafted in [DEVPOST-DRAFT.md](DEVPOST-DRAFT.md).

## Must finish before submission

- [ ] Human-test the new play → speak → reply → listen loop on the actual microphone and speakers; rehearse once in the venue. Test a screen description if it will appear in the video.
- [ ] Record and attach the final narrated demo video. Current automated clips are not the final video.
- [ ] Create a **public** GitHub repository with the source and README. Confirm `.env` and `.local` are absent; check the public view while signed out. There is no Git remote yet.
- [ ] Add **both teammates** to the Devpost team and select Hugging Face and ElevenLabs sponsor prizes. Overall/category judging is automatic.
- [ ] Include screenshots and the clear project description; submit before **10:00 AM EDT October 11**. Stop GitHub commits by 11:00 AM EDT.
