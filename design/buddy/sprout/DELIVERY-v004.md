# Sprout v004 and the glass panel

Implemented 2026-10-11 on `ui/presentation-polish`. Browser, source, compiled native behaviour, panel and performance/lifecycle checks pass. The [implementation brief](../frutiger-aero/GLASS-JOY-SLEEP-MASTER-PROMPT.md) and [v003 delivery](DELIVERY-v003.md) remain the design contract and previous delivery history.

## What changed

The panel retains its original rounded Prism border. Its previously near-opaque interior now admits background colour through a frosted cyan/lavender/coral surface. Text stays sharp on local reading surfaces, with a restrained identity backing and inset composer. Tools remains dense so underlying text cannot bleed through. The [matched glass study](../frutiger-aero/GLASS-PANEL-V005-STUDY.md) records rejected edge displacement, pinned open-source references, before/after captures and measured contrast.

Mic and Pause have symmetric zero padding and centred block SVGs. Studio styles no longer override the production control's foreground. Start/Pause semantics, interruption, direct Stop, microphone ownership and ElevenLabs remain unchanged. The button, HTML status and avatar share the actual phase adapter; starting microphone access is labelled accurately.

Five Blender-authored clips join the original six: an exuberant jump, sleep entry, quiet sleeping breath, wake and a restrained Done nod. Rest reclines with both feet forward and thin closed-eye creases; three small decorative Zs rise and disappear above its posed head. Reduced motion retains an authored sleeping still and one static Z. The camera reserves the complete motion envelope without resizing the native window or moving controls each frame.

The controller uses one mixer and one body/morph compositor. Full-body behaviours blend from the visible pose and temporarily own conflicting body/lid channels; Done and Click serialize on REACTION_ROOT. New tasks, voice activity, pet activation and Stop preempt decoration. Done accepts a fresh confirmed completed task from the current request generation, deduplicates hydrated/repeated results, and allows a small overlay during continuous listening/speaking. Silence, audio ending and `busy=false` do not imply success. No server/shared contract, finance logic or voice-provider module changed.

Workspace changes clear transient cosmetic requests before the replacement canvas mounts, preventing an old jump or completion from replaying. Manual controls report unavailable graphics/visibility; Celebrate also respects system reduction, the panel's motion pause and an unsettled/resting pose. Rest/Wake retain a static semantic pose when motion is paused.

## Use it locally

