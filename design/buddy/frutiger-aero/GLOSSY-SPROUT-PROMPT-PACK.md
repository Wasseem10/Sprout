# Glossy Sprout — focused worker prompts

Revision **1**, **2026-10-10**. Use these with [the full revision-6 launch prompt](SPROUT-LAUNCH-PROMPT.txt). These retained assignments drove the [v003 implementation](../sprout/DELIVERY-v003.md); its [audit](../sprout/GLOSSY-REFINEMENT-AUDIT.md) records actual outcomes. Paste the full launch prompt into the main implementation session. The lead can delegate the assignments below to subagents; separate independent app chats are unnecessary.

The shared brief controls art direction, scope and acceptance. Workers read it before editing. Preserve delivered v002, voice/backend behavior and the old acceptance ledger. Current code/delivery records take precedence over historical inventory in older workflow files.

## Ownership and handoffs

| Owner | Files and responsibilities |
| --- | --- |
| Integration lead | Shared adapters such as src/AssistantSignal.tsx and src/ComputerCompanion.tsx; src/BuddyStudio.tsx and studio styles; final runtime asset promotion; native bounds/coordinator changes only if necessary; final docs, branch/PR, builds and evidence acceptance |
| Material worker | New versioned assets, scripts and proof exports under design/buddy/sprout/; the sole live Blender editor |
| Runtime worker | src/buddyRenderer.ts, src/buddyMotionController.ts, relevant focused motion tests; Three material/environment integration and attention/goo |
| Panel worker | src/DesktopBuddy.tsx, src/buddy.css, optional new Tools/Ideas UI component, focused panel tests |
| Verification worker | Newly named refinement proof scripts/artifacts and independent review; existing proof-script changes only after assignment; no product changes by default |

Do not edit another owner's files concurrently. Hand off required prop changes, geometry bounds, asset paths, manifest changes or defects as concrete requests. The lead makes shared changes after coordinating owners. src/useBuddyPanel.ts, src/buddyPanelCoordinator.ts, src/desktopVisibility.ts and electron files are preserved by default; any necessary change belongs to the lead. Voice/provider/server/shared files are outside this pass.

Parallel execution: materials, runtime attention on v002 and panel cleanup can start independently. Runtime glass integration waits for the material export/manifest handoff. Full proof waits for a stable integrated build; GPU/native runs are serial. With only three available worker slots, start verification after one implementation worker finishes.

## Prompt 1 — Blender material and source owner

You own the glossy Sprout asset refinement. Read MASTER-PROMPT.md revision 6, the current Sprout delivery guide/passport, and both pages of C:\Users\zghaz\Downloads\refrence design.pdf. Inspect the delivered v002 source and current export. Keep the approved silhouette, small smile, navy eyes, short unequal buds and stubby feet.

You are the only agent permitted to mutate the live Blender session. Inspect it before editing, preserve unrelated content and active filepath, and save owned versioned copies. Do not rerun construction scripts blindly or overwrite v002. No new paid generation, humanoid rig or character redesign is required.

Make a controlled material study:
A. v002 control.
B. Closed-body physical transmission with real thickness, volume and attenuation.
C. Clear cyan outer body with a bright blue inset core.

Keep pose, camera, exposure and lighting matched. Replace the painted violet/coral stripe with soft pale undertones and broad flowing reflections. Separate opaque lids from the transmissive body; retain readable eyes, glints and smile. Physical transmission is not alpha transparency. Verify exported transmission/volume/IOR/thickness values rather than trusting the Blender viewport.

If C is selected, the core must follow the existing skin/morph motion and remain inside the body through combined turn, squash, blink and phase extremes. Keep the nine-bone rig, three body morphs, morph normal deltas and six existing clips. Treat topology changes as requiring real deformation-data work. Do not delete checks or rename semantic controls casually.

Deliver versioned candidate GLBs/manifests, editable source/checkpoints, exact material settings, source/units notes and representative renders to the runtime owner. Do not promote public/buddy files or edit the renderer yourself. Ask the runtime owner for matched actual 44/96/160/320px browser/native captures; use those to select and refine the best candidate. A Blender render is supporting evidence, not acceptance.

Finish the selected export, transparent PNG fallback, validator output and provenance; report face/core clearance, deliberate renderer approximations, all changed channels/materials, hashes and exact paths. Preserve v002 and historical proofs.

## Prompt 2 — Runtime attention, softness and reflection owner

You own src/buddyRenderer.ts and src/buddyMotionController.ts plus agreed focused motion tests. Read the complete revision-6 brief, current asset manifest and motion ownership before editing. Coordinate any shared component props through the integration lead. Do not touch Blender or provider/voice code.

First implement whole-character pointer attention on current v002 through the unkeyed outer mount above SPROUT_ROOT. Trial yaw ±10 degrees and pitch ±6 degrees, no pointer roll, finite/clamped local coordinates and elapsed-time damping around lambda 8–10. Let the eyes lead the body. Validate rotation signs in the actual camera. Keep the DOM hit target/native bounds stable and restore neutral on leave/blur; handle hidden/resume clock reset correctly.

Preserve the single mixer and property owners. Base bones and complete body-morph vectors remain with the existing compositor; click, blink, gaze and outer attention remain separate. Add subtle compression/recovery or bud follow only through their authorized owner. Keep all six clips, interruption continuity, reduced/paused motion and clean combined extremes. No competing shader/morph writer and no per-frame React state.

When the material worker hands off B/C assets, integrate them in controlled renderer studies without replacing the default asset prematurely. Match the existing camera/exposure/render sizes. Recreate portable glass materials and verify the runtime data. Coordinate core deformation and face clearance defects back to the asset owner.

