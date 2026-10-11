# Glass, voice states, joy, sleep and Done — worker prompts

Prepared 2026-10-11. **Retained assignments for the implemented [Sprout v004 delivery](../sprout/DELIVERY-v004.md).** The [full master prompt](GLASS-JOY-SLEEP-MASTER-PROMPT.md) remains the design contract; the delivery record contains actual results. These workers operate under that brief and coordinate through the lead, within the same task.

## Ownership and order

| Owner | Exclusive write scope |
| --- | --- |
| Integration lead | Shared props and truthful state/completion adapter in AssistantSignal/ComputerCompanion, studio reset and controls/styles, settings controls, Z overlay, asset promotion, any necessary native bounds/coordinator change, current docs, final builds/proofs and draft PR |
| Glass worker | DesktopBuddy panel markup, buddy.css, a small panel-only optical helper if needed, focused existing panel checks |
| Blender worker | New owned .blend/GLB/PNG/checkpoints, animation/export scripts and manifest under design/buddy/sprout; sole live-Blender editor |
| Runtime worker | buddyMotionController, buddyRenderer, assigned replay/ownership tests and new behaviour contract |

With the lead plus three workers, begin the glass study, Blender poses and runtime contract in parallel. Export integration waits for the Blender manifest. The lead alone integrates shared interfaces and the Z layer. Review native Acrylic feasibility separately under the lead, so the glass worker never concurrently edits Electron. Serialize GPU/Blender rendering/native captures. Reassign a finished worker to independent review rather than opening additional competing editors.

## Prompt 1 — glass interior

Read GLASS-JOY-SLEEP-MASTER-PROMPT.md and the current v003 delivery guide, including its panel followup. You own DesktopBuddy's panel markup and buddy.css; request shared/native changes from the lead.

Preserve the outer border the user likes. Replace the almost-opaque pastel interior with visible glass depth in Sprout's quieter blue/lavender/coral palette. Keep the current aligned header, direct Stop, composer and existing actions. Do not remove essential labels, truthful state, permissions, provenance or errors to make a screenshot cleaner.

Fix the round voice control's Mic/Pause centring and foreground contrast. Reset padding symmetrically in all states, use a centred block SVG and remove the obsolete playing-only left padding reset. Inspect actual browser-computed geometry rather than applying a screenshot-specific nudge. Tell the lead to scope the generic studio button reset, which can override the intended white foreground with navy. Preserve Start/Pause voice-conversation semantics, actual pressed state and active Pause availability while work is busy. Verify native, standalone panel and embedded studio; keep at least 3:1 enabled icon-to-circle contrast and forced-colour overrides. Consume the lead's shared actual-state adapter for any state styling; no independent animation timer or microphone owner.

Measure the current layered opacity and backdrop boundaries first. Make a matched current/candidate comparison on the actual component. Study the pinned liquid-glass sources for directional highlights, optical edge thickness and clean content separation. Prototype layered CSS and bounded edge-only lensing; retain only effects with a demonstrated visible benefit. Keep text/control pixels outside all displacement, with restrained local readability backing. Do not return to a large opaque white reading slab. Preserve dense separation for the Tools popup.

Review both empty and populated content at 392px/320px, Large text, 200% zoom and bright/dark/busy backgrounds. Require visible material depth and readable text together. Preserve the existing rim, 44px targets, keyboard flow, draft/selection/scroll, reduced-transparency and forced-colour paths. Do not create a second canvas, runtime desktop capture, copied live-DOM textures or an always-running decorative panel loop.

Report exact mechanisms, reused source/licence, changed files, screenshots and limitations. Hand the lead a concrete native-material experiment request if the real desktop result needs it. Browser-only filtering does not establish blur of other applications. Finish a bounded reviewable candidate and correct visible defects; passing a style assertion is not artistic acceptance.

## Prompt 2 — Blender joy and sleep

Read the master brief, selected v003 manifest/source and current runtime ownership audit. You are the sole live-Blender editor. Preserve the live active filepath and unrelated scenes, save new owned checkpoints, and extend the selected Sprout rather than regenerating it.

Deliver five new logical clips: Sprout_JoyJump, Sprout_SleepEnter, Sprout_SleepLoop, Sprout_Wake and Sprout_Done. Keep all six existing clips, semantic rig controls and selected glass appearance. The nine-joint rig has ROOT/BODY, paired feet, buds and face mount; separate closed-eye crease meshes already follow the lids. Inspect actual skin weights before assuming the reclining pose will work.

Joy is anticipation → elastic upward leap → brief apex → planted landing compression → small rebound → settle. Make it clearly overjoyed and expressive at native size while maintaining a bounded envelope. Sleep lowers and reclines the body, closes its eyes and places both stubby feet forward toward the viewer; it must read as lying down. The sleep loop breathes quietly with a clean seam. Wake returns upright and opens the eyes. Provide representative anticipation/apex/landing, sleeping, and halfway wake poses for early review.

Done is a separate short satisfied nod → proud hold → soft settle, initially 0.6–0.9 seconds, with grounded feet and no leap. Prefer bounded REACTION_ROOT rotation/scale so it can accompany the existing listening/speaking base without competing body-morph ownership. Coordinate its exact bindings with the runtime owner and serialize them with Click. Deliver its sampled bounds and neutral endpoints as well as the full-body clips.

Agree channel ownership with the runtime worker before final export. Joy uses the approved full-body channels; sleep/wake also need exclusive lid ownership. Export complete paired shell/core morph vectors. Prevent detached face features, core breakthrough, pinched soles, foot sliding and discontinuous endpoints. Prefer the existing topology; any necessary skinning change belongs only in the new version and must pass the original motions again.

