# Sprout automatic states and speaking v007

Sprout now sleeps, wakes and celebrates through the production microphone and task controls. The new Blender-authored speaking loop gives him a planted explaining gesture: alternating buds with delayed tip follow-through and gentle chest expansion. Original v005 and Daylight v006 remain unchanged.

## Review the real integration

Open [the production buddy](http://127.0.0.1:5173/?desktop=buddy), or run `Start Sprout UI.cmd` for Electron. Clicking Sprout expands the panel. Activate the microphone to wake/start listening, or type to wake without opening the microphone. Quiet eligible inactivity lasts two minutes. Manual state selectors exist only in [character Studio](http://127.0.0.1:5173/?studio=buddy); Studio and the panel preview deliberately remain review fixtures.

The current asset is `/buddy/sprout-v007.glb`. **Daylight** selects this speaking refinement; **Original** still selects v005. Explicit v006 URLs remain available. A failed v007 load tries v006 then v005, with the successfully loaded asset's matching lighting and PNG fallback.

## Event/state map

| Real event                                  | Result                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial launch                              | Awake idle; microphone remains off.                                                                                                                                              |
| Explicit microphone activation              | Start existing capture immediately; Wake bridges startup, then Listening.                                                                                                        |
| Accepted speech / transcription / task work | Attentive Listening or Thinking; preempts decorative cues.                                                                                                                       |
| Reply requested but not yet playing         | Thinking / “Preparing reply”; no pretend speaking.                                                                                                                               |
| Actual output playback                      | New planted Speak loop; returns to the latest live state on interruption/end.                                                                                                    |
| Fresh confirmed completed task              | One JoyJump after its matching final reply ends; no duplicate Done nod. With no spoken reply, jump after work settles. Skipped or failed output also settles the reply boundary. |
| 120,000 ms eligible inactivity              | Existing voice owner stops capture/output first, then SleepEnter → SleepLoop. Quiet open listening is eligible.                                                                  |
| Pause microphone with no work               | Stop capture/output immediately, then sleep.                                                                                                                                     |
| Pause microphone while work runs            | Keep Thinking and let work finish; successful completion may jump once, then sleep. Failure goes to rest with its message retained.                                              |
| Explicit resume, new typing or new task     | Clear pending rest. Only explicit microphone activation opens capture.                                                                                                           |
| Mute spoken replies                         | Stop/disable output only; listening remains active.                                                                                                                              |
| Pause avatar motion / reduced motion        | Static presentation; capture and task ownership are unchanged.                                                                                                                   |
| Hidden surface / no GPU / remount           | Preserve logical sleep, consume unavailable or stale one-shots; never replay an old jump or start capture.                                                                       |

Meaningful typing, activation, keyboard commands, transcript scrolling and accepted speech reset inactivity. Hover, tilt, noise samples, renderer frames and polling do not. Connection, an active utterance, transcription, work, pending/playing output and short wake/joy cues block sleep and start a fresh eligible window afterward. An abandoned realtime partial expires after 30 seconds without renewed speech/commit so it cannot block sleep indefinitely.

## Ownership and changed files

- `src/sproutPresence.ts` owns the pure logical coordinator; `src/useSproutPresence.ts` supplies one deadline timer, latest-state rechecks and document/native visibility. These do not own media.
- `src/voiceActivity.ts` exposes semantic input and identified output lifecycle snapshots. `src/voice.ts` publishes actual playback/end/skip/failure signals, accepted speech and session-safe cleanup through the existing ElevenLabs/capture owner. Stale connections and media completions cannot revive a paused session.
- `src/ComputerCompanion.tsx` associates each accepted completed task with its final reply before clearing busy. Primary, existing bill and finance-import result paths share the observer. Existing task-ID/request-generation guards remain authoritative. Production manual Celebrate/Rest/Wake controls are removed.
- `src/buddyBehavior.ts`, `buddyMotionController.ts`, `buddyRenderer.ts` and `AssistantSignal.tsx` consume persistent presence and identified wake/joy events through the existing single mixer. Actual output playback gates Speak. Sleep stills/Zs work without a renderer; old one-shots are consumed on load/remount.
- `src/buddyAppearance.ts`, `DesktopBuddy.tsx`, `BuddyStudio.tsx` and `BuddyPanelPreview.tsx` use the explicit v007 Daylight profile and retained fallbacks. Status text distinguishes sleeping, preparing output and speaking.
- Focused presence, voice lifecycle, animation and browser tests cover the integration. `scripts/verify-sprout-speaking.mjs` reproduces the actual renderer comparison.

The existing React/Vite/Electron/Three stack, voice provider, backend/shared contracts, bright glass, compact dock, fixed text/control plane, native dimensions, draft and reading-position ownership are preserved. No dependency or CSS redesign was needed.

## Editable asset and preservation

[Blender handoff](ASSET-HANDOFF-v007.md) · [saved source](source/sprout-speaking-v007.blend) · [canonical GLB](sprout-speaking-v007.glb) · [manifest](sprout-speaking-v007.manifest.json).

Runtime/canonical SHA256: `dc609f0962b946bcae632988697d3dc12284e4405b03d80a3dd20950dd0fdb1c`; size **1,460,192 bytes**. Only Speak's 29 channels change. Geometry, materials, eyes, hierarchy and all ten other clips match v006; source and exported samples are independently compared. Root and feet remain fixed, paired shell/core morphs match, and the six-second loop closes exactly. The unchanged idle/sleep fallback poses reuse the approved v006 renders with recorded provenance.

## Verification

| Check                                  | Result                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused unit suite                     | **99 passing tests** across eight files: presence policy, semantic voice activity/media races, audio presentation, controller ownership, completion deduplication and actual exported eyes.                                                                                                            |
| Voice browser regression               | **21 cases verified**, including all 19 existing cases and two new delayed-acknowledgment/failure mute regressions. Tests use local Scribe/audio fixtures.                                                                                                                                             |
| Automatic production browser flow      | **Six passing cases**: exact deadline, stopped realtime/batch capture, no-GPU sleep, explicit wake, text-only wake, delayed/final reply → one jump, repeat completion suppression, pause-during-work → joy → sleep, resume cancellation, and absence of production manual selectors.                   |
| Behavior/appearance browser regression | **Seven passing cases** covering retained Studio clips, reduced motion/context loss, production completion/remount guards and v007→v006→v005 recovery.                                                                                                                                                 |
| Panel/tilt browser regression          | **12 passing cases**: fixed content bounds during corner tilt, menus/keyboard, draft/selection/scroll, visibility and appearance.                                                                                                                                                                      |
| Source and GLB                         | Reopened-source audit passes 145 Speak frames, 198 retained eye samples and 12 sampled containment poses. Independent preservation verifier passes. Khronos validation: zero errors, two inherited skin warnings, retained unused UV/old Speak accessor information.                                   |
| Native Electron                        | [Report](../../../artifacts/sprout-automatic-v007/buddy-panel-native-verification.json) passes actual main/preload IPC/security/bounds, reversal, retained draft/selection/scroll, workspace return, controlled bright/dark/busy captures, fixed-content tilt and 200% zoom with the served v007 hash. |
| Build and review                       | Default/public production builds and TypeScript pass. Focused independent voice and animation integration reviews found no remaining actionable defect.                                                                                                                                                |

The first voice run exposed a controlled-input capture ordering issue. Moving presence notification to the bubbling change handler restored draft retention; all three affected cases passed on targeted rerun. Counts above describe distinct verified cases, not repeated runs or a single combined execution.

The [actual renderer report](../../../artifacts/sprout-automatic-v007/speaking-review/report.json) records eleven moving studies: v006/v007 comparisons and v007 Idle/Listen/Think/Speak at 44/72/96/240 px, with matching served/disk hashes, eleven clips, zero asset/page/console errors and no API or microphone requests. [Comparison board](../../../artifacts/sprout-automatic-v007/speaking-review/speaking-comparison-b.png) · [Speaking sizes](../../../artifacts/sprout-automatic-v007/speaking-review/v007-speaking-b.png) · [Raw recorded motion](../../../artifacts/sprout-automatic-v007/speaking-review/video/page@7ea03fa3f458e4fc7c946d97380bc0d9.webm).

These selected visual phases use the actual renderer on a bright owned background; production automation is established by the separate workflow tests. Captures are unedited and sampled at wall times, not synchronized animation frames. Visual inspection confirms preserved Daylight material, readable navy eyes and unclipped feet. Bud articulation is subtle at 72/96 px. At 44 px a still does not strongly distinguish Speaking from Idle; motion and explicit status text carry that difference. The recording is review evidence, not a smoothness benchmark.

Actual production captures: [sleep after quiet Scribe](../../../artifacts/sprout-automatic-v007/browser/automatic-sleep-scribe.png), [no-GPU sleeping fallback](../../../artifacts/sprout-automatic-v007/browser/automatic-sleep-no-gpu.png), [final spoken reply](../../../artifacts/sprout-automatic-v007/browser/automatic-speaking-final-reply.png), [one success jump](../../../artifacts/sprout-automatic-v007/browser/automatic-success-jump.png), [paused work then rest](../../../artifacts/sprout-automatic-v007/browser/paused-work-success-then-sleep.png). Browser workflow captures use the transparent app on Chromium's backdrop. The [native bright panel](../../../artifacts/sprout-automatic-v007/buddy-panel-native-prism-bright.png) records the retained light appearance on an owned OS background.

Reproduce with the local development server available:

```powershell
npx vitest run tests/sprout-presence.test.ts tests/voiceActivity.test.ts tests/voice-lifecycle.test.ts tests/audioPresentation.test.ts tests/buddy-behavior.test.ts tests/buddy-motion.test.ts tests/buddy-completion.test.ts tests/buddy-eyes.test.ts
$env:INSIGHTOS_PROOF_TAG='sprout-automatic-v007'
$env:INSIGHTOS_PROOF_ASSET_VERSION='v007'
npx playwright test tests/e2e/voice.spec.ts tests/e2e/sprout-presence.spec.ts tests/e2e/sprout-behaviors.spec.ts tests/e2e/buddy-behavior-guards.spec.ts tests/e2e/sprout-daylight.spec.ts tests/e2e/buddy-tilt.spec.ts tests/e2e/buddy-panel-preview.spec.ts tests/e2e/desktop-panel.spec.ts
node design/buddy/sprout/40_verify_speaking_v007.mjs
node scripts/verify-sprout-speaking.mjs
node scripts/smoke-buddy-panel.mjs --controlled-backgrounds --zoom-review --asset=sprout-v007.glb --canonical=sprout-speaking-v007.glb --proof-tag=sprout-automatic-v007
npm run build
npm run build:public
```

## Limits

Voice/task checks use deterministic local fixtures, not a live ElevenLabs account or physical microphone. Production wiring is exercised through real controls; provider acceptance remains a separate check. Human screen-reader acceptance, physical native dragging, other display/DPI combinations and packaged installation were not established here.

This pass makes no fresh frame-budget claim and does not resolve the historical 83.340 ms first-use tilt interval. Multiple review canvases and video recording add overhead. Browser glass uses the existing PBR/reflection setup, not refraction of arbitrary desktop windows. Speaking is an authored explaining gesture, not phoneme lip-sync. Prior appearance details and limits remain in [v006 delivery](DELIVERY-v006.md), [light glass delivery](../frutiger-aero/SPROUT-CLEAR-GLASS-v008.md) and [sharp tilt delivery](../frutiger-aero/SPROUT-SHARP-TILT-v010.md).
