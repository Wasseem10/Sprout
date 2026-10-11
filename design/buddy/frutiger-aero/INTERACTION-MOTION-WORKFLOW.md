# Sprout / Prism: interaction and motion workflow

**Status: implementation plan, not shipped behavior or a performance result.** Prepared on 10 October 2026. The current direction is Sprout: a compact jelly creature with short asymmetrical buds, navy eyes, and a blue/aqua body with restrained violet/coral Prism light. This supersedes the earlier Ripple character preference in [INTERFACE-SPEC.md](D:/hackathon2026/insightos-ui/design/buddy/frutiger-aero/INTERFACE-SPEC.md); its readable glass-shell/conversation principles remain useful. Accessory design is outside this slice.

All new timings, amplitudes, layout coordination, audio-level inputs, native acknowledgements, and tooling decisions below are **proposals to build and tune**. No runtime, Blender, backend, or deployment changes are made by this document.

[ANIMATION-WORKFLOW.md](D:/hackathon2026/insightos-ui/design/buddy/frutiger-aero/ANIMATION-WORKFLOW.md) is canonical for the first rig, four-clip proof, channel ownership, and exported manifest. This document owns panel coordination, native bounds, focus, and the complete interaction storyboard. The first avatar proof defers the mouth; speaking is expressed through body/light while semantic HTML remains immediate.

## Outcome and first tooling decision

Prove one complete interaction with the actual Sprout GLB: **still avatar → press acknowledgement and safe panel opening → type and preserve a draft → truthful voice states → interrupt → collapse and reopen**. The panel, face, keyboard focus, and native window should behave as one coordinated experience. The conversation remains stable while the character supplies expression.

Use the existing **Vite + React + Electron + Three.js** stack for the first proof. Add a small CSS/Web Animations API coordinator for the DOM shell; keep one Three render loop for the avatar. Start with restrained keyframes and reversible timelines. Introduce a spring library only if the prototype demonstrates a specific retargeting or continuity problem that simple native animation cannot solve cleanly.

The asset workflow can continue **Blender → GLB → current Three renderer**. After that proof, a bounded R3F wrapper can reuse the model and the same presentation contract in Vite/Electron and an optional Next.js browser shell. Next.js and Vercel concern a separately chosen web host; they are not prerequisites for smooth native desktop motion. Do not create a framework migration as a visual-design dependency.

## Inspected baseline

| Existing source                                                                                                                                             | Useful behavior to retain                                                                                                                             | Gap for this proposed slice                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AssistantSignal.tsx](D:/hackathon2026/insightos-ui/src/AssistantSignal.tsx)                                                                                | Decorative canvas/image, HTML state elsewhere, `phase` and `motion` props, lazy renderer load, latest settings retained during load.                  | Current authored core is not Sprout. There is no numeric audio-level prop or press-acknowledgement contract.                                                                                 |
| [buddyRenderer.ts](D:/hackathon2026/insightos-ui/src/buddyRenderer.ts)                                                                                      | GLB `AnimationMixer`, RAF timestamps and delta, observers, motion preference, visibility guards, authored-image fallback and context recovery.        | Current 15/30fps caps and phase-based motion are the baseline. Smooth active reactions need measured scheduling and blending; they are not currently a verified 60fps Sprout implementation. |
| [BuddyStudio.tsx](D:/hackathon2026/insightos-ui/src/BuddyStudio.tsx)                                                                                        | Explicit simulated states, keyboard collapse/focus restoration, preserved local draft, motion toggle.                                                 | It toggles an entire sample panel directly, without native geometry coordination or a Sprout-specific press/phase blend.                                                                     |
| [ComputerCompanion.tsx](D:/hackathon2026/insightos-ui/src/ComputerCompanion.tsx) and [DesktopBuddy.tsx](D:/hackathon2026/insightos-ui/src/DesktopBuddy.tsx) | Existing send, voice, interruption, stop task, status text, draft state, result handlers, and panel controls.                                         | Native mode is requested in an effect after expanded state changes; there is no coordinated visual opening/closing state.                                                                    |
| [electron/preload.cjs](D:/hackathon2026/insightos-ui/electron/preload.cjs) and [electron/main.cjs](D:/hackathon2026/insightos-ui/electron/main.cjs)         | `setBuddyMode` uses IPC invoke; the host clamps `setBounds` to display work area. Current pill/panel requests are 360 × 86 / 440 × 580.               | The reply signals handler completion, not explicit applied bounds or a painted renderer layout. Those dimensions do not yet accommodate the proposed freestanding Sprout.                    |
| [voice.ts](D:/hackathon2026/insightos-ui/src/voice.ts)                                                                                                      | Voice owns capture/playback, phases, cancellation generations, and interruption. A new utterance can stop older output and return phase to listening. | Its returned API exposes no numeric input/output audio level. Decorative animation must not open another microphone or pretend an invented waveform is measured audio.                       |

