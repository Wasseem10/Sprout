# Sprout / Prism — glass, joyful jump and sleep

Prepared 2026-10-11. **Implementation prompt; these new changes are not yet implemented.** This brief supersedes the earlier near-opaque cloud-white panel direction and extends the delivered six-clip animation contract. Retain historical evidence rather than marking this work complete from older tests.

## Copyable implementation prompt

Refine the existing InsightOS companion in `D:/hackathon2026/insightos-ui`. Deliver three visible improvements: a convincing glassmorphic panel interior, an exuberant joyful jump, and a sleeping Sprout that closes its eyes, lies back with its feet pointing forward, and emits small drifting Zs. Complete the actual Blender, browser and desktop implementation, inspect it at real size, and deliver reviewable evidence. A concept render or the presence of a CSS blur declaration is insufficient.

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

### 3. Author the overjoyed jump in Blender

Create `Sprout_JoyJump` as an expressive, short one-shot. Aim initially for roughly 1.3–1.8 seconds, then tune from real-size playback:

1. A readable anticipatory crouch: body compresses, feet plant, buds lag slightly.
2. A quick elastic launch into a clear upward jump. Stretch subtly along the motion, keep the face friendly and readable, and let the tiny feet and buds follow through.
3. A brief buoyant apex, followed by a believable descent.
4. A soft planted landing with squash, a small diminishing rebound and a clean settle into the current base state.

It should feel exuberant, beyond the existing click squash or idle bob, without rapid flashing, endless bouncing, a full spin, window shaking or sound effects. Use the existing face/lids for a happy expression if helpful; lip-sync is outside this pass. Keep the DOM hit target and panel stationary while the character moves within a measured safe envelope.

Author motion on the character rig and approved animation owners. Shell, inner core, face and feet must remain coherent throughout stretch and landing. Preserve the original six clips. Prefer the current topology/nine-bone rig; fix any skinning limitation only in the new version and recheck old motions. No foot sliding, penetrating feet, exposed inner core, detached eyes or abrupt first/last-frame snap is acceptable.

### 4. Author sleep, breathing and wake

Create logical clips `Sprout_SleepEnter`, `Sprout_SleepLoop` and `Sprout_Wake`, in addition to the joy one-shot. Exact names may change only through an explicit manifest/controller agreement.

For sleep entry, let the body soften and lower, close both eyes using the existing lids/closed-eye crease geometry, recline onto its lower/back side, and bring both stubby feet forward toward the viewer. Keep the resting silhouette clearly readable. This must look like a creature lying down, not an upright figure with closed eyes or a rigid model tipped 90 degrees. Avoid losing its face against the floor or hiding the feet behind the body. No bed, cradle or other accessory is required.

The sleeping loop uses quiet slow breathing and minimal bud settling, without eye tracking or random blink reopening. Author the loop seam and sleeping hold pose. Wake brings the feet/body upright and opens the eyes smoothly. Mid-entry or mid-wake interruptions retarget from the visible pose. Do not snap to the authored endpoint just to start another clip. Start with about 1.2–1.8 seconds for lying down, 4–6 seconds for a breath cycle, and a short wake; timing is an artistic starting point, not a pass criterion.

Add at most three decorative Zs above the sleeping head. Anchor the emitter to the measured posed head, not the old upright face position; begin emission when the closed-eye sleeping pose is established. Stagger them: appear gently, rise on a short curved path, soften and disappear, then repeat sparsely. Keep them upright, clearly visible against supported backgrounds and subordinate to the face. They must not overlap InsightOS, status, conversation or controls. Use a lightweight owned HTML/SVG layer or equivalent bounded renderer effect; no image-generation or particle dependency is required. Reuse the avatar's visibility/motion lifecycle. Mark the Z layer `aria-hidden` and noninteractive, with no recurring live announcements or per-frame React updates. Remove stale Zs immediately when waking or interrupted.

