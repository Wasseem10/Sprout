# Sprout frontend integration into upstream 3d10375

Prepared October 11, 2026. This is a source audit and implementation plan; no source merge or running-app replacement has been performed.

## Accepted outcome

Use the current upstream application and backend, with the new Sprout compact/expanded panel as its presentation layer. Production defaults must be **Soft Original (`sprout-v008.glb`), animated live 3D, Pearl material at 40%**. Preserve the approved texture framing/corner treatment, glass buttons, crisp content, eye/body tracking, bounce, sleep/wake, speaking and completion gestures. Keep Original/Daylight/reference controls in the review studio, not in the final panel. Preserve the existing no-WebGL fallback and accessible/reduced-motion modes.

The old visible panel and dropdown should be replaced by one instance of our new `DesktopBuddy`. Its actions must still call the existing upstream handlers. Keep one conversation/task/voice owner. Do not mount the two panels together, replace the application with the simulated `BuddyPanelPreview`, or remove backend features to make the UI compile.

## What was actually compared

- Upstream: `Wasseem10/insightos`, `3d10375d0f915e0bd157d21c1e6a50ffa556ffc8`; matched `upstream/master` when fetched.
- UI: `zakariyaghazzol/insightos`, `ui/presentation-polish`, `b8780d8`.
- Common ancestor: `f1423fd84e554e307294a02f16c09bfa01bdaa8e`.
- `git merge-tree --write-tree --name-only b8780d8 3d10375d0f915e0bd157d21c1e6a50ffa556ffc8` found six conflicting paths. This simulation leaves the working files/index/branch unchanged.
- In that simulated tree, `server/` and `shared/` are byte-for-byte identical to the upstream tree. Our branch has not modified those paths relative to the common ancestor. This is useful evidence of backend preservation, not proof that the combined frontend calls every function correctly.
- Upstream adds extensive presentation, Studio, voice and native-work functionality. A textually clean merge alone is insufficient.