Existing focused studio tests provide useful coverage for state selection, draft/focus, paused frames, WebGL failure, and context recovery. They must be adapted after the new interaction exists; their previous passing result does not validate this plan.

## Keep three state systems separate

**Conversation state** stays with existing voice/task owners. **Presentation state** selects Sprout's expression. **Layout state** coordinates panel availability and native geometry. A body pulse cannot decide that the microphone is listening; a panel finishing its entrance cannot mark a task complete.

### Narrow presentation adapter

Proposed renderer input, shown as a contract sketch rather than application code:

```ts
type SproutPresentation = {
  phase: 'idle' | 'listening' | 'thinking' | 'speaking' | 'success';
  level: number | null; // normalized 0..1 from an identified existing source
  motion: boolean; // renderer also respects system preference and visibility
};
```

- `phase` is a low-frequency semantic update, initially supplied by the existing `buddyVisualState` mapping. Update it immediately when its source changes. Its current mapping prioritizes speaking, then busy/starting/transcribing/processing, then listening; the HTML can truthfully describe simultaneous working and listening. Review precedence with a real interruption trace rather than silently changing task/voice behavior.
- `level` is optional numeric intensity, not a phase detector. `null` means unavailable. The first phase-only prototype can leave it null. A later level path requires a reviewed read-only signal from the existing audio owner, with the source defined as input while listening or output while speaking. No separate capture stream, new provider request, or recording permission is justified by avatar motion.
- A numeric level may later affect restrained body light. It must not switch Listening/Speaking, imply transcript accuracy, animate the full panel, or fabricate lip synchronization. Stop/reset the speaking contribution immediately on interruption. If task state maps the avatar to thinking, leave the speaking contribution off even if a stale level sample arrives. A read-only, level-driven mouth is a future optional addition after the first eyes/motion proof; it is not part of the initial rig or clip acceptance criteria.
- `motion=false` disables decorative animation. It does not pause the actual voice conversation. System reduced motion, hidden/offscreen state, lost context, and disposal continue to override rendering.

HTML status/error text remains separately owned by the UI. The existing renderer phase enum has no error phase; show an error clearly in HTML while retaining a calm still expression. `success` requires an actual confirmed completion event or an explicitly labelled simulated preview; a timer or finished animation is not evidence of success.

Keep high-frequency level samples in a ref/controller path consumed by the render loop rather than setting React component state every frame. For a later smoothed intensity, use elapsed-time damping such as `a = 1 - exp(-dt / tau)` with a proposed 60–100ms attack and 140–200ms release, then tune with real audio. Never apply that smoothing to semantic phase, interruption, or Stop. Clamp malformed values and discard samples from a superseded output session.

### Layout coordinator

Use one owner for `desiredExpanded`, current visual progress, current native request, and an incrementing operation ID. Suggested states:

| Layout state                 | Conversation availability                                                                       | Native geometry                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `closed`                     | Hidden/inert; pet is available. Draft and scroll state retained.                                | Collapsed bounds.                                                    |
| `preparing-open`             | Pet remains available; panel is not yet exposed to assistive technology.                        | Request larger safe bounds and verify the resulting viewport/layout. |
| `open` / decorative settling | Reading well is fully opaque and available; shell may finish its short animation.               | Expanded bounds already applied.                                     |
| `closing`                    | Focus is already back on the pet; reading content is hidden/inert. Only decorative shell exits. | Keep expanded bounds until the valid exit completes, then shrink.    |

`aria-expanded` follows actual conversation availability, not a late animation callback or a queued desired state. The action name always describes the current available action. The coordinator does not own voice, message generation, or task cancellation.

## Motion priority and property ownership

Resolve competing movement in this order:

1. **Safety and lifecycle:** reduced/paused motion, hidden state, disposal, context failure.
2. **Truth and urgent action:** current phase/status, interruption, voice pause, Stop task/audio. These take effect without waiting for choreography.
3. **Intentional interaction:** button press, open/collapse, close/back, keyboard focus.
4. **Phase expression and optional measured level.**
5. **Hover gaze and occasional blink.**
6. **Optional idle movement.** The first frame is calm and still; idle does not require a perpetual loop.