### 5. Behaviour, triggers and ownership

Keep conversation phase separate from cosmetic behaviour. Introduce a small explicit behaviour contract such as normal / celebrating / entering-sleep / sleeping / waking; choose one controller owner. Existing `BuddyVisualState` and voice phase remain truthful. Do not infer sleep from microphone silence or celebrate solely because a response ended.

Add labelled **Celebrate**, **Sleep** and **Wake** controls to the visual studio, with repeatable previews and truthful simulation labels. Make the real companion's cosmetic actions reachable through a compact Character section in existing settings or Tools, without adding permanent header buttons. Name the sleep action **Rest Sprout** and offer **Wake Sprout** while resting. Keep celebration explicitly user-triggered for this pass; automatic task-success celebration and idle-timeout sleep are later behaviour decisions.

Sleep and celebration may begin only when the existing integration reports no active voice session/capture/playback and no busy task. Check current eligibility on every request, including when the phase has not changed; reject an ineligible request with a clear disabled/unavailable explanation and do not queue it for surprise playback later. A new real listening/thinking/speaking state, user command or normal pet activation preempts sleep/celebration. The original action happens immediately; wake/landing decoration must not delay voice, input, panel opening or Stop. Pointer motion alone need not wake Sprout. Keep status meaningful and distinguish cosmetic rest from app suspension. A repeated eligible celebration request must have a bounded restart/coalescing rule, not an unbounded queue. Sleep requested during a jump may enter after a controlled landing; higher-priority real activity always wins.

Use one mixer and one authoritative pose/morph compositor. The delivered base clips own body/foot/bud/face bones and complete paired shell/core morph vectors; Click owns REACTION_ROOT; Blink owns lids; gaze and outer pointer attention have separate writers. Extend the auditor and controller for the new full-body behaviours explicitly—unknown clips currently do not become playable automatically. Define which current owners are muted, blended or restored during each behaviour. Suspend conflicting click/blink, pointer attention and additive attention-compression while lying down; fade back coherently. Never let a base loop and a behaviour independently write the same pose. Preserve exact binding identity for additive channels.

Priority: immediate user/task/voice truth and Stop; visibility/reduced-motion rules; behaviour interruption and recovery; cosmetic reactions; ordinary idle detail. Guard completion events with the exact action and current generation so obsolete callbacks cannot put an active character back to sleep. Reduced motion needs a semantic resting pose, not the current blanket reset to upright Idle: show an authored sleeping still and one static Z or no drifting Zs. Celebration may use a brief static happy pose. Pausing, hiding, minimizing, offscreen suspension, context loss and disposal must stop all decorative schedules; resume from current intent without a large time jump or replaying expired celebration requests.

### 6. Plan the full motion envelope before integration

Measure jump apex, landing spread, reclined feet and the entire Z path together. Check real avatar sizes: 96px collapsed, 72px expanded, 56px narrow and 44px compatibility, plus larger studio views. Both canvas frustum and native window can clip motion; CSS overflow cannot escape the OS window.

Agree a fixed safe stage/camera envelope that keeps the usual avatar prominent and makes the new movements legible. Do not shrink Sprout to a speck to fit the jump. The integration lead owns any necessary bounded viewport/native-bounds change. Allocate safe headroom once per layout mode, preserve edge docking and work-area clamping, and never move or resize the native window each animation frame. Keep the border, header alignment, focus targets and text stable. If a reduced-size compatibility view needs a lower-amplitude jump or static sleep treatment, document and inspect that deliberate variation.

### 7. Source, export and staged delivery

One worker is the sole live-Blender editor. Inspect the live scene first, preserve unrelated scenes and active filepath, and save new owned checkpoints. Use an original Blender-authored animation workflow. Higgsfield/image generation may supply a useful optional pose reference, but existing geometry is the production base.