| Conflicting path            | Resolution policy                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ComputerCompanion.tsx` | Upstream owns orchestration, cancellation, imports, native continuations and workspace routing. Integrate our panel/presence/animation observers into that flow.             |
| `src/voice.ts`              | Preserve upstream capture, microphone readiness, transcription ordering, interruption and recovery. Add our passive audio/activity observers and reply identities carefully. |
| `src/DesktopBuddy.tsx`      | Use our visual structure and accessibility; retain every upstream capability, result card and callback.                                                                      |
| `tests/e2e/voice.spec.ts`   | Keep both sets of behavioral assertions and add combined voice/avatar cases. Do not discard a failing suite to resolve the conflict.                                         |
| `electron/main.cjs`         | Current text conflict is the folder-picker title; use neutral “Choose a folder for Sprout files.” Review the automatically combined window/native lifecycle separately.      |
| `index.html`                | Sprout branding with upstream's current visual-work scope; retain valid metadata.                                                                                            |

Also review automatically merged `src/App.tsx`, `electron/preload.cjs`, `package.json` and its lockfile. They combine native API/type declarations and dependencies even though Git reports no conflict.

## Integration sequence

1. **Checkpoint both histories.** Keep the UI commit and exact upstream SHA as rollback references. Fetch again before beginning; if upstream has advanced, repeat the dry-run and update this file's baseline. Coordinate edits to the shared voice/panel/Electron files while integrating; backend work can continue on separate branches.
2. **Create an isolated integration worktree/branch from the selected upstream commit.** Bring in `ui/presentation-polish` with a real merge, preserving both histories. Resolve each conflict by responsibility, never a blanket “take ours/theirs.” Keep the existing preview checkout available for comparison.
3. **Preserve upstream behavior first.** Keep the existing backend/shared modules and updated native/voice pipelines. Add a thin presentation adapter for voice, task and completion facts; the avatar must observe real state rather than start another microphone, TTS player or command loop.
4. **Promote the accepted appearance into production.** Complete the defaults/shared-CSS changes below and wire the new panel to all upstream actions/results. Keep review routes separate.
5. **Verify software integration in isolation.** Run the combined test/build gates below using disposable data and staged outputs. Review the final diff against upstream to confirm there are no unintended backend changes or lost capabilities.
6. **Rehearse on the computer with the real providers/native setup.** Use the integration branch and the machine's existing local configuration, with isolated test data. Record which physical checks pass; do not infer microphone/native success from browser mocks.
7. **Publish the tested integration commit for review.** Because the integration merge includes the existing UI history, the UI branch can fast-forward to the tested result, updating existing PR #1 without a force-push. If main advanced, bring it into the integration branch and repeat affected checks. The repository owner reviews and merges the PR; their Codex can help review/test but does not need to independently recreate the UI.

## Production presentation changes

### Asset identity and rendering

Add an explicit production default pointing to `SPROUT_SOFT_ASSET`. Do not merely redefine `SPROUT_CURRENT_ASSET`: it currently doubles as the v007 Daylight identity in classification, fallbacks, selectors and tests. Preserve explicit version identities and fallback order. Use the same default in `DesktopBuddy`, the full-workspace avatar and production preview entry points.

The production renderer stays live by default. “Still reference” is a labelled studio control only. Keep honest loading/fallback status; no still image should be mistaken for an animated model. Preserve the eye refraction correction from `b8780d8`.

### Pearl material

The accepted material is currently scoped to `.buddy-panel-preview.has-pearl-material` in `src/buddy-panel-preview.css`, so it is **not yet the production panel default**. Move the material rule to shared `src/buddy.css`, controlled by a production `DesktopBuddy` material prop/data attribute and a strength value. Defaults: Pearl and `0.40`; the review page passes its selected values explicitly.

Keep `/buddy/sprout-glass-material-v002.png`, 108% overscan, the existing lower-corner masks, approved center texture, blur and pointer-light treatment. Move forced-colors/reduced-transparency suppression with the material. Do not import the fixture page's layout CSS into production. Keep production text crisp during panel tilt.

### One menu and one set of handlers

| New visible control                        | Existing upstream behavior to retain                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Mic / pause                                | `toggleRecording`; upstream session lifecycle                      |
| Send / Ideas                               | `perform(request)` / `perform(text)` exactly once                  |
| Stop                                       | Upstream `stop`, including pending speech/task/native cancellation |
| Choose window                              | `setup('screen')`                                                  |
| Change save folder                         | Existing native folder/demo setup                                  |
| Mute spoken replies                        | `toggleSpeech`; distinct from pausing the microphone               |
| Settings                                   | Existing settings/connections modal                                |
| Full workspace                             | Switch dock off **without resetting the active tab**               |
| Hide                                       | Existing `hideBuddy()`/tray behavior                               |
| PowerPoint / Excel / code / Studio actions | Upstream actions and request contracts                             |
| Pause avatar motion                        | Our visual-only motion preference                                  |

Only retire superseded markup/CSS after mapping every action. Keep `StudioPanel`, `PresentationProjectPanel`, settings/connections, file pickers, result actions and backend/native modules. Include upstream's Windows backup-voice indicator, compact Studio results, presentation title/revision/ordered slide/source counts, and “Read the diagram.” Keep analysis-oriented suggestions instead of restoring older finance-specific assumptions.

## Behaviors that need deliberate reconciliation

- **Voice is the highest-risk seam.** Upstream keeps one live microphone across fallback transcription and TTS, joins segmented turns, handles urgent interruption, rejects playback echo/other-assistant speech, and prevents delayed replies. Our old fallback `speak()` clears media. Preserve upstream lifecycle and attach our meters/observers to its existing stream/playback; never recreate the old destructive path.
- **Actual speech state:** feed pending/playing/settled output and accepted utterances into our activity model, including realtime, batch and Windows fallback. Wait for real microphone readiness. Share one `ComputerCompanion` owner across compact/expanded/workspace views.
- **Task truth:** preserve upstream `turnId`, `baseRevision`, `projectId`, abort/generation checks, `interruptForSpeech`, ordered native continuations and verified slide outcomes. A rejected, stale or cancelled command must not mutate state or trigger joy.
- **Completion adapter:** our gate only understands legacy `state.task.status`; upstream also exposes `taskStatus`, `changes`, `failure`, `recovery` and separate native/persistence outcomes. Convert confirmed final success into one deduplicated completion event. HTTP 200, speech ending, clarification, partial success, recovery and unverified native steps do not prove completion. Delay joy until the corresponding reply finishes; new speech/work interrupts it.
- **Sleep policy:** preserve 120-second eligible inactivity, pause-to-rest and explicit mic wake without cutting off active work, incoming speech, playback or pending continuations. Muting spoken replies is not microphone pause. Recheck deferred sleep and task completion while mic is paused.
- **Window ownership:** retain our panel reveal/resize coordinator; only full-workspace sizing belongs in the surrounding `ComputerCompanion` effect. Two pill/panel sizing effects will race. Keep upstream native hide leases, cancellation and `showInactive()` so temporary hiding for computer actions does not stop voice or steal target-app focus.
- **Brand compatibility:** display Sprout. Add Sprout to existing spoken-command prefix/urgent parsing while preserving the Insight alias; do not rename IPC channels, storage keys, API paths or persisted project formats for branding.

## Required verification and acceptance

| Gate                        | Evidence required                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build/data contract         | Typecheck, combined unit suites, isolated frontend/server compile; complete upstream `server/` and `shared/` retained unless an intentional reviewed change is necessary.                                                                                                                                                       |
| Actual production panel     | `?desktop=buddy` loads live v008 in compact/expanded views with Pearl opacity `.4`; no fixture replies or manual state/render selectors. Review against the accepted studio at actual sizes.                                                                                                                                    |
| Actions/navigation          | Every button and menu action reaches exactly one upstream handler. Preserve draft, transcript position, active Studio/presentation tab, project selection/revision and results through expand/collapse/workspace return.                                                                                                        |
| Voice/state integration     | Combined voice lifecycle, desktop conversation, semantic conversation, presence, completion, audio, panel coordinator and accessibility tests. Include real result→reply→joy, stale completion, pending native continuation, pause during work, 120-second eligibility, interruption, muted replies and Windows voice fallback. |
| Rendering                   | Original/Daylight backups preserved; Soft live selection, gaze, blink/sleep/wake/joy/speaking, context loss, reduced motion, high contrast, 320px layout and native panel sizing.                                                                                                                                               |
| Cousin's configured machine | Physical microphone startup, hesitant multi-part request, interrupt during TTS/work, pause/resume, output mute, fallback speech, global shortcut/tray, folder/screen/app actions and native PowerPoint create/revise/read/undo/navigation with disposable projects. Compare existing behavior before/after.                     |

Upstream's own `AGENTS.md` states that `3d10375` is a **development source snapshot with unmet release gates**, while the accepted running build is a different checkpoint. Keep its accepted runtime and existing Pet Behavior r4 presentation untouched. Compile new code into a separate stage/integration checkout rather than overwriting that machine's root `dist`/`dist-server`. Source integration can proceed; production release still needs its existing acceptance requirements. This UI integration must not quietly release unrelated experimental backend behavior.

## Handoff for the configured computer

> Integrate the Sprout frontend using `design/integration/SPROUT-UPSTREAM-MERGE-PLAN.md`. Functional baseline is upstream `3d10375d0f915e0bd157d21c1e6a50ffa556ffc8`; UI baseline is `b8780d8` on `ui/presentation-polish`. Recheck upstream before starting. Work in a separate integration checkout and preserve the accepted running build and user projects. Keep current backend/shared/native/voice behavior; resolve the six audited conflicts by responsibility. Replace the old panel markup with the new panel, wire every existing action/result, and promote Soft Original v008 + live 3D + Pearl 40% into the production route. Do not use `BuddyPanelPreview` as the app. Reconcile voice observers, completion receipts, sleep policy and native resize ownership as described. Run combined software gates, then report physical microphone/native verification separately on this configured machine. Keep secrets local. Do not merge/deploy or replace the accepted runtime merely because compilation succeeds. Deliver the reviewed integration commit and evidence for the owner's PR merge.
