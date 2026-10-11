# Sprout / Prism — glossy refinement launch prompt

Revision **6**, **2026-10-10**. This implementation brief was prepared after reviewing the user's two-page reference PDF and delivered Sprout v002. Its implementation is recorded in the [v003 delivery guide](../sprout/DELIVERY-v003.md) and [refinement audit](../sprout/GLOSSY-REFINEMENT-AUDIT.md). The previous completion contract remains available in [revision 5](MASTER-PROMPT-v005.md); its outstanding external acceptance is not erased.

Copy the complete section below, or use [SPROUT-LAUNCH-PROMPT.txt](SPROUT-LAUNCH-PROMPT.txt). The [worker prompts](GLOSSY-SPROUT-PROMPT-PACK.md) divide the same work without competing file ownership.

## Copyable prompt

Implement the next visual refinement of InsightOS: a luminous, glossy, gently gooey **Sprout** in the **Prism** palette, paired with one beautifully restrained glass conversation panel. Continue from delivered Sprout v002. The user wants the blue to feel like glass with depth, lavender/coral to blend as undertones, the whole creature to gently follow the pointer, and the expanded panel to lose redundant copy and controls.

Complete the authorized local implementation, inspect the real application, correct visible defects and deliver reviewable evidence. A concept image or Blender beauty render alone is not the finished result. Make routine reversible decisions without reconfirmation. The first review checkpoint is **the existing control plus two real material candidates, a whole-body attention proof, and one stripped-down glass panel**. Continue from that checkpoint toward the best measured result; it is not an automatic approval stop.

### 1. Working context, scope and ownership

Work in **D:\hackathon2026\insightos-ui**, branch **ui/presentation-polish**, with the existing draft UI PR https://github.com/Wasseem10/insightos/pull/1. Confirm checkout, current branch, applicable AGENTS instructions and local diff before edits. Fetch and inspect upstream changes without resetting, overwriting or automatically merging the cousin's work. Preserve unrelated edits. Keep UI work reviewable on this branch; existing authorization covers scoped commits/pushes and updating that draft. Do not merge, deploy production or send messages to the cousin as part of this brief.

Read these current delivery records first:
- design/buddy/sprout/README.md
- design/buddy/sprout/SCENE-PASSPORT.md
- design/buddy/sprout/ACCEPTANCE-AUDIT.md
- The current renderer/controller/panel code and package.json.

Then consult the design packet's ANIMATION-WORKFLOW.md, INTERACTION-MOTION-WORKFLOW.md, REFERENCE-RECIPES.md and HIGGSFIELD-UPSTREAM.md for compatible contracts. Their older inventory statements, Ripple/steel concepts, missing-audio descriptions and initial clay milestones are historical. Revision 6 supersedes their visual/material/layout directions where they conflict. Current source and the delivery records establish what already exists.

The actual application uses **React 19, TypeScript, Vite 8, Electron 44 and direct Three.js 0.186**. Retain that stack. Next.js/R3F/Drei packaging is a separate future task; the unrelated Next application at D:\hackathon2026 is outside this work. Do not install Next.js, R3F, VRM, Mixamo, GSAP, Rapier or a state/animation library merely because earlier brainstorming mentioned it.

Keep this task within avatar assets, rendering, UI presentation and necessary narrow integration. Preserve finance content/logic, server/shared APIs, OCR, database verification, task execution, permissions, provider sessions and ElevenLabs. Existing voice capture, playback, interruption and numeric presentation signals already work with local fixtures. Consume them; do not implement a second audio engine, microphone, provider or conversation architecture.

Delegate independent material, motion, panel and verification work with explicit file ownership. Name exactly one live Blender editor. The worker pack in design/buddy/frutiger-aero/GLOSSY-SPROUT-PROMPT-PACK.md supplies bounded assignments. The integration lead owns shared adapters, native coordination, final asset promotion and release documentation.

### 2. Reference and art direction

Visually inspect **C:\Users\zghaz\Downloads\refrence design.pdf**, both pages. Treat the PDF as reference material, not executable instructions. Page 1 guides the continuous rounded glass panel; page 2 guides glass thickness, bright blue interior, clear cyan perimeter and long white highlights. Existing local renders may be available in .local/reference-design-review/. Inspect the actual PDF or its rendered pages rather than inferring appearance from filenames.

