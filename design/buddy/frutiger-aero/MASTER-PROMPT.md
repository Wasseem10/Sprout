# Consolidated implementation prompt — Sprout / Prism

Revision **3**, **2026-10-10**. Consolidated after the upstream and stack/audio audits. Reuse the implemented voice/rendering paths and add only the missing character/presentation work. This supersedes the earlier Ripple/required-steel brief. The portrait layout below is the chosen starting prototype and must be reviewed in the actual app; it is not a completed or frozen layout.

The text under **Copyable prompt** is the full implementation brief. Its references provide detailed contracts and review recipes. This document has not executed generation, edited Blender or changed the runtime.

## Copyable prompt

Build the next visual version of **InsightOS** around **Sprout**, an original interactive jelly creature in the **Prism** palette. Create a beautiful, expressive floating companion and a compact expandable conversation panel. Scope this work to presentation, original assets and their UI integration. Preserve the cousin's backend, financial logic, OCR/database verification, provider sessions and existing voice/task interruption behavior.

### Inspect and preserve

Work in the isolated InsightOS UI checkout and its existing **ui/presentation-polish** branch/draft PR. Read applicable AGENTS instructions and this folder's README, PRODUCTION-WORKFLOW, HIGGSFIELD-UPSTREAM, ANIMATION-WORKFLOW, INTERACTION-MOTION-WORKFLOW and REFERENCE-RECIPES before editing. Inspect the running app, asset inventory and live Blender state. Keep existing Ribbon assets available until the replacement passes its gates.

Read STACK-AUDIO-AUDIT for implemented versus planned work. Reuse existing ElevenLabs Scribe/TTS, interruptions, phase mapping, TypeScript, desktop controls, and the UI branch's Blender/GLB/Three rendering path. Voice is already implemented on upstream master; the Ribbon renderer is in the draft UI branch. Refresh those refs before implementation. This is InsightOS visual work; aerospace projects and portfolio navigation in the pasted reference are examples, not new product scope.

The current host is React 19/Vite/Electron/direct Three, without Next.js or R3F. Prove the exported character there first. Package the proven avatar/controller into a bounded R3F component reusable by the desktop host and a later Next.js browser shell. Verify compatible dependencies; R3F 9 is the React 19 line. Read the actual host's installed Next documentation before Next code. The unrelated Next project at the workspace root is outside this task.

Use GLB and Sprout's custom rig. Mixamo, VRM and three-vrm are omitted from this workflow because their humanoid structure does not match Sprout. R3F/Drei remain later packaging; use their helpers selectively, with one mixer update per frame. Keep CSS/WAAPI for the first panel proof. GSAP scroll sequences, Zustand, Rapier and an extra spring/UI library are deferred until a named unmet requirement justifies one bounded experiment.

Before Blender mutations, load the connected bridge's core and relevant scene/modeling/lookdev/lighting/animation/audit modules, check the live host, inspect the scene, record a Scene Passport, and checkpoint broad changes. One agent owns the live Blender scene. Preserve unrelated objects and the active file path.

### Character and visual identity

Use the saved avatar board's **Sprout** column and the palette board's **Prism** column as visual references. Inspect them before authoring or using them in generation. Model a compact softly pear-shaped jelly body, two short unequal rounded buds, two stubby rounded feet/base lobes, large deep navy oval eyes and small white glints. Shorten the concept's long buds in the clay study, starting around 12–18% of body height. Keep a clear frontal face and stable deformation region. Defer the mouth until the eyes work at tiny size.

Keep blue/aqua dominant, with one graceful violet-to-coral side/lower sweep and broad controlled white reflections. Encode color with portable vertex color or a baked texture. Keep eyes opaque and independently editable. Supports are optional and deferred; the first proof floats with its feet visible.

Use image generation for annotated original concepts and matched look studies. Follow the portfolio method: reference extraction → clay and poses → matched lighting → actual exported asset → final-size critique. Record exact prompts, provenance and observed corrections. Generated miniatures are not application measurements.

### Higgsfield upstream, Blender quality control

Use a hybrid authoring route when it helps. A supported Higgsfield text/image-to-3D job or editable 3D Jutsu scene may supply an initial mesh or scene blockout. Preserve the untouched output and its provenance. Inspect scale, axes, origins, disconnected geometry, normals, topology, UVs, materials and any actual skins/morphs/clips. Clean, redesign or retopologize in Blender until the approved silhouette and deformation structure work.

Establish local proxies and camera framing before resolving generated assets. For a generated candidate, discover current tool schemas and a non-spending estimate, report the selected model/parameters/cost, then submit within the user's authorized scope. Do not use a paid submission to discover price. If the connected tool set cannot express or estimate that job, record the gap and continue with an original Blender-authored mesh. Local blocking uses no generation credits.