Use fixed soft reflection cards/environment first so body rotation changes highlights naturally. Never generate PMREM per frame. A tiny coherent environment/light adjustment is optional only after evidence shows a need. Keep the face legible; do not add a spotlight that follows the cursor or a second canvas.

Reuse the existing read-only phase and fresh audio-envelope inputs. Unavailable samples stay unavailable. Do not open a microphone, own playback, change VAD or infer speaking state from amplitude. Preserve native hidden/minimized/offscreen suspension and independent voice continuation.

Deliver candidate-size captures, a short attention/settle clip, chosen look settings, updated channel checks and deterministic 30/60/120Hz replay evidence. Report new render-target/draw-call costs and potential fallback changes to the lead. Final production timing happens after integration under the verification owner; old opaque-v002 timings do not certify the glass version.

## Prompt 3 — Panel hierarchy and glass presentation owner

You own src/DesktopBuddy.tsx, src/buddy.css, an optional focused Tools/Ideas component and agreed panel tests. Read revision 6, inspect the real native panel and page 1 of the reference PDF. Request shared/native-coordination changes through the integration lead.

Build one continuous rounded glass frame with one InsightOS identity/truthful status, the conversation reading well and fixed composer. Remove “HERE WITH YOU,” “Let’s figure it out.” and the long welcome paragraph; preserve the accessible conversation heading and live-log behavior.

Move the existing four suggestions into Ideas and the existing six footer utilities into Tools, preserving every handler, permission and disabled state. Place the existing expanded voice start/pause control beside the composer. Retain collapsed voice access, hide, collapse, workspace/settings/window access and directly visible Stop task and audio when active. Keep voice Pause distinct from Stop. Reduce redundant subtitles, permanent help and visual role labels while preserving accessible speaker identity, required approvals, errors, provenance and result actions.

Use a normal keyboard-accessible disclosure or a fully implemented menu pattern. Escape closes Tools and restores its trigger before a later Escape collapses the buddy. Close it before existing modal dialogs. Preserve draft/selection/manual scroll/focus through collapse, reversal and workspace navigation.

Study the two pinned MIT repositories in the master. Extract layered rim, inner bevel, soft shadow, restrained cyan/lavender/coral edge and clear content separation. Record source/license attribution for any copied implementation. Start with CSS; opt into edge-only SVG lensing only if it improves the actual host without distorting content or degrading performance.

Keep the reading well nearly opaque with dark navy text; do not blur/displace text or duplicate the live conversation for refraction. CSS glass cannot sample apps behind Electron. Do not add desktop capture for runtime refraction, a second WebGL scene or a forced native rectangular background. Isolated app/owned-backdrop captures remain allowed for visual QA.

Retain 18px conversation text/22px Large mode, at least 44px targets, measured sustained-reading contrast, 320px reflow, 200% zoom, visible focus and solid/forced-colour/reduced-transparency modes. Main text remains stable during decorative motion.

Deliver real component screenshots on controlled backgrounds, keyboard/Tools/Ideas proof, a concise action-preservation checklist and focused regression results. Call out any changed bounds needed by the lead. Do not edit financial behavior, voice architecture or native coordination merely to simplify styling.

## Prompt 4 — Independent integration and verification reviewer

Read revision 6, the current delivery guide and historical ACCEPTANCE-AUDIT.md. Review the new visual work against its own stated contract. Preserve the old audit's unverified provider/device/assistive-technology/physical-presentation gates. Do not turn a fixture result into a live-provider pass or block this visual refinement on missing credentials.

Coordinate a stable integration point and exclusive GPU/native test time with the lead. Own newly named refinement proof outputs; obtain assignment before editing an existing proof script. Report product defects to their owners rather than concurrently patching their files.

Verify the exact newly selected asset: source/runtime hashes, manifest, portable material extensions, validator, fallback and actual 44/96/160/320px captures. Inspect images and recordings, not only JSON success flags. Compare the v002 control, volume-only and core candidates under matched conditions. Check the face, long highlights, undertone blending, clear perimeter, core clearance and animated clipping.

Review pointer attention, neutral return, all six states/clips, rapid interruption/click/blink combinations and frame-rate independence. Test paused/reduced/no-WebGL/context-loss paths. Confirm no extra mic, provider calls, runtime desktop-capture dependency or competing per-frame writers. Isolated app and owned controlled-backdrop captures are permitted for QA; exclude unrelated/private desktop content.

Exercise the actual panel: open, type an unsent draft, run synthetic voice interruption, close/reopen, use Tools/Ideas, navigate to workspace and return. Check Stop, truthful state, focus/selection/reading position, rapid reversal, edge docking and popover bounds. Audit main text, enlarged text, 320px reflow, 200% zoom, forced colours, targets and composited contrast.

Run affected builds and targeted regressions. Reuse and adapt the existing production-native, cold-load, runtime-lifecycle, panel, voice-fixture and accessibility runners listed in the master. Verify scripts select the new model rather than accidentally recording v002. Run native/GPU jobs serially using isolated profiles and controlled backdrops; do not close the user's app.

Measure compiled active frame intervals/stalls and extra glass rendering cost. Check repeated panel cycles, native hidden/minimized/offscreen suspension, correct resume and disposal while voice continues. Distinguish renderer/rAF samples, Chromium presentation feedback and physical display scanout. Retain trace/count scope; do not claim physical zero-VRAM or human accessibility certification.

Deliver a separate refinement evidence record with passed/failed/not-run outcomes, exact asset/build identity, reproducible commands, screenshots/video and material limitations. The lead resolves observed defects, reruns affected checks, promotes the asset and publishes the scoped branch changes. Completion of this visual pass does not complete the previously blocked end-to-end Goal.