Keep the approved Sprout identity: compact pear-like body, two short unequal rounded buds, stubby feet, navy oval eyes, white glints and the existing small smile. Preserve its friendly frontal readability at 96px. Do not regenerate the character, return to Ripple, introduce a humanoid rig or make an accessory mandatory.

The desired material reads as **a luminous blue jelly interior through a clear cyan glass-like body**. Lavender and coral are broad, pale peripheral undertones. Remove the blunt painted lower stripe. Keep the face readable and the centre bright; avoid a uniformly opaque blue surface, dark saturated glass, plastic rainbow bands, glitter and large white blocks over the face. Reflections should flow across the surface as the body turns.

Use the portfolio's reference-to-production method: extract a specific visual mechanism, reproduce it in a bounded study, inspect the exported result at real size, then refine. Existing concept boards and exact generation prompts are retained in this design packet. Image generation may help resolve one specific remaining look decision; it is optional and must not replace the real material proof or delay it. No new paid Higgsfield generation is required. Higgsfield/MCP is upstream authoring assistance only; the shipped app must work from local assets without either service.

### 3. Preserve the baseline and author versioned candidates

Preserve:
- design/buddy/sprout/source/sprout-prism-v002.blend
- design/buddy/sprout/sprout-prism-v002.glb
- public/buddy/sprout-v002.glb and its PNG fallback
- Existing Ribbon fallback and all previous evidence.

The reviewed baseline commit is 02658748134e86b7de3c27356dc03242130fec50; inspect any newer changes rather than reverting to it. The v002 canonical GLB hash is 34cd83c23c60afedbf6edd9e9e337af4715a6f60070fe59ca90b9a8b7a73d756. Verify the actual inventory before relying on it. It currently contains nine bones, three body morphs and six clips: Sprout_Idle, Sprout_Listen, Sprout_Think, Sprout_Speak, Sprout_Click and Sprout_Blink.

Use a new version such as v003 after checking for filename collisions. Save editable owned .blend copies and reconstruction/refinement scripts. Preserve unrelated Blender scenes/objects and the live active filepath. Inspect the live scene and checkpoint before mutation; do not rerun old construction scripts blindly over the saved master. A separate background Blender process is suitable for read-only renders.

Compare three candidates with the same silhouette, pose, camera, exposure and light arrangement:
A. Existing v002 control.
B. One closed body using physical transmission plus meaningful thickness, volume and attenuation.
C. A clear outer body with one inset blue core, if that layering better reproduces the reference.

Keep B and C separate for review. The previous transmission study lacked volume/thickness; do not treat it as proof that volumetric glass cannot work. Split lids from the body's transmissive material: body and lids currently share MAT_Sprout_Prism. Eyes, lids, glints and smile must remain reliably readable and opaque where appropriate.

For candidate C, an initial experiment may use transmission 0.80–0.92, roughness 0.08–0.14, metalness 0, IOR 1.33–1.40, clearcoat 0.7–1, coat roughness 0.04–0.08, thickness 0.25–0.60 current model units, and pale-blue attenuation distance 3–6. These are tunable starting ranges, not fixed acceptance values. Avoid double-darkening with both saturated surface colour and strong blue absorption. Start the core around 78–86% of the central lobe width so the buds, feet and perimeter retain visible clarity.

If a core is selected, it must follow the same authored skin/morph motion and remain inside the shell during combined extremes. Prove this in motion; a rigid core acceptable in one still is insufficient. Preserve correct normals, morph-normal deltas and face attachment. Update semantic manifests and channel ownership checks deliberately when geometry changes; never silence assertions to pass a new asset.

Export portable GLB materials and supported extensions. Verify actual KHR_materials_transmission, KHR_materials_volume, IOR and nonzero thickness in the export. Keep physical transmission separate from alpha opacity; start with opacity 1 and document thickness units/attenuation. Blender node graphs and Cycles effects do not transfer automatically. Preserve topology for existing deformation data; any topology change requires rebuilding and checking affected weights/morphs. Keep a canonical uncompressed GLB, manifest, validator report and authored transparent PNG fallback.