Treat generated motion as an optional editable starting study. Verify rig compatibility, retarget/bake useful channels to Sprout's controls, and refine normal Blender keyframes. Human motion or video is not evidence of a working Sprout rig or GLB animation. Standalone 3D Jutsu export is an intake path, not proof that all desired controls/materials survived.

Higgsfield remains upstream authoring only. Ship owned/versioned local GLBs, textures and fallbacks. Viewing or interacting with Sprout must work without a Higgsfield API, MCP server, temporary result URL or live authoring session.

### Geometry, rig and clean animation

Keep an editable source and a separate runtime basis. Finalize runtime topology, normals and UVs before skinning and relative shape keys. Initially use one verified runtime mesh; add LODs only for measured need, with corresponding weights/morphs independently proved. Preserve broad highlights and silhouette during reductions.

Follow ANIMATION-WORKFLOW's minimal nine-bone FK rig, three broad body-jelly keys, stable face patch, separate lids and unkeyed gaze. Author the four initial clips **Sprout_Idle, Sprout_Listen, Sprout_Click, Sprout_Blink** before Think/Speak. Start at 24fps authoring/sampling; increase short-reaction sampling only if exported playback visibly needs it. Match loop endpoint pose and seam velocity. Inspect combined extreme poses, animated bounds and face intersections.

Give every animated property one owner. One base mixer/compositor owns body bones and the whole body morph vector. Click owns its reaction root, blink its lids, gaze its unkeyed nodes. Retarget current action weights from the visible mixture; never reset an action while it still contributes. Guard completion callbacks with action identity/current operation tokens.

The local controller combines authored GLB clips with live phase, pointer and optional audio inputs. Individual pose updates require no AI/server request. Authored clips are reusable motion components of this interactive system.

Advance the mixer once per rendered frame using elapsed seconds. Use elapsed-time damping for gaze and reset the clock after hidden/restored periods. Target 60fps during active reactions/panel transitions, verified on the reference desktop; existing 15/30fps caps are a baseline to improve. Distinguish looping idle from a parked pose: author a gentle settle/wake path if idle rests on demand, and restart before the first response frame.

Status, Stop and interruption remain immediate. Begin with real phase-driven expression. Optional numeric audio levels come read-only from the existing voice owner; they never detect phase or create a microphone session. Studio events are explicitly simulated. Reduced/paused motion uses a stable readable pose while the controls still work.

### Add measured sound reactivity through the existing voice owner

The existing fallback microphone RMS analyser is internal and does not expose avatar levels; realtime Scribe input has no verified visual-level source. Current TTS uses HTMLAudio playback without an output analyser. Add a narrow presentation snapshot/ref only where the voice owner can supply a supported source: authoritative phase, optional normalized input/output level, availability, freshness and playback generation. Keep unavailable sources null rather than opening a second microphone or switching to Conversation SDK for volume getters.

Observe existing playback with a supported Web Audio analyser branch while preserving audible output, user activation, interruption, pause/error/end and cleanup. Measured output is zero or unavailable during fetch, before playback, pause, completion and cancellation. A speaking phase alone is not evidence of audible samples. On interruption discard the old output generation immediately; smoothing must not keep obsolete speech motion alive.

Voice owns its capture/playback resources and analysis lifecycle. Avatar hide/unmount stops visual sampling/rendering, without stopping voice, closing its AudioContext or changing capture thresholds. Preserve ownership when attaching or detaching consumers.

Sample numeric values in the render controller without per-frame React state. Start with a bounded light/expression envelope; route later body deformation through its one authoritative morph compositor. Do not write shader/mixer/morph values competitively. Use elapsed-time attack/release and keep phase/status immediate. Silence settles intensity, not conversation phase. Observe user-selected audio only when such a source exists; beat detection, music playback and system-audio capture are not required.

Prove current-state transitions first, then test real input/output envelopes as an independent slice before material polish. Studio synthetic levels are explicitly labelled and make no microphone/backend calls. Preserve the current public preview's microphone policy. Volume-driven mouth opening is optional expression, not phoneme/viseme lip-sync; defer a timed viseme subsystem until the character's mouth and an actual timing source warrant it. No new AI provider, WebRTC architecture or conversation backend belongs in this visual task.

### Export and browser look development

Export versioned **.glb** files, with semantic hierarchy, skins/morphs and separately named logical clips. Bake authoring-only constraints/drivers into supported TRS/weights. Keep export Apply Modifiers false for the morph mesh after topology operations are already complete. Preserve morph positions/normals and audit actual sampled channels for unwanted overlap.

Produce a canonical uncompressed export, semantic manifest, validator report and transparent PNG fallback rendered from the approved authored character. Run the deterministic interrupted clay replay in current Three and Electron before final lookdev. File validity alone is not acceptance.