The pet's semantic button and dock anchor remain geometrically stable. Press squash belongs to the avatar body/interaction rig inside that stable area. Gaze belongs to a small eye/phase layer; it must not move the button's hit target. The shell animation controls a decorative sibling behind the reading well. Conversation/composer text and focus outlines do not inherit a squash, scale, or animated blur.

For GLB animation, follow the canonical first-proof ownership: base clips own body/bud channels and the body's complete morph-weight vector; click owns `REACTION_ROOT` transforms; blink owns lid transforms; gaze owns unkeyed gaze nodes. Body/light expresses speaking initially, with no mouth channel. Avoid an exported clip and a procedural update both writing the same rotation or morph-weight vector. Verify the model's actual named clips/channels in the canonical export manifest; missing channels fall back to a still face instead of breaking the interface.

Use elapsed seconds, not a fixed increment per frame, for mixers, procedural motion, and smoothing. Reset the frame baseline after hidden/restored/paused periods rather than catching up with a large time jump. Three's mixer API accepts delta seconds. A future R3F wrapper can preserve this approach with `useFrame` and direct object mutation; its official guidance discourages per-frame React state. [Three AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html), [R3F Basic Animations](https://r3f.docs.pmnd.rs/tutorials/basic-animations), [R3F Performance Pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)

## Proposed motion vocabulary

These are **initial tuning ranges**, not final timings or measured targets. Motion should acknowledge intent quickly, then settle without drawing attention away from reading.

| Event                          | Proposed treatment                                                                                                                                           | Starting duration/amplitude                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pointer or keyboard activation | One gentle compression, then a contained return. Keep eyes legible; click and blink use independent channels and can overlap without overwriting each other. | First `Sprout_Click`: 10 intervals at 24fps = 416.7ms total. Compress over about 70–100ms, then restrained recovery over the remainder. Proposed 6–8% squash, neutral endpoints. |
| Open shell                     | Small movement/settling of the decorative shell from the pet-side origin; full-size opaque reading well appears at its final position once geometry is safe. | 180–240ms; 4–8px shell travel and at most about 1–2% shell scale. No overshoot across the work-area boundary.                                                                    |
| Close shell                    | A shorter return toward the pet; hide reading content after restoring focus, before native shrink.                                                           | 140–180ms. Reverse from current visual progress if interrupted.                                                                                                                  |
| Phase expression               | Blend the current pose into the new expression without resetting the whole character. Semantic phase and HTML status change immediately.                     | Starting base-pose blend 180–240ms; interruption stops the speaking contribution immediately without waiting for that blend.                                                     |
| Listening                      | Attentive open eyes and a calm slight bud/body response. Use measured level only if available.                                                               | Small bounded movement; no escalating pulse or restless bouncing.                                                                                                                |
| Thinking                       | Slight thoughtful eye/body orientation, with the face still visible.                                                                                         | Slow contained motion; no spinning or implied progress percentage.                                                                                                               |
| Speaking                       | Restrained body/light response within the speaking phase; mouth deferred until after the first eyes/motion proof.                                            | Phase-only expression first; measured intensity is a later optional read-only input.                                                                                             |
| Hover gaze                     | Eyes respond within a small local range, then return. No desktop-wide tracking.                                                                              | About 180–220ms to reach roughly 90% of a gaze step; canonical λ=12 gives about 192ms. Travel remains bounded to the eye sockets.                                                |
| Blink                          | One authored, legible blink on independent lid channels; it can overlap click/base motion while preserving channel ownership.                                | First `Sprout_Blink`: 4 intervals at 24fps = 166.7ms, within the 130–180ms tuning range. Disabled in paused/reduced motion.                                                      |
| Done                           | A brief settled expression before returning to the actual current phase.                                                                                     | About 400–650ms visual acknowledgement; never delays result access.                                                                                                              |

Do not animate conversation glyphs with typewriter effects, change line spacing, scale the composer, or move existing messages when a voice phase changes. New messages follow the current reading/scroll behavior. A person reviewing an earlier message should not be repeatedly dragged to the bottom by decorative state changes.

## Safe native opening and closing

### Opening

