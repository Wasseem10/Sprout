# Sprout / Prism — glass, voice states, joy, sleep and Done

Prepared 2026-10-11. **Implemented as Sprout v004; see the [delivery and verification record](../sprout/DELIVERY-v004.md) for exact evidence and remaining external acceptance.** This retained brief supersedes the earlier near-opaque cloud-white panel direction and extends the delivered six-clip animation contract. Historical evidence remains separate from the new checks.

## Copyable implementation prompt

Refine the existing InsightOS companion in `D:/hackathon2026/insightos-ui`. Deliver a convincing glassmorphic panel interior; a centred, readable voice control linked to Sprout's actual conversation states; an exuberant joyful jump; a sleeping Sprout that closes its eyes, lies back with its feet pointing forward, and emits small drifting Zs; and a restrained Done acknowledgement after confirmed task completion. Complete the actual Blender, browser and desktop implementation, inspect it at real size, and deliver reviewable evidence. A concept render or the presence of a CSS blur declaration is insufficient.

### 1. Start from the delivered application

Inspect the current branch, diff and applicable AGENTS instructions. The intended UI branch is `ui/presentation-polish`; preserve unrelated work. Read `design/buddy/sprout/DELIVERY-v003.md`, `GLOSSY-REFINEMENT-AUDIT.md`, the selected asset manifest, and the current controller/panel code. Read `GLASS-JOY-SLEEP-WORKER-PROMPTS.md` before delegating. Older Ripple/v002 proposals and unchecked planning lists are history, not a reason to rebuild delivered features.

Baseline at preparation: commit `48d08fc5c0fed883d7ad015e99c6bfeb1cb29876`. The character is **Sprout v003**; `prism-panel-v004` names the latest panel evidence, not a newer avatar. The app uses React 19, TypeScript, Vite 8, Electron 44 and direct Three.js 0.186.1. Retain that stack and the existing voice/backend architecture.

Protected character inputs:

- Editable source: `design/buddy/sprout/source/sprout-clear-prism-rim-matched-v003.blend`.
- Canonical asset: `design/buddy/sprout/sprout-prism-v003.glb`.
- Runtime asset: `public/buddy/sprout-v003.glb`.
- Canonical/runtime GLB SHA256: `63bc8f0289634e03716732c6beefe2f3492d53d1f54ec04dd8e23d28fddf0a32`.

Use the selected manifest as the integrity source; never reconstruct a digest from memory. Preserve v003/v002 source, assets and old proofs. Choose an unused version for the new source/GLB and a distinct proof tag. Keep Sprout's clear cyan shell, luminous blue interior, lavender/coral undertones, face and small silhouette. This pass does not require a character redesign or new paid generation.

Keep finance logic, server/shared contracts, OCR, task execution, permissions, microphone ownership and ElevenLabs intact. The avatar consumes the existing truthful phase/audio signals. Cosmetic actions must not open another microphone, pause speech, cancel a task or fabricate success. Existing scoped commits/pushes and updates to draft PR `https://github.com/Wasseem10/insightos/pull/1` are authorized; merging, production deployment and messaging the cousin are separate work.

### 2. Make the interior visibly glassmorphic

The user likes the existing outer border. Preserve its silhouette, radius, thickness and colour treatment. Concentrate the change on the interior, composer and their depth relationship. Current `src/buddy.css` puts a roughly 96%-opaque base beneath several pale overlays; the result reads as pastel. Subdued colour must not be achieved by covering the whole interior with another almost-opaque milky gradient.

Use the same material family as Sprout: blue/aqua dominant, lavender and coral as quieter undertones, crisp highlights, visible depth and controlled translucency. Let the background influence the material. Keep the text and controls sharp and stable above the optical layers. Use local, restrained readability backing where needed; tune it against actual contrast without recreating a broad white slab. The composer should feel inset into the same glass family. Tools must prevent text behind it bleeding into its labels.

Build a matched current-versus-candidate study with the real component, camera/viewport and content held constant. Evaluate a translucent layered-CSS interior and a bounded edge-lensing candidate. Inspect the pinned MIT source examples in `PANEL-GLASS-SOURCE-STUDY.md` for a specific useful mechanism: directional highlight, inner edge thickness, edge-masked displacement and separate sharp content. Adapt only useful code and retain required attribution. A small pointer-responsive highlight may be used if it improves the material; keep text, panel position and reading background steady, and honour reduced motion. Do not add a second WebGL canvas or a perpetual panel animation loop.