The selected result must look convincing in the actual browser and Electron renderer at **44, 96, 160 and 320 CSS pixels**, including bright, dark and busy backgrounds. Prioritize the normal 96px companion and 44px face readability over a large marketing render.

### 4. Whole-body attention, goo and responsive highlights

Inspect src/buddyRenderer.ts and src/buddyMotionController.ts before changing motion. Sprout currently follows with gaze nodes while the existing outer mount does not receive the Ribbon branch's attention rotation.

Give the unkeyed outer mount above SPROUT_ROOT sole ownership of whole-character attention yaw/pitch. Start around **±10 degrees yaw and ±6 degrees pitch**, with no pointer-driven roll. Verify signs against the current camera: rightward pointer should turn the creature toward it; upward pointer should tilt attention upward. Use elapsed-time damping, starting around lambda 8–10, so the existing faster eyes lead and the body follows gently.

Use finite, clamped local avatar/panel pointer coordinates and a stable interaction region. Return smoothly to neutral on pointer leave, blur or invalid tracking; reset appropriately when hidden/restored. No global OS pointer capture. Visual rotation must not move the DOM hit target, trigger window dragging or jitter native bounds. Size the render framing for rotated animated geometry.

Strengthen restrained softness: a small delayed settle, subtle body compression/recovery and soft bud lag where the rig allows. Keep the face stable, feet coherent and motion calm. Do not make Sprout constantly wobble, spin or behave like a liquid simulation. Route body deformation through the existing authoritative morph compositor. Every animated property has one owner: base bones/morph vector, click reaction root, lids/blink, gaze and outer attention mount must not compete.

Retain all six clips, interruption handling, crossfades from the visible mixture, one mixer advance per frame, time-independent damping and stale-callback protection. Add no per-frame React state updates. Pause/reduced motion must provide a stable readable pose; hidden/offscreen/minimized states must suspend visual work without stopping voice.

First let the **body rotate through fixed broad reflection cards and a stable environment**. Shape long soft highlights and a clear rim. Do not rebuild PMREM or an environment render target per frame. Only if this does not provide enough response, test a very small coherent environment/light adjustment (for example ±2–3 degrees) and keep the face exposure stable. Avoid a bright cursor spotlight.

Reuse fresh optional input/output levels from the existing presentation bridge. Authoritative voice phase controls state; amplitude only modulates a restrained secondary envelope. Old playback generations must stop influencing motion immediately on interruption. Missing levels remain unavailable, with phase-only fallback. No new mic, speech recognition, music capture or phoneme/viseme subsystem is needed.

### 5. Clean up the actual expanded panel

Refine src/DesktopBuddy.tsx and src/buddy.css around **one continuous glass frame, one identity/status row, one conversation reading well and one fixed composer**. Update the actual native component, not just a studio imitation.

Concrete cleanup:
- Remove the visible “HERE WITH YOU” and “Let’s figure it out.” title block. Keep an accessible conversation heading and existing live-log semantics.
- Remove the long welcome paragraph. Put the existing four suggestions in a compact labelled **Ideas** disclosure, retaining their real handlers.
- Replace the permanent six-icon footer toolbar with one labelled **Tools** disclosure/menu containing the same utilities, permissions, disabled states and actions.
- Place the existing voice start/pause control beside the composer when expanded. Preserve collapsed voice access.
- Keep **Stop task and audio** directly available while active. Pause voice and Stop retain their existing different meanings.
- Retain collapse, hide-to-tray, access to settings/window selection/workspace and a clear return from the workspace.
- Remove duplicate permanent shortcut/help text and duplicate task/status copy where the information is already conveyed. Retain necessary accessible help, truthful microphone status, errors, approvals, provenance and result actions.
- Reduce visual uppercase speaker-label noise without losing user/assistant/error identification.

Use labelled semantic HTML controls. For Tools, implement a real accessible menu pattern or a disclosure with normal tab order; do not apply menu roles without the matching keyboard behavior. Escape closes Tools and restores its trigger first; a later Escape can collapse the buddy. Close the disclosure before opening existing modal dialogs. Keep popovers inside safe native bounds.