Hand off the candidate GLB, semantic/channel manifest, rest/hold pose descriptions, durations, authored event beats and sampled union bounds. The lead needs jump and reclining-foot bounds before sizing the viewport and Z layer. Validate the exported replay, not only the Blender viewport. Correct defects reported by runtime review. Save a reopened editable source, hashes, validator results and a source-backed sleeping still for fallback. The lead promotes runtime files after review; do not overwrite v003 or public assets yourself.

## Prompt 3 — behaviour controller and clean interruption

Read the master brief and actual buddyMotionController/buddyRenderer implementation. Own those files and agreed focused replay/ownership tests. Propose the minimal shared props to the lead; do not edit AssistantSignal, studio, settings, Z markup, voice or Blender concurrently.

Add an explicit cosmetic behaviour contract separate from the authoritative voice/task phase. Consume the five new clips after the Blender owner supplies their manifest. The existing auditor and controller only understand the six delivered categories; deliberately extend them rather than relying on unknown clips being ignored. Reuse and refine the real idle/listen/think/speak presentation bridge. The lead connects the voice control and studio simulations to that same adapter without changing provider ownership.

Keep one mixer and authoritative pose/morph weight composition. During joy or sleep, mute/blend conflicting ordinary base ownership; suppress Click, additive attention squash and pointer tracking where they would fight the pose. Sleep owns both lids, with no automatic blink reopening. Coordinate eye/gaze restoration on wake. Preserve paired core/body morph behaviour and exact property binding identity.

Implement finite manual JoyJump celebration with a bounded repeat rule; sleep entry/loop/wake; latest-phase return; generation-guarded completion; and interruption from the actual visible pose. Check current eligibility on every Sleep and Celebrate request, not only on phase-change edges; reject requests during an already-active voice session or task without queuing them. Real voice/task activity and normal control actions preempt those full-body decorations immediately. No microphone/provider, task-state mutation, automatic silence-triggered sleep or fabricated success is allowed. The lead supplies explicit studio and real cosmetic controls, and the truthful manual-action eligibility signal from existing integration state.

Done has a separate bounded-overlay contract: accept a fresh confirmed completion token from the lead, play once through REACTION_ROOT, serialize with Click, preserve the active idle/listen/speak base, and cancel on a new command/thinking/Stop/pending interruption. Do not apply the no-active-session Joy/Sleep guard to Done. The lead must deduplicate fresh task IDs in current generation-guarded results and ignore old/hydrated/unchanged snapshots, failed or waiting tasks and audio-ended edges. Completed results may have clarification:true; that flag alone is not a completion filter. Allow at most one short-lived same-generation pending cue if that request is just leaving processing; no stale queue or replay after hiding. An unavailable Done animation keeps truthful completion text.

Keep the new eleven-clip asset contract distinct from legacy v003/v002/Ribbon capability profiles. Preserve valid older fallbacks. Coordinate the delivered sleeping PNG with the lead; show a truthful static sleeping fallback or disable an unsupported cosmetic action, without blocking ordinary conversation controls. Never silently substitute the old click reaction for the new joyful jump.

Extend motion-off behaviour so a sleeping character can remain in an authored sleeping still instead of resetting upright. Coordinate a discrete sleeping/waking lifecycle and head anchor with the lead's decorative Z layer. Keep the Zs within the same visibility/pause/disposal rules without per-frame React state, a second canvas or independent persistent timer. Discard obsolete joy requests while hidden; restore current sleep/phase intent without a giant resumed delta.

Prove sampled frame-rate independence and interruption at launch/apex/landing, lowering/rest/wake, repeated requests, voice preemption and pause/resume/context recovery. Report the actual exported channel audit, all new resource costs and required safe viewport envelope. Old proofs do not certify the new clips. Coordinate final native timing after all owners freeze product changes.

## Prompt 4 — independent review after integration

Review the integrated build against GLASS-JOY-SLEEP-MASTER-PROMPT.md. Own only newly tagged evidence and assigned proof-script changes; report product defects to the lead rather than editing another owner's files.

Inspect the requested visible outcomes directly: material depth inside the preserved border; a centred, readable Mic/Pause control linked to the actual state adapter; an exuberant jump with clean landing; actual lying-down sleep with forward feet, closed eyes, breathing and drifting/disappearing Zs; and one restrained Done nod after confirmed completion. Compare current/candidate images and recordings at the actual 96/72/56px sizes, with 44px compatibility explicitly scoped. A large studio render alone is insufficient.

Check exported source/asset identity, all eleven logical clips, channel ownership, morph/core/face/foot clearance, safe jump/Done/Z bounds, sleeping still fallback and no stale completion after interruptions. Test explicit controls, active voice preventing rest, new tasks waking promptly, native screen edges, collapse/reopen, drafts, focus, Tools and direct Stop. Verify Done exactly once for a fresh completed task in a continuous voice session, and never for initial/repeated snapshots, failure, cancellation or silence. Check icon centring/contrast and unchanged Start/Pause meaning in all three hosts. Check no motion while paused/hidden/minimized/offscreen or reduced, and correct state after context recovery.

Run affected build/tests and current contrast/narrow/Large/zoom/fallback proofs. Measure the compiled native asset and panel under new movement, typing and repeated layout transitions; inspect resource stability and disposal. Record frame-clock scope and limits. Keep live provider, physical audio and human assistive-technology checks separate from synthetic fixtures. Deliver concise pass/fail/not-run evidence with actual screenshots/video, not unsupported completion claims.