Browser and native materials have different limits. Page backdrop filters can use owned page content; they cannot blur other applications behind Electron. Do not add desktop capture or duplicate/rasterize the live conversation as a runtime texture. The lead should make a small isolated native Acrylic compatibility study if CSS cannot produce adequate desktop frosting. Integrate native material only when it preserves the freestanding pet, rounded panel, shadows, focus margins and existing window behaviour. Never call a browser-only refraction effect proof of desktop refraction. If native material cannot meet those constraints, document the exact limit and finish a convincing supported glass treatment; do not quietly revert to the rejected pastel panel.

Visual acceptance: compare empty/populated conversation on bright, dark and busy owned backgrounds at 392px and 320px, Large text and 200% zoom. The glass should show depth, highlights and background-sensitive separation while Sprout remains the brighter focal point. Preserve 18px/22px reading text, 44px targets, measured sustained-reading contrast near the existing 7:1 target, keyboard focus, solid/reduced-transparency and forced-colour paths. Inspect screenshots and native captures, then correct the largest visible defect. Functional checks alone do not certify the requested appearance.

### 3. Centre the voice control and connect actual states

The user's screenshot shows the active round voice control with a left-shifted, dark Pause glyph. Inspect the live embedded studio, standalone panel and native app. Source diagnosis to verify: `.buddy-play.playing` clears only `padding-left`, leaving possible asymmetric browser padding; `.buddy-studio button` can override the intended white icon with inherited navy. Fix the cascade and layout rather than adding an arbitrary pixel nudge for one screenshot. Preserve the blue circular control, use symmetric padding and a centred block SVG, and verify optical as well as bounding-box centring. Keep its centre and target stable when its icon changes. The screenshot is a local visual reference at `C:/Users/zghaz/AppData/Local/Temp/codex-clipboard-18af8071-a29a-4ea9-9263-8df547438d2c.png` if still available.

The user calls this Play, but the actual existing action is **Start voice conversation / Pause voice conversation**, using Mic/Pause icons and `conversationActive`. Preserve that meaning, handler, accessible name, pressed state and permission flow. Pause must remain usable while work is busy; direct Stop remains separate. Check at least 3:1 visible glyph-to-circle contrast in enabled states, plus light/dark/busy backgrounds, hover, focus, disabled, forced colours, Large text and zoom. Scope the studio reset so embedding the real component cannot recolour its controls. The glass worker owns buddy button styles; the lead owns any necessary studio-reset change.

Connect the control's appearance, existing HTML status and avatar to one read-only presentation adapter over the real voice/task state. Reuse the existing phase/level bridge; do not start a click-driven timer that pretends to progress through listening, thinking and speaking. A click must invoke the existing session owner, with starting/permission/error feedback until the microphone is actually ready. Keep the icon's meaning tied to whether the session can be paused, not to whether the avatar happens to be speaking.

| Actual state | Sprout presentation | Control/status behaviour |
| --- | --- | --- |
| Idle | Existing gentle breathing, occasional blink and bounded pointer attention | Start when no conversation is active; preserve the actual session toggle if it remains active |
| Listening | Attentive slight lean/eye focus, with restrained response to fresh measured input if available | Truthful Listening status; Pause remains available |
| Thinking / processing | Existing thoughtful tilt/soft body motion; tune only where the actual-size result needs improvement | Show the real starting/transcribing/working status; no fake volume-driven speech or disabled Stop |
| Speaking | Existing speak motion follows fresh measured output level while playback is actually active | Preserve Pause and interruption; settled silence does not independently change phase |
| Done | One satisfied nod and soft settle after a fresh confirmed completion | A completion cue, not a replacement for active Listening/Speaking status |

Idle/listen/think/speak animation and audio wiring already exist. Inspect and refine their consistency rather than rebuilding them. The studio can simulate the same adapter with explicit simulation labels and no provider or microphone calls. Failed permission, cancellation and unsuccessful tasks must retain truthful feedback and never play Done.

### 4. Author the overjoyed jump in Blender

Create `Sprout_JoyJump` as an expressive, short one-shot. Aim initially for roughly 1.3–1.8 seconds, then tune from real-size playback:

1. A readable anticipatory crouch: body compresses, feet plant, buds lag slightly.
2. A quick elastic launch into a clear upward jump. Stretch subtly along the motion, keep the face friendly and readable, and let the tiny feet and buds follow through.
3. A brief buoyant apex, followed by a believable descent.
4. A soft planted landing with squash, a small diminishing rebound and a clean settle into the current base state.