Retain the current portrait footprint as the starting point: 96px pet, roughly 392×560 reading panel inside the existing expanded window. Adapt to actual work area and enlarged text. Preserve the reversible coordinator's acknowledged native bounds before reveal, exit before bounds shrink, latest-intent reversal, focus, draft, selection, manual scroll position, dragging and keyboard shortcuts. Opening the panel never starts voice or cancels a task. Avoid changing that coordinator unless the new geometry requires a narrow coordinated change.

### 6. Glass construction and source study

Use these pinned MIT-licensed implementations to understand and adapt specific mechanisms. Inspect their source and licenses; retain MIT attribution if substantial code is adapted. Record exactly what was learned or reused.

- rdev/liquid-glass-react, commit ac48eab18d1f7f444ae30002d240cae29c863a21:
  https://github.com/rdev/liquid-glass-react/tree/ac48eab18d1f7f444ae30002d240cae29c863a21
  Inspect src/index.tsx and LICENSE. Its official demo is https://liquid-glass.maxrovensky.com/.
  Study edge-masked displacement, subtle RGB edge separation and keeping the central content sharp.
- aberhamm/liquid-glass-react, commit 0e8da46da1da35055d60a027faea8e4cfae91088:
  https://github.com/aberhamm/liquid-glass-react/tree/0e8da46da1da35055d60a027faea8e4cfae91088
  Inspect src/liquid-glass.tsx, src/liquid-glass.stories.tsx and LICENSE.
  Study separate surface/shadow/highlight/rim/content layers, frosted defaults and reduced-transparency handling.

Begin with a simple layered CSS implementation: a substantial rounded clear-looking rim, cool cyan along the upper/left edge, soft lavender near the lower/left, a restrained coral edge opposite it, thin white highlight, inner bevel and soft shadow. Keep one continuous material rather than separate coloured header/footer bands. A 6–10px decorative rim is a starting study, not a required layout measurement.

Use a nearly opaque cloud-white/blue reading surface with dark navy text. Starting colours may be #F8FBFF, #13243D and #34445E; validate the actual composited result. Keep text, input and live controls outside every blur/displacement layer. Do not duplicate the interactive conversation to imitate refraction.

Try bounded edge-only SVG lensing only if it visibly improves the CSS result on the tested host and stays within the performance budget. Do not import an entire wrapper library by default. Use one existing avatar canvas, not a second WebGL scene for the panel. Do not add desktop capture or live DOM screenshot textures for runtime refraction. Isolated captures of the app and owned controlled backdrops are allowed for visual QA; exclude unrelated/private desktop content.

Respect the real compositing boundary:
- Three transmission samples owned scene content; it does not optically refract the Windows desktop behind the canvas.
- CSS backdrop blur sees content within the web page/window, not other applications behind transparent Electron.
- Native Acrylic/Mica is an optional separately verified platform study; do not force a rectangular opaque native surface around the freestanding pet.

The default must look good through geometry, tint, highlights and a readable inner surface even when true background refraction is unavailable. Describe approximations honestly.

Preserve main conversation text at 18px and existing 22px Large mode, 44–48px controls, clear focus, 320px reflow and 200% zoom. Aim for 7:1 sustained-reading contrast on the actual surface; audit labels separately. Preserve forced-colour, reduced-transparency, paused/reduced-motion and solid/no-WebGL paths. Do not treat the PDF's small grey text or low-contrast reference demos as accessibility targets.

### 7. Build order and review

1. Inspect baseline/reference and capture current 96px Sprout plus the real collapsed/expanded UI.
2. In parallel, produce B/C material candidates in Blender, prototype mount-based attention on v002, and simplify the real panel with the base CSS glass recipe.
3. Integrate candidate exports in the existing renderer under matched conditions. Capture a labelled A/B/C board, pointer-motion clip and simplified panel. Choose the strongest candidate using actual small-size depth, face readability and measured cost. Explain the choice.
4. Finish the selected material and goo response, coordinate reflection lighting and glass rim colours, and correct combined-motion defects.
5. Promote only the reviewed versioned asset, regenerate its PNG fallback, align the studio with the real implementation and run relevant verification.
6. Deliver source, assets, evidence, a clear UI diff and launch instructions. Fix observed regressions before concluding.