- [Character studio](http://127.0.0.1:5173/?studio=buddy): choose Idle, then Celebrate or Sleep; Wake returns upright. Done previews one acknowledgement while preserving Listening or Speaking. All studio signals are explicitly simulated and make no microphone/provider request.
- [Panel preview](http://127.0.0.1:5173/?studio=panel): the real panel with local messages and controlled backgrounds.
- Native companion: run `Start InsightOS UI.cmd` from the repository. The launcher reuses the existing API/UI servers and verifies this checkout's current GLB. In the expanded panel, Tools → Settings → Sprout offers Celebrate and Rest/Wake. Pause voice and finish the current task before starting manual rest/celebration.

The services at ports 5173 and 4311 were reused, not replaced. No production deployment or merge is part of this delivery.

## Implementation map

| Area | Files |
| --- | --- |
| Glass, voice alignment and task-caption spacing | [buddy.css](../../../src/buddy.css), [DesktopBuddy.tsx](../../../src/DesktopBuddy.tsx), [buddy-studio.css](../../../src/buddy-studio.css) |
| Cosmetic/completion adapter and settings | [ComputerCompanion.tsx](../../../src/ComputerCompanion.tsx), [buddyCompletion.ts](../../../src/buddyCompletion.ts), [computer.css](../../../src/computer.css) |
| Authored animation ownership and lifecycle | [buddyBehavior.ts](../../../src/buddyBehavior.ts), [buddyMotionController.ts](../../../src/buddyMotionController.ts), [buddyRenderer.ts](../../../src/buddyRenderer.ts) |
| Zs, fallback and studio previews | [AssistantSignal.tsx](../../../src/AssistantSignal.tsx), [assistant-signal.css](../../../src/assistant-signal.css), [BuddyStudio.tsx](../../../src/BuddyStudio.tsx), [BuddyPanelPreview.tsx](../../../src/BuddyPanelPreview.tsx) |
| Native z-order and launcher selection | [electron/main.cjs](../../../electron/main.cjs), [start-ui-preview.mjs](../../../scripts/start-ui-preview.mjs) |
| Regression evidence | [behaviour tests](../../../tests/buddy-behavior.test.ts), [completion tests](../../../tests/buddy-completion.test.ts), [integration states](../../../tests/e2e/sprout-behaviors.spec.ts), [integration guards](../../../tests/e2e/buddy-behavior-guards.spec.ts), existing studio/panel/replay checks updated for v004 |
| Reproducible visual/native checks | [glass audit](../../../scripts/verify-buddy-glass.mjs), [voice controls](../../../scripts/verify-buddy-voice-button.mjs), [native behaviours](../../../scripts/verify-sprout-behaviors-native.mjs), [panel smoke](../../../scripts/smoke-buddy-panel.mjs), [runtime proof](../../../scripts/verify-buddy-runtime.mjs), [Acrylic study](../../../scripts/study-buddy-acrylic.mjs), [proof defaults](../../../scripts/buddy-proof-options.mjs), [motion replay](../../../scripts/verify-sprout-motion.ts) |

The asset handoff below lists all new source/export scripts (24–30), final binaries, preserved intermediate studies and their provenance. No dependency manifest changed.

## Assets and fallbacks

The [asset handoff](ASSET-HANDOFF-v004.md) and [manifest](sprout-prism-v004.manifest.json) contain reproducible source/export settings, exact hashes, channel ownership and validation limits.

| Artifact | SHA256 |
| --- | --- |
| [Canonical GLB](sprout-prism-v004.glb) / [runtime GLB](../../../public/buddy/sprout-v004.glb) | `77d4b92bc5d06e440706243f6ac9e6745073ba6f98d173b972114fabb02bde7c` |
| [Editable Blender source](source/sprout-prism-behaviours-v004.blend) | `77df8aa69295604c48dec23a0bccb837e2cbdc012f5212c10b76cc37bbf38518` |
| [Runtime idle PNG](../../../public/buddy/sprout-v004.png) | `35c5e60cb729bc8fa24e93b6ae9c02e39f734f5ee8817a79b5e9984142c913a1` |
| [Runtime sleeping PNG](../../../public/buddy/sprout-v004-sleep.png) | `5057988aa1ff338d1661f8eea095cafa2f66653c08addc4933be63eac0e3e83d` |

The GLB is 1,463,568 bytes. All v003 geometry, materials, skins, morphs, embedded texture and six original animation streams are preserved. The nine-joint rig remains. The renderer falls back through valid v003/v002/Ribbon assets, with explicit older capability profiles; unsupported new actions are disabled. Source-backed PNGs keep the interface usable without WebGL, including graphics loss while resting. Live Blender's unsaved v002 scene and unrelated scenes were preserved.

## Verification

- Public and desktop builds pass. The Three renderer remains dynamically loaded; the existing large-chunk advisory remains.
- 37 focused unit tests pass across behaviour, completion, existing motion and panel coordination. These include the actual v004 export, paired morph ownership, interruption at 30/60/120 Hz, sampled geometry inside the fixed camera envelope, completion hydration/repeat/stale/unsuccessful states and panel reversal.
- Eleven focused browser integration checks pass for state controls, keyboard/focus/drafts, no-provider studio behavior, motion pause, GPU fallback/recovery including sleeping PNG, the new animations, current-generation completion cues, workspace remount guards and real 44/96/160px replay. Separate existing panel regressions cover selection/manual scroll, Tools/modal focus, narrow/reduced layout and immediate Stop.
- Glass browser audit: minimum recorded transcript contrast 11.9587:1, composer placeholder 7.7652:1; overall sustained minimum 7.0807:1 includes unchanged compact financial content. Normal/Large, 320/392px, controlled bright/dark/busy backgrounds and forced colours pass.
- Eighteen actual standalone/embedded voice-button cases have zero measured centre error, 44px targets and at least 8.6137:1 enabled glyph contrast. Active Pause remains available while busy.
- Khronos validation has zero errors, with two inherited non-root skin warnings and unused-UV information. Reopened-source, binary seams, exact original-data retention and sampled containment checks pass; see the asset handoff for their scopes.

## Native integration and timing

The [compiled behaviour report](../../../artifacts/glass-sprout-v004/native-behaviors/report.json) and [recording](../../../artifacts/glass-sprout-v004/native-behaviors/native-character-task-voice.webm) exercise actual Character settings, joy → rest/Zs → pause/resume → wake, semantic reduced-motion sleep, current-generation Done, hide/show and preserved drafts/focus. A synthetic oscillator passes through the real MediaRecorder/transcription callback into a local completed-task fixture; Done overlays Speaking while the conversation remains active. The PCM playback clock advances, and explicit Pause ends audio/tracks. The recorded small avatar is 96px collapsed and 72px expanded, at bottom/right and top/left work-area edges. Collapse deliberately interrupts cosmetics. HTML/Z geometry and exported-mesh camera checks are distinct from exhaustive native frame-pixel containment; non-preserved WebGL readback is excluded from acceptance.

The [native panel report](../../../artifacts/glass-sprout-v004/buddy-panel-native-verification.json) verifies real IPC acknowledgements/security, workspace round trip, topmost restoration, rapid reversal, modal/keyboard focus, draft/selection/manual-scroll preservation and 200% zoom. At 200%, the 816×1032 native window exposes a 408×516 CSS viewport inside the current 1920×1032 work area; Send remains visible and 44×44 CSS pixels. Controlled desktop-background captures require independent fixture-pixel validation; rejected captures are never evidence of material appearance.

The accepted 06:55:45 UTC [bright](../../../artifacts/glass-sprout-v004/buddy-panel-native-prism-bright.png), [dark](../../../artifacts/glass-sprout-v004/buddy-panel-native-prism-dark.png) and [busy](../../../artifacts/glass-sprout-v004/buddy-panel-native-prism-busy.png) OS captures each pass five unique opaque fixture-edge pixel checks before their cropped PNG is written. All three were visually inspected. An earlier overwritten set failed to show the controlled background and was excluded from public artifacts; the harness now refuses unvalidated compositor images. The accepted busy scene demonstrates native translucency, not OS-background blur.

The [compiled runtime report](../../../artifacts/glass-sprout-v004/buddy-runtime-native/report.json) passes on the recorded host. During its 5.862s interaction, avatar and document-clock intervals have **p95 16.8ms, maximum 16.9ms**. The Chromium presentation-feedback trace has 349 intervals, **p95 16.781ms, maximum 16.916ms**, none above 20ms/50ms. Five panel cycles retain stable owned resources, with the explicitly accounted 96px/72px transmission-target reallocations. Offscreen, hidden, minimized, restored and disposed lifecycle checks pass; pinned Three-owned cached resources are classified separately and invalidated by context loss. This timing scene does not exercise a current-task card; the later task-caption spacing-only CSS fix leaves its renderer and measured scene unchanged.

Clock/Chromium feedback is not hardware scanout, physical VRAM or the strict two-presented-frame input-response gate. The functional behaviour recording is separate from this timing run and does not claim measured jump/sleep frame performance under every workload.

## Desktop material boundary

The panel uses supported CSS glass. [Electron documents](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations) that CSS blur cannot sample other desktop applications. Browser captures therefore certify frosting of owned page backgrounds, not physical refraction of the desktop.

An isolated Windows Acrylic study applied the material to a real transparent Electron window over an owned opaque fixture. [Inspected native capture](../../../artifacts/glass-sprout-v004/acrylic-study/acrylic-window-wgc.png) shows frosting across the entire rectangular window, including the space outside the CSS rim. This does not preserve the required freestanding/rounded treatment, so Acrylic is not enabled in the app. The initial compositor attempts were unavailable; the final `none` capture showed only the fixture and is not accepted as a matched panel baseline. The source-backed web-content screenshots are separately labelled. No desktop capture or duplicate live transcript is used at runtime.

The native workspace round trip exposed a z-order failure on this Electron 44.7.0 Windows host: `setAlwaysOnTop(true)` and the explicit `floating` level both returned a non-topmost window. The [pinned implementation](https://github.com/electron/electron/blob/v44.7.0/shell/browser/native_window_views.cc#L1097) moves that level behind the taskbar. The app now applies the explicit `pop-up-menu` level after sizing on Windows, preserving the existing work-area clamp; other platforms retain `floating`. The native check confirms the workspace remains resizable/non-topmost, and the restored buddy becomes fixed-size/topmost again. This change adds no periodic resizing or new window.

Physical microphone/ElevenLabs, human screen-reader acceptance, other displays and packaged installation remain unverified by these local fixtures. No new third-party dependencies, paid generation, provider change, production deployment or merge was required.