It should feel exuberant, beyond the existing click squash or idle bob, without rapid flashing, endless bouncing, a full spin, window shaking or sound effects. Use the existing face/lids for a happy expression if helpful; lip-sync is outside this pass. Keep the DOM hit target and panel stationary while the character moves within a measured safe envelope.

Author motion on the character rig and approved animation owners. Shell, inner core, face and feet must remain coherent throughout stretch and landing. Preserve the original six clips. Prefer the current topology/nine-bone rig; fix any skinning limitation only in the new version and recheck old motions. No foot sliding, penetrating feet, exposed inner core, detached eyes or abrupt first/last-frame snap is acceptable.

### 5. Author sleep, breathing and wake

Create logical clips `Sprout_SleepEnter`, `Sprout_SleepLoop` and `Sprout_Wake`, in addition to the joy one-shot. Exact names may change only through an explicit manifest/controller agreement.

For sleep entry, let the body soften and lower, close both eyes using the existing lids/closed-eye crease geometry, recline onto its lower/back side, and bring both stubby feet forward toward the viewer. Keep the resting silhouette clearly readable. This must look like a creature lying down, not an upright figure with closed eyes or a rigid model tipped 90 degrees. Avoid losing its face against the floor or hiding the feet behind the body. No bed, cradle or other accessory is required.

The sleeping loop uses quiet slow breathing and minimal bud settling, without eye tracking or random blink reopening. Author the loop seam and sleeping hold pose. Wake brings the feet/body upright and opens the eyes smoothly. Mid-entry or mid-wake interruptions retarget from the visible pose. Do not snap to the authored endpoint just to start another clip. Start with about 1.2–1.8 seconds for lying down, 4–6 seconds for a breath cycle, and a short wake; timing is an artistic starting point, not a pass criterion.

Add at most three decorative Zs above the sleeping head. Anchor the emitter to the measured posed head, not the old upright face position; begin emission when the closed-eye sleeping pose is established. Stagger them: appear gently, rise on a short curved path, soften and disappear, then repeat sparsely. Keep them upright, clearly visible against supported backgrounds and subordinate to the face. They must not overlap InsightOS, status, conversation or controls. Use a lightweight owned HTML/SVG layer or equivalent bounded renderer effect; no image-generation or particle dependency is required. Reuse the avatar's visibility/motion lifecycle. Mark the Z layer `aria-hidden` and noninteractive, with no recurring live announcements or per-frame React updates. Remove stale Zs immediately when waking or interrupted.

### 6. Add a restrained Done acknowledgement

Author `Sprout_Done`, initially around 0.6–0.9 seconds: a small satisfied nod, a brief proud upright hold, then a soft return to the current pose. Keep it grounded and warm. This is the everyday completion cue; the exuberant JoyJump remains a separate explicit action. Avoid a second jump, spinning, confetti, sound effects or implying that a completed financial explanation guarantees a favourable financial outcome.

Prefer a bounded REACTION_ROOT rotation/scale clip through the existing mixer. Serialize this binding with Click and other reactions; do not run competing writers. Preserve the authoritative idle/listen/speak base and paired shell/core motion. Attentional compression must not spoil the acknowledgement. A small disjoint Done overlay may coexist with an active listening or speaking session; unlike manual Joy/Sleep, it must not require `conversationActive === false`, which would prevent completion feedback during continuous conversation. New commands, thinking, Stop or pending user interruption cancel the cue immediately without delaying the real operation.

Emit once for a fresh completed `ComputerState.task.id` from the current generation-guarded accepted result in ComputerCompanion. Seed/ignore completed tasks already present at mount, and deduplicate unchanged state, polling, rerenders and reopening. Completion requires the explicit successful task status; `busy` becoming false, audio ending, microphone silence or generic response text is insufficient. Completed task results can currently carry `clarification: true`, so that flag is neither a success test nor grounds to discard a valid completed task. Do not modify the backend's completion semantics. Single-action responses without a task completion record may opt in only through a separately verified successful outcome and current client generation; otherwise leave them uncelebrated.

If completion arrives just before that same request leaves processing, allow at most one short-lived pending cue tied to its generation. Play only when its compatible base state is ready; discard on a newer command, interruption, failure, hiding or expiry. Never accumulate a backlog or replay an old completion after wake/reopen. A completion before speech may play once with the compatible base; do not play again when speech ends. Paused/reduced motion uses static acknowledgement/status; unavailable animation falls back to truthful text without blocking controls.