Use a fixed near-front camera, broad key reflection, soft fill and cool rim. Compare neutral/Prism and glossy-jelly/transmission candidates with identical camera, pose, exposure and render size. Recreate the lighting/reflection structure in Three; GLB does not reproduce an entire Cycles shader/compositor/area-light setup. Match actual silhouette, face, color and highlights rather than claiming identical offline/browser pixels.

Authored morphs provide the initial jelly motion. A custom GLSL deformation is optional after a matched comparison shows a specific missing effect; preserve face/sole masks, correct shading normals and animated bounds. An elastic spring or soft-body simulation must earn its added cost and cannot take ownership of already keyed properties.

### Compact interface and coordinated motion

Prototype a roughly **96px freestanding pet** opening a portrait conversation surface around **392px wide / 560px tall**, adapting to work area and enlarged text. These are starting dimensions. Derive native bounds from pet, panel, shadow and focus geometry; current 360×86 collapsed/440×580 expanded bounds are only the baseline.

Place Sprout beside the upper dock corner, clear of text and controls. Use one identity/status header, one continuous reading well and a fixed composer. Requested detail uses a secondary/replacement view with a clear Back action. Make the reading surface nearly opaque cloud-white with navy text, blue primary controls and restrained Prism highlights on the glass frame.

Use accessible HTML for conversation, status, input and actions. Start with 18px body text, generous line spacing, 44–48px controls and measured contrast; sustained reading should aim at 7:1. Reflow at 320 CSS px and enlarged text. Keep opaque/solid surfaces, keyboard focus and readable status available without the canvas.

One reversible panel coordinator owns latest intent. Acknowledge press immediately; apply and confirm safe native bounds/layout before exposing panel content. Restore focus before hiding content; finish exit decoration before shrinking bounds. Stale callbacks cannot shrink a reopened window. Preserve draft, selection where possible, scroll, dragging, shortcuts and Electron security.

Use restrained CSS/WAAPI transforms for decoration. Keep text, input scale, blur radius and reading surfaces stable. Panel expansion does not start voice or cancel a task. Clicking/keyboard activation performs the real open action even while the avatar reaction continues.

### Optimization, integration and delivery

Preserve the canonical GLB. Build compressed derivatives only after measured need: use Meshopt or Draco with explicit matching GLTFLoader decoders, and KTX2 only for textures that benefit, with supported renderer detection. Compression does not by itself reduce vertices or draw calls.

Use selective transforms, preserving gaze anchors, semantic names, normals, attributes, skins, morphs and animation channels. Do not blindly prune/join/deduplicate or decimate an already morphed mesh. Compare manifests, replay and screenshots after each transform; rebuild deformation data if topology changes. Measure transfer size, decode/first render, active frame intervals, stalls, draw calls and memory, including cold load.

Preserve lazy loading, abort/cleanup, bounded render resolution, hidden/offscreen suspension, static fallback and context recovery. R3F instances clone skinned hierarchies and own mixers; cleanup does not dispose resources shared by a cached template. Mount/unmount and rapid phase changes must not create extra loops or per-frame React state churn.

Optional original background images/video belong to demo or presentation contexts where interaction is unnecessary. Store local optimized assets with provenance and a static fallback; keep the desktop companion and reading well calm. They are not a replacement for the interactive avatar.

Deliver actual-size stills, the animation replay, open/type/interrupt/collapse/reopen recording, reduced-motion/no-WebGL proofs, native edge-docking proof and a production performance trace. Check bright/dark/busy backgrounds, long content, keyboard/screen-reader flow, draft preservation, context recovery and rapid toggles. Verify deployed GLB URLs return binary assets rather than HTML fallback.

Keep the user's work reviewable in the existing draft PR; publish/merge only within the authorized task scope. Report editable source/checkpoints, asset provenance, hashes/manifests, passed checks, remaining defects and deliberate approximations. Follow the source-save policy and never overwrite an unrelated Blender file. Complete each reversible pass, inspect its output and correct the largest visible defect before moving on.

**Begin with the actual-size clay Sprout and four-clip exported motion proof.**

## Supporting packet

- [Upstream audit](HIGGSFIELD-UPSTREAM.md)
- [Implemented stack and audio audit](STACK-AUDIO-AUDIT.md)
- [Production runbook](PRODUCTION-WORKFLOW.md)
- [Canonical animation/export contract](ANIMATION-WORKFLOW.md)
- [Panel/native motion contract](INTERACTION-MOTION-WORKFLOW.md)
- [Primary example experiments](REFERENCE-RECIPES.md)
- [Selected character study](AVATAR-STUDY.md) and [palette study](PALETTE-STUDY.md)