The studio at http://127.0.0.1:5173/?studio=buddy must expose the real renderer and honest labelled simulations. The native companion is the final layout/compositing check. Reuse an already-running healthy development instance; otherwise inspect “Start InsightOS UI.cmd” and the current delivery guide. Do not kill the user's active app or launch duplicate services blindly. Make the finished preview visible to the user and report the actual URL/native launch method.

### 8. Validation and honest completion

This is a **new visual-refinement acceptance scope**. It can be completed using deterministic motion and synthetic local voice fixtures. The previous revision-5 end-to-end goal remains incomplete where live ElevenLabs, physical audio, human assistive-technology, other displays or physical presentation evidence was unverified. Do not close that old goal or rewrite its historical evidence as passed. Missing provider credentials do not block material, motion or panel work.

New glass geometry/materials invalidate relevant old visual/performance results. Recheck affected behavior; retain unrelated valid evidence instead of rerunning every backend workflow.

Required refinement evidence:
- Editable new Blender source, versioned canonical/runtime GLBs, matching hashes, manifest, validator result, PNG fallback and source/license notes.
- Actual-size A/B/C comparisons and a selected-result board on bright/dark/busy backgrounds. Native transparent-window checks must not be replaced solely by a CSS mock backdrop.
- Whole-body attention and return-to-neutral; idle/listen/think/speak/click/blink; clean interrupted transitions; combined deformation/core/face bounds. Check elapsed-time behavior at 30/60/120Hz through the established deterministic replay.
- Open/type/voice-fixture interrupt/collapse/reopen/workspace-return behavior preserving draft, selection, reading position and focus. Tools/Ideas keyboard flow, direct Stop and truthful state.
- Readability, enlarged text, 320px reflow, 200% zoom, forced colours, reduced/paused motion, no-WebGL and context recovery.
- A fresh compiled native performance/lifecycle pass with panel typing and repeated open/close/reversal. Target sustained 60fps on the reference desktop; report measured p95/max intervals and stalls. Measure new glass draw calls/render targets/resource growth. Verify hidden/minimized/offscreen suspension, restoration and disposal while voice continues independently.
- Fresh relevant builds and focused tests. Name failures, skipped checks and their actual scope.

Useful existing commands after inspecting current scripts:
- npm run build
- npm run build:public (use an isolated output when necessary to avoid overwriting the default native bundle)
- npm run typecheck and focused Vitest/Playwright checks for changed behavior
- node scripts/verify-sprout-native.mjs --production-bundle
- node scripts/verify-sprout-native.mjs --cold-load
- node scripts/verify-sprout-native.mjs --edge-panel-record
- node scripts/verify-buddy-runtime.mjs
- node scripts/smoke-buddy-panel.mjs
- node scripts/smoke-buddy-voice.mjs --record
- node scripts/audit-buddy-accessibility.mjs

Adapt affected replay/capture scripts to the new version rather than silently testing v002. Run GPU/native proofs serially and inspect resulting screenshots/videos. Distinguish synthetic audio from live provider/device use, rAF/render intervals from Chromium presentation feedback, and both from physical display scanout. Automated AX/keyboard checks are not a human screen-reader certification. Do not claim zero physical VRAM from context disposal.

Finish with the chosen material rationale, before/after visuals, working local preview, exact source/assets, relevant verification and remaining deliberate approximations. Keep the old evidence ledger intact and add a separate refinement record. Deliver a cohesive, brighter glass character and calmer panel that are visibly better in the real app.

## Supporting packet

- [Focused worker prompts](GLOSSY-SPROUT-PROMPT-PACK.md)
- [Delivered v002 inventory](../sprout/README.md) and [scene passport](../sprout/SCENE-PASSPORT.md)
- [Historical acceptance ledger](../sprout/ACCEPTANCE-AUDIT.md)
- [Revision 5 snapshot](MASTER-PROMPT-v005.md)
- [Animation/export contracts](ANIMATION-WORKFLOW.md)
- [Native interaction contracts](INTERACTION-MOTION-WORKFLOW.md)
- [Original reference recipes](REFERENCE-RECIPES.md)