Add a labelled Done preview to the studio (or refine the existing Success preview) that emits one replayable simulated completion event rather than locking the character in an endless success loop. Verify it alongside the actual idle/listen/think/speak adapter and live-like fixture sequence.

### 7. Behaviour, triggers and ownership

Keep conversation phase separate from cosmetic behaviour. Introduce a small explicit behaviour contract such as normal / celebrating / entering-sleep / sleeping / waking; choose one controller owner. Existing `BuddyVisualState` and voice phase remain truthful. Do not infer sleep from microphone silence or celebrate solely because a response ended.

Add labelled **Celebrate**, **Sleep** and **Wake** controls to the visual studio, with repeatable previews and truthful simulation labels. Make the real companion's cosmetic actions reachable through a compact Character section in existing settings or Tools, without adding permanent header buttons. Name the sleep action **Rest Sprout** and offer **Wake Sprout** while resting. Keep the exuberant JoyJump explicitly user-triggered for this pass. Confirmed completion uses the restrained Done cue above; automatically triggering JoyJump and idle-timeout sleep are later behaviour decisions.

Sleep and manual JoyJump celebration may begin only when the existing integration reports no active voice session/capture/playback and no busy task. Check current eligibility on every request, including when the phase has not changed; reject an ineligible request with a clear disabled/unavailable explanation and do not queue it for surprise playback later. A new real listening/thinking/speaking state, user command or normal pet activation preempts sleep/JoyJump. The original action happens immediately; wake/landing decoration must not delay voice, input, panel opening or Stop. Pointer motion alone need not wake Sprout. Keep status meaningful and distinguish cosmetic rest from app suspension. A repeated eligible JoyJump request must have a bounded restart/coalescing rule, not an unbounded queue. Sleep requested during a jump may enter after a controlled landing; higher-priority real activity always wins. Done has the narrower compatible-overlay rules above; do not accidentally apply the manual-action eligibility gate to it.

Use one mixer and one authoritative pose/morph compositor. The delivered base clips own body/foot/bud/face bones and complete paired shell/core morph vectors; Click owns REACTION_ROOT; Blink owns lids; gaze and outer pointer attention have separate writers. Extend the auditor and controller for the new full-body behaviours explicitly—unknown clips currently do not become playable automatically. Define which current owners are muted, blended or restored during each behaviour. Suspend conflicting click/blink, pointer attention and additive attention-compression while lying down; fade back coherently. Never let a base loop and a behaviour independently write the same pose. Preserve exact binding identity for additive channels.

Priority: immediate user/task/voice truth and Stop; visibility/reduced-motion rules; behaviour interruption and recovery; cosmetic reactions; ordinary idle detail. Guard completion events with the exact action and current generation so obsolete callbacks cannot put an active character back to sleep. Reduced motion needs a semantic resting pose, not the current blanket reset to upright Idle: show an authored sleeping still and one static Z or no drifting Zs. Celebration may use a brief static happy pose. Pausing, hiding, minimizing, offscreen suspension, context loss and disposal must stop all decorative schedules; resume from current intent without a large time jump or replaying expired celebration requests.

### 8. Plan the full motion envelope before integration

Measure jump apex, landing spread, reclined feet, Done nod and the entire Z path together. Check real avatar sizes: 96px collapsed, 72px expanded, 56px narrow and 44px compatibility, plus larger studio views. Both canvas frustum and native window can clip motion; CSS overflow cannot escape the OS window.

Agree a fixed safe stage/camera envelope that keeps the usual avatar prominent and makes the new movements legible. Do not shrink Sprout to a speck to fit the jump. The integration lead owns any necessary bounded viewport/native-bounds change. Allocate safe headroom once per layout mode, preserve edge docking and work-area clamping, and never move or resize the native window each animation frame. Keep the border, header alignment, focus targets and text stable. If a reduced-size compatibility view needs a lower-amplitude jump or static sleep treatment, document and inspect that deliberate variation.

### 9. Source, export and staged delivery

One worker is the sole live-Blender editor. Inspect the live scene first, preserve unrelated scenes and active filepath, and save new owned checkpoints. Use an original Blender-authored animation workflow. Higgsfield/image generation may supply a useful optional pose reference, but existing geometry is the production base.