1. Record the pet's current screen-space anchor and desired expanded state; start the press acknowledgement immediately. Keep the pet usable while preparing the panel.
2. Request expanded bounds through the existing native UI bridge. Calculate space for the pet, focus ring, shell, and controls inside the actual display work area. Preserve the pet's screen position as far as edge clamping allows. The current centered-width adjustment may move it; explicit anchor-aware layout is a proposed UI-host refinement.
3. Await successful IPC completion. Prefer a narrowly extended response containing applied bounds, mode, and request ID. Then confirm the renderer viewport/element geometry through a resize/layout observation. A single arbitrary delay or RAF is not proof that the new native window has enough room.
4. Check that the operation is still current. If it has been superseded, do not reveal the panel or move focus. If bounds cannot provide the intended size, use the proposed narrow/short layout before exposing content.
5. Commit the final content geometry, reveal the full-opacity reading well, update disclosure semantics, and move focus predictably into the panel. Start/continue the decorative shell animation behind it. Press rebound may overlap this settle; there is no requirement to wait for its finish.
6. Mark the open target settled only for the current operation. Loading the GLB must not delay panel access; the authored face fallback can acknowledge the same interaction with a simple bounded transform.

### Closing

1. Change the target, invalidate obsolete completion callbacks, and restore focus to the pet **before** hiding/inerting panel content. Save draft and reading position. Closing the panel does not pause voice or stop a task; those actions retain separate controls.
2. Animate only the remaining decorative shell inside the expanded native bounds. If opening was unfinished, retarget/reverse from its current presentation rather than restarting from a fully open pose.
3. When the latest valid exit finishes, shrink native bounds. Never shrink at click time while the visible shell still occupies expanded space. Do not let an old close callback shrink a newly reopened panel.
4. Restore the stable collapsed layout. For reduced motion, perform the same semantic/focus ordering but snap the decorative layers and then shrink, with no wait for an animation event that will never occur.

The current `setBuddyMode` effect and a future coordinator must not compete to resize the same window. Refactor only that UI sequencing ownership when implementing. Keep the existing trust checks, IPC sandbox, work-area clamping, and voice/backend handlers. Do not continuously animate OS width/height or keep a large transparent window reserved around a tiny pet; transparent native regions can still intercept desktop input.

If a window hides, unmounts, or loses visibility during a transition, settle or cancel it deliberately and clean up callbacks. Avoid waiting indefinitely for an animation completion on a hidden page. Reopening from the tray should restore the saved UI state under a new operation ID, without a stale close callback firing afterward.

## Interruption, reversal, and rapid input

- Every valid toggle updates the target immediately. Do not disable the pet for 300ms or queue a stack of toggle animations. Repeated clicks/Enter should converge on the last target.
- The canonical first proof may serialize the avatar's 416.7ms click reaction rather than reset its contributing pose on every press. This does not serialize or disable panel toggles: layout intent still updates immediately. Richer avatar retriggering needs a separate later visual test.
- Keep one active shell timeline per animated element. For a fixed reversible path, reverse/change playback direction without resetting its current time. For a path whose anchor changes, sample current presentation, stop the prior animation, and retarget to the new geometry. Any completion handler checks the operation ID and desired target again.
- Catch expected animation cancellation. WAAPI's finished promise changes when an animation leaves its finished state and cancellation rejects it; a promise resolving is not enough to assume the same user intent is current. [W3C Web Animations](https://www.w3.org/TR/web-animations-1/)
- Keep draft/message state outside transient animation wrappers. Reusing a persistent view or rehydrating from saved state is preferable to allowing an exit wrapper to recreate the textarea and clear selection.
- During speaking interruption, let the existing voice owner stop output immediately. Drop the obsolete speaking/level contribution and blend toward the newly mapped phase. Do not finish a Speaking clip, wait for the shell, or play Done before acknowledging the new utterance.
- A failed native expansion keeps the current usable pet, restores consistent disclosure state, and presents a readable error through existing UI feedback. It must not leave invisible focus in a clipped panel.

## Why CSS/WAAPI first; where springs or FLIP help