Export a new versioned GLB with all six existing clips plus the four new logical clips, an explicit channel/owner manifest, source hash and runtime hash. Preserve the selected material, skin, semantic hierarchy, paired core morphs, morph normals and existing fallback chain. Bake authoring-only constraints to supported transforms/weights; inspect exported motion rather than trusting Blender playback. Consult the primary Three one-shot/blending examples and Blender exporter references collected in `ANIMATION-WORKFLOW.md`, checking them against the installed versions and current ownership contract; example characters and animations are not Sprout assets. Validate the GLB and the reopened editable source. Deliver a source-backed sleeping PNG for the no-WebGL/reduced-motion path; never label an upright fallback as the completed lying-down pose.

Apply the new ten-clip validation to the new asset, with explicit capability profiles for legacy v003/v002/Ribbon fallbacks. Older assets lack these new clips and must remain valid under their existing contract. If a legacy renderer is active, use the delivered sleeping still for rest or clearly disable unsupported cosmetic actions until that fallback is available. A fallback that cannot jump must not silently treat an ordinary click squash as a successful JoyJump. Keep normal conversation and voice controls available throughout loading/fallback changes.

Build order:

1. Capture the current native panel and character. Inspect the PDF/source studies and write down observable acceptance criteria.
2. In parallel, build the panel material study and author joy/sleep pose keyframes. The runtime worker designs the ownership contract against existing code; the lead reserves safe animation/Z bounds.
3. Replay the exported joy/sleep/wake clips before final polish. Resolve skin/core/face and interruption defects first.
4. Integrate the selected panel material, new behaviour controller, studio controls, real cosmetic controls and Z layer. Promote the versioned asset only after matched visual review.
5. Verify, correct visible defects, document actual limits and deliver the running preview, editable source and scoped PR changes.

Keep already-running development services; inspect the current local URLs before starting another instance. Browser review remains `http://127.0.0.1:5173/?studio=buddy` and `?studio=panel`. Native review uses the existing launcher after checking it selects the new asset.

### 8. Relevant verification and completion

Extend meaningful existing tests rather than rebuilding the backend suite. Check channel ownership, one mixer, complete shell/core deformation, feet/face clearance, loop seams, generation-guarded interruption and deterministic 30/60/120Hz sampled replay. Exercise joy interrupted at launch/apex/landing; sleep interrupted during lowering/rest/wake; rapid repeat requests; active voice preventing rest; new tasks waking immediately; and pause/reduced-motion/context recovery in each state.

Inspect actual browser/native recordings: jump → settle; lie down → breathe/Zs → wake; and interruption back to real operation. Show actual small sizes, bright/dark/busy backgrounds, expanded/collapsed layouts and screen edges. Confirm Zs and feet are not clipped, motion remains clean and the glass interior is visibly improved. Keep the images together for comparison rather than accepting only a large studio beauty shot.

Reuse affected panel keyboard/draft/selection/scroll, Tools, direct Stop, narrow/Large/200%-zoom and fallback checks. Re-run measured contrast after material changes. Run a fresh production build and a bounded native performance/lifecycle check for the new asset/effects. Target smooth active motion on the recorded host; report p95/max intervals and resource behaviour honestly. Do not weaken clip/resource assertions just to accept a changed asset; update explicit ownership/contracts where the new design requires it.

Use distinct proof directories; serialize GPU/native runs. Existing recorded synthetic voice fixtures can verify integration without a second provider. Live microphone/ElevenLabs, human screen-reader sessions, other displays and packaged installation retain their separate unverified status unless actually exercised. These do not block completing and reviewing the visual work.

Deliver exact changed files, editable .blend and versioned GLB/PNG paths, manifest/hashes, concise recordings/screenshots, passed/failed/not-run checks, current launch instructions and the draft PR link. Update the documentation's current-status pointers, preserving old records. Completion requires all three requested visible changes in the actual app, with clean interrupted motion and readable glass—not merely exported clips or passing JSON checks.
