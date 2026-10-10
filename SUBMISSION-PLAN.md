# Knight Hacks IX: InsightOS submission plan

Official source: [Knight Hacks IX Devpost](https://knight-hacks-ix.devpost.com/), checked October 10, 2026. Its banner says **October 11, 11:00 AM EDT**, while its requirements say **submit by 10:00 AM** and **stop GitHub commits by 11:00 AM**. Use **10:00 AM EDT** as the submission deadline unless the organizers clarify it.

## Prize targets

1. **Hugging Face: Best Use of Open Source AI** (three winners). The two Qwen open models are essential to the buddy's command planning, code generation and screen description. This is the strongest sponsor fit, backed by live inference evidence.
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
| Functionality | Record a complete request through generated file, Python output and VS Code; have a typed backup if venue audio fails. |
| Design | Start with the compact buddy, expand it, and show the clear task transcript/output. |
| Wow Factor | Hands off keyboard: speak a request and show a real program written and run. |

The event page publishes these five criteria without numeric weights. No placement is guaranteed.

## Record this 90-second video

1. **0–10s:** Show the compact buddy hovering over the real Windows desktop. Say: “InsightOS is a voice-first desktop buddy for people who need a simpler way to use their computer.”
2. **10–40s:** Press Ctrl+Shift+Space, say “Write a Python program that prints the squares of one through five,” press the shortcut again. Show the transcript, AI-created file and actual Python result. If the physical mic has not passed rehearsal, record the typed command and describe it honestly.
3. **40–60s:** Ask “Open it in VS Code.” Show the generated file in the real editor. Explain that Hugging Face's open model chose the action and generated the code.
4. **60–75s:** Show a second capability that has passed a complete live rehearsal: either a controlled public-site click or selected-window AI description. Say that ElevenLabs handles the transcription/spoken reply only when those paths are actually heard in the recording.
5. **75–90s:** Show the Stop shortcut and the compact buddy again. Close with the problem solved, supported scope, and the names Hugging Face and ElevenLabs.

Use a real recording of the app. Keep the screen uncluttered and readable; show the result long enough to read. The Devpost description is drafted in [DEVPOST-DRAFT.md](DEVPOST-DRAFT.md).

## Must finish before submission

- [ ] Human-test the actual microphone and speaker with Ctrl+Shift+Space; rehearse once in the venue. Test a selected-window AI description if it will appear in the video.
- [ ] Record and attach the final narrated demo video. Current automated clips are not the final video.
- [ ] Create a **public** GitHub repository with the source and README. Confirm `.env` and `.local` are absent; check the public view while signed out. There is no Git remote yet.
- [ ] Add **both teammates** to the Devpost team and select Hugging Face and ElevenLabs sponsor prizes. Overall/category judging is automatic.
- [ ] Include screenshots and the clear project description; submit before **10:00 AM EDT October 11**. Stop GitHub commits by 11:00 AM EDT.