Export a new versioned GLB with all six existing clips plus the five new logical clips (JoyJump, SleepEnter, SleepLoop, Wake and Done), an explicit channel/owner manifest, source hash and runtime hash. Preserve the selected material, skin, semantic hierarchy, paired core morphs, morph normals and existing fallback chain. Bake authoring-only constraints to supported transforms/weights; inspect exported motion rather than trusting Blender playback. Consult the primary Three one-shot/blending examples and Blender exporter references collected in `ANIMATION-WORKFLOW.md`, checking them against the installed versions and current ownership contract; example characters and animations are not Sprout assets. Validate the GLB and the reopened editable source. Deliver a source-backed sleeping PNG for the no-WebGL/reduced-motion path; never label an upright fallback as the completed lying-down pose.

Apply the new eleven-clip validation to the new asset, with explicit capability profiles for legacy v003/v002/Ribbon fallbacks. Older assets lack these new clips and must remain valid under their existing contract. If a legacy renderer is active, use the delivered sleeping still for rest or clearly disable unsupported cosmetic actions until that fallback is available. A fallback that cannot jump must not silently treat an ordinary click squash as a successful JoyJump. Keep normal conversation and voice controls available throughout loading/fallback changes.

Build order:

1. Capture the current native panel and character. Inspect the PDF/source studies and write down observable acceptance criteria.
2. In parallel, build the panel material study and author joy/sleep pose keyframes. The runtime worker designs the ownership contract against existing code; the lead reserves safe animation/Z bounds.
3. Replay the exported joy/sleep/wake/Done clips before final polish. Resolve skin/core/face and interruption defects first.
4. Integrate the selected panel material, centred voice control, shared state presentation, new behaviour controller, studio controls, real cosmetic controls, confirmed-completion cue and Z layer. Promote the versioned asset only after matched visual review.
5. Verify, correct visible defects, document actual limits and deliver the running preview, editable source and scoped PR changes.

Keep already-running development services; inspect the current local URLs before starting another instance. Browser review remains `http://127.0.0.1:5173/?studio=buddy` and `?studio=panel`. Native review uses the existing launcher after checking it selects the new asset.

### 10. Relevant verification and completion

Extend meaningful existing tests rather than rebuilding the backend suite. Check channel ownership, one mixer, complete shell/core deformation, feet/face clearance, loop seams, generation-guarded interruption and deterministic 30/60/120Hz sampled replay. Exercise joy interrupted at launch/apex/landing; sleep interrupted during lowering/rest/wake; rapid repeat requests; active voice preventing rest; new tasks waking immediately; and pause/reduced-motion/context recovery in each state. Check Done exactly once for a fresh confirmed completion, compatible listening/speaking overlays, no replay on initial/unchanged snapshots, no success on failures/cancellation/waiting, and immediate cancellation by a new request or Stop. Verify the centred Mic/Pause icon and its contrast in native, standalone panel and embedded studio while running the real state adapter with controlled fixtures.

Inspect actual browser/native recordings: jump → settle; lie down → breathe/Zs → wake; and interruption back to real operation. Show actual small sizes, bright/dark/busy backgrounds, expanded/collapsed layouts and screen edges. Confirm Zs and feet are not clipped, motion remains clean and the glass interior is visibly improved. Keep the images together for comparison rather than accepting only a large studio beauty shot.

Reuse affected panel keyboard/draft/selection/scroll, Tools, direct Stop, narrow/Large/200%-zoom and fallback checks. Re-run measured contrast after material changes. Run a fresh production build and a bounded native performance/lifecycle check for the new asset/effects. Target smooth active motion on the recorded host; report p95/max intervals and resource behaviour honestly. Do not weaken clip/resource assertions just to accept a changed asset; update explicit ownership/contracts where the new design requires it.

Use distinct proof directories; serialize GPU/native runs. Existing recorded synthetic voice fixtures can verify integration without a second provider. Live microphone/ElevenLabs, human screen-reader sessions, other displays and packaged installation retain their separate unverified status unless actually exercised. These do not block completing and reviewing the visual work.

Deliver exact changed files, editable .blend and versioned GLB/PNG paths, manifest/hashes, concise recordings/screenshots, passed/failed/not-run checks, current launch instructions and the draft PR link. Update the documentation's current-status pointers, preserving old records. Completion requires the requested glass, centred voice control, real state-linked presentation, joy/sleep/wake and Done acknowledgement in the actual app, with clean interrupted motion and readable glass—not merely exported clips or passing JSON checks.