**For this first slice:** use native animation for the small decorative shell movement and authored/procedural Three motion for Sprout. Store the animation handle and operation ID; use a short reversible path. Keep blur strength, shadow blur, noise, and reading-surface color static during that motion. Prefer transform/opacity only on decorative layers; do not fade body text through low-contrast intermediate states. Both Google and Motion describe transform/opacity as conservative animation choices and recommend profiling other properties. This does not prove that a large backdrop-filter layer is inexpensive on the installed desktop. [Google animation performance guide](https://web.dev/articles/animations-guide), [Motion performance guide](https://motion.dev/docs/performance)

**If later geometry needs it:** FLIP-style measurement means capture the old position, commit the new layout once, calculate the inverse offset, then animate that offset to zero. Apply position projection to the pet/decoration only. Avoid scaling the whole conversation. Native window resizing changes the coordinate origin, so compare screen-space anchors rather than assuming the old DOM viewport stayed fixed.

Motion's official layout documentation and [interactive layout example](https://examples.motion.dev/react/layout-animation) are useful studies of measured layout transitions. Its docs also explain scale distortion of children and offer position-only layout animation for suitable content. That is a reason to keep reading text outside a scaled shell, even if a library is later adopted. [Motion layout documentation](https://motion.dev/docs/react-layout-animations)

**If a spring is justified:** choose one critically/strongly damped interaction channel and define how it is retargeted from current value and velocity. Motion's `spring` generator samples a physics-based curve at explicit elapsed times; its CSS guide distinguishes visual arrival time from remaining settling. These are useful for aligning a body rebound with a shell settle. Do not assume a spring automatically solves native bounds or focus ordering, and do not import Motion and React Spring together. The initial keyframe implementation remains the preferred proof. [Motion spring](https://motion.dev/docs/spring), [Motion CSS springs](https://motion.dev/docs/css)

Avoid page-wide screenshot/view-transition choreography for this live composer. A small persistent interaction needs reversible state, stable focus, and usable input while decoration settles.

## One-slice prototype storyboard

Build this first in the existing studio with an actual Sprout GLB and face-containing authored fallback. Label every scripted voice/task state **simulated**. The same story can then be repeated through the real desktop controls without changing voice ownership.

| Beat                       | Person's action and visible result                                                                                                              | Semantics and evidence                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Quiet first frame       | Sprout floats still, with clear navy eyes and Prism edge light. The panel is closed.                                                            | Real named pet button; state text says Ready/preview. No automatic microphone call, fake audio level, or mandatory idle loop.                                                       |
| 2. Open                    | Click or Enter. A gentle squash starts; the compact shell appears once bounds/layout are safe. Text appears fully opaque at its final geometry. | Valid `aria-expanded`/controlled region; predictable panel focus; no clipped top/bottom during native resize. Target remains reversible.                                            |
| 3. Type                    | Type “Keep this draft while I talk.” Move the caret and select a word.                                                                          | Input remains stable and readable. In the studio, sending stays unavailable with an explicit explanation. Do not fabricate a generated reply.                                       |
| 4. Listen → think → speak  | Use labelled preview controls to select each phase. Then repeat using existing real voice controls in the native pass.                          | HTML phase updates immediately. Avatar pose blends; composer/draft/selection do not jump. Null level is permitted. Simulated intensity, if tested separately, is labelled.          |
| 5. Interrupt               | In the studio, choose the interruption preview; in the native pass, interrupt the real spoken answer or use the existing Stop action.           | Speaking contribution stops immediately; correct mapped state/status appears. No stale success expression or queued output. Interruption remains the existing voice/task operation. |
| 6. Collapse while active   | Escape in the panel or activate the pet/collapse control.                                                                                       | Focus returns before hiding; draft and scroll survive; shell exits before bounds shrink. Voice/task state is not changed by visual collapse.                                        |
| 7. Reopen and stress       | Reopen, confirm the draft, then perform rapid open/close/open.                                                                                  | Last target wins; no old shrink callback, duplicate tab stops, orphan animation, or lost text.                                                                                      |
| 8. Preferences and failure | Repeat with reduced motion, Pause motion, Solid surfaces, unavailable WebGL, and context loss/restoration.                                      | Immediate usable layout, static readable expression, authored fallback, stable controls. No preference pauses real voice accidentally.                                              |

This prototype deliberately stops before adding a detail drawer or richer idle library. Once it proves coordinated motion, reuse its coordinator/adapter for those additions instead of starting a second animation system.

## Accessibility and motion behavior

The pet is a disclosure button activated by Enter/Space. The conversation remains nonmodal; it must not trap focus while the desktop stays available. Opening moves focus only once for the latest intentional action. Closing restores it before the controlled content disappears. Existing menu/modal Escape handling gets priority. [W3C APG Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)

Respect system reduced motion before the first animated frame and when the preference changes mid-transition. Reduced/paused mode removes squash, bounce, gaze/parallax, blink, and decorative loops; it preserves phase labels, still expressions, input, and instant panel operation. W3C's animation-from-interactions criterion is Level AAA; we adopt its disable-nonessential-motion behavior as a product requirement. Continuous automatic movement alongside content also needs pause/stop/hide treatment under the applicable Level A criterion. A persistent Pause motion control addresses our optional loops independently of voice Pause. [W3C Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

Keep focus outlines fully opaque and outside clipped decoration. Preserve the earlier 18px body/large-text/opaque reading-well goals. Solid surfaces/forced colors remove ornamental glass effects while keeping the same controls and ordering. Do not announce animation progress, level samples, or blinking; announce meaningful status changes and new conversation content through existing HTML semantics.

## Measurable gates, not claimed performance

### Interaction and native geometry

- [ ] Record the full storyboard on the browser studio and the actual Electron host. Review edge docking, narrow/short work areas, display scaling, and monitor changes. Include a slow native-bounds acknowledgement to expose clipping races.
- [ ] Test close before expansion completes; reopen during exit; repeated pointer/Enter/Space toggles; Escape during each stage; preference changes mid-transition; hide/reopen; unmount; a rejected native request; and delayed/out-of-order completion callbacks. Latest intent must win.
- [ ] Assert no panel content/focus is exposed before safe layout, no native shrink occurs while the shell is still visible, and a previous exit cannot shrink a newly open panel.
- [ ] Assert preserved draft, selection where possible, conversation scroll, exact message values, real task/voice state, and existing interruption behavior. No duplicated visible or focusable textarea.
- [ ] Phase change, Stop, and real interruption take effect without waiting for any decorative finish callback. A null level works; malformed/stale level cannot change phase or keep speaking motion alive.

### Render and frame budget

- [ ] **Target 60fps for active press/reaction and panel transitions on the agreed reference desktop**, subject to recorded proof. A 60Hz frame allows about 16.7ms total work; this is an engineering target, not a guarantee across devices. Report the hardware, viewport/DPR, median/p95 frame time, missed frames, and largest stalls from a production-build trace.
- [ ] Measure with the actual GLB and glass shell while typing, switching phase, and reversing the panel. Do not report only a smooth empty canvas or a warmed-up idle screenshot. Check first load separately from steady-state motion.
- [ ] Current 15/30fps renderer caps need a targeted active scheduling change if they prevent the reaction target. Idle may rest on demand; blink/hover/state change can request a bounded redraw/animation interval. A low-power fallback can reduce ornament or render a still face while preserving immediate controls.
- [ ] Keep one avatar render loop, no per-frame React state churn, bounded DPR, and no repeated scene/model/material allocation during phase changes. Compare memory/resource counts before and after repeated open/close to catch extra loops or retained scenes.
- [ ] Profile blur/transmission/shadows rather than assuming compositor-only cost. If they miss the frame budget, reduce layer extent, model/material cost, or ornament; preserve the face and opaque text. Avoid continuously animating backdrop blur radius and large box-shadow blur.
- [ ] Verify no decorative animation loop while hidden, offscreen, paused, reduced motion, context lost, or disposed. Context restoration returns the current phase once, without stealing focus or replaying obsolete acknowledgement.

### Accessibility and truthful preview

- [ ] Keyboard and screen-reader sequence matches the visible state. Test at enlarged text, 320/390px preview widths, forced colors, solid surfaces, and no motion. Focus is never clipped or left in hidden content.
- [ ] Compare rendered still frames across a meaningful interval in paused/reduced mode; verify state/control operation still works. Do not make hardware-specific snapshot baselines the primary animation assertion.
- [ ] Maintain an explicit simulated-state label and confirm zero backend/microphone calls in the visual studio. Real desktop validation is separate and uses existing controls.
- [ ] Reuse the current meaningful draft/focus, fallback, and context recovery regressions; add reversal/native acknowledgement cases only after the implementation exposes those behaviors. Passing tests should name what they proved, not claim universal smoothness.

## Review artifacts to produce after implementation

Deliver an actual-size still, a short recording of the full storyboard, the same interaction with reduced motion, a native edge-docking recording, and a production-build performance trace with the measured frame summary. Include the model's clip/morph manifest and known fallback behavior. These concrete proofs decide whether additional springs, R3F packaging, or a Next.js web shell are useful next steps.
