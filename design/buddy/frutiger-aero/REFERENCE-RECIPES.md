# Sprout / Prism: practical avatar reference recipes

Research date: **2026-10-10**. This is a workflow study, not a record of completed experiments. The sources below were read, their repository revisions and licenses checked, and the hosted examples located. No new avatar, animation, runtime implementation, dependency, or deployment was created for this document. Interactive visual playback was not independently audited here.

The aim is an **original, cute conversational character with readable eyes and smooth, intentional motion**. The selected direction combines the **Sprout silhouette** with the **Prism palette**; the interface layout remains open. Reproduce that combination with original authored geometry and materials. Use these references to learn specific mechanisms. Bills remain useful dense-content stress tests; they are not the assistant's required identity.

The working application uses plain Three.js **0.186.1**, React 19, Vite, and Electron. An R3F/Next.js/Vercel web version is a proposed delivery route. R3F is a renderer wrapper; it does not provide better geometry, animation timing, lighting, or glass automatically. Prove the asset and controls in the existing renderer first, then compare an R3F adapter with the same asset and settings if it serves the web architecture.

Size checks must include the current **40–44 px buddy inside a native 360 × 86 px collapsed pill**, a proposed **roughly 96 px freestanding pet** that needs new bounds planning, and **160 px expanded/preview comparisons**. Current motion is driven by conversation phases. Measured microphone/speaker amplitude is a separate future integration with the existing voice owner.

## Provenance and fixed source revisions

All recipe links to source code below use repository heads captured on the research date. Live demos can move independently. Adapt APIs against the installed runtime rather than treating upstream `dev` or `master` as a dependency version.

| Publisher / repository       | Revision                                   | Code license                                                                                                       | Asset boundary                                                                                                             |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Three.js                     | `11738a9d55e502fb484cefffcea3a66dc44e9fe9` | [MIT](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/LICENSE)                    | RobotExpressive is explicitly credited CC0 in its example; Soldier is credited to Mixamo, so do not infer MIT asset rights |
| Poimandres Drei              | `bf6f4addf47467d3885de272d94ca5127f6ef68f` | [MIT](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/LICENSE)                        | Story assets, matcaps, and external textures need their own provenance; none are proposed for shipping                     |
| Poimandres React Three Fiber | `9e53355ce499ea518ac3729de7fd4dcc06d8cdb9` | [MIT](https://github.com/pmndrs/react-three-fiber/blob/9e53355ce499ea518ac3729de7fd4dcc06d8cdb9/LICENSE)           | The scheduling mechanism is reusable; linked sandbox assets are separate                                                   |
| Khronos glTF Validator       | `602c54043ba66856b2e68c40fdf2bced975cdb8a` | [Apache-2.0](https://github.com/KhronosGroup/glTF-Validator/blob/602c54043ba66856b2e68c40fdf2bced975cdb8a/LICENSE) | Validation does not supply or license the submitted model                                                                  |

Preserve applicable notices if substantial source is later copied. No reference character, environment image, or branded artwork needs to be included in our production avatar.

## Recipe 1 — independent facial expression over a moving body

**Example:** [Three.js RobotExpressive live demo](https://threejs.org/examples/webgl_animation_skinning_morph.html) · [exact source](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_morph.html). Status: live page and source read; MIT code, separately credited CC0 character by Tomás Laulhé with modifications by Don McCurdy.

**Exact technique:** an `AnimationMixer` drives named body actions while a named face mesh exposes `morphTargetDictionary` and `morphTargetInfluences`. The example controls expression weights separately from the body state, and returns from one-shot actions using a mixer completion event.

**Adapt:** author our own neutral face, blink, and pleased expression. Keep face controls separate from body idle/tilt/squash. A small character may need only a few deformation bones or morphs; a human rig is unnecessary.

**Bounded experiment, proposed:** export one original clay character with two eyes, one idle clip, one tap clip, and two facial controls. In a neutral viewer, blink while the body idles, tap during a blink, then return to idle. Save a short recording at all three review sizes.

**Pass / limit:** eyes remain attached and recognizable; body and face do not overwrite each other. Morph targets use stable topology and add vertex data. The reference robot's appearance and motion personality are not our design.

## Recipe 2 — blend actions without resetting the whole character

**Example:** [Three.js skeletal blending live demo](https://threejs.org/examples/webgl_animation_skinning_blending.html) · [exact source](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_blending.html). Status: live page and source read; MIT code. Its Soldier asset is credited to Mixamo; redistribution rights were not established in this study.

**Exact technique:** actions remain available through one mixer. Effective weights, time scales, and crossfades control transitions. The example restores action enablement/time scale before reuse; it sometimes waits for a locomotion loop boundary and can warp timing during a crossfade.

**Adapt:** use original Idle, Attentive, Thinking, and Speaking body poses. Conversational state changes should react immediately, rather than wait for a walking cycle. Keep eyes under independent control and compare fades with timing warp disabled first.

**Bounded experiment, proposed:** switch Idle → Attentive → Speaking → Idle every 250 ms, then trigger Tap halfway through a blend. Compare 150 ms and 300 ms transition durations. Capture the character and action-weight debug view.

**Pass / limit:** no neutral-pose flash, stale return action, or weight buildup. A simple two-action demonstration is not an interruption controller: define which states replace each other, which one-shots can interrupt, and how an old completion callback is cancelled or ignored.

## Recipe 3 — a reusable R3F rig with independent instances

**Examples:** [Drei useAnimations live story](https://drei.pmnd.rs/?path=/story/abstractions-useanimations--use-animations-st) · [story source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/.storybook/stories/useAnimations.stories.tsx) · [useGLTF source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/Gltf.tsx) · [useAnimations source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/useAnimations.tsx) · [Clone source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/Clone.tsx). Status: source read; hosted story ID verified in the published Storybook index. MIT code; story models/matcaps are separate assets.

**Exact technique:** `useGLTF` wraps the cached loader. `useAnimations` creates a mixer and binds actions to a supplied root; it updates through `useFrame`. Drei's Clone detects skinned meshes and uses skeleton-aware cloning. Plain Three offers the same underlying [SkeletonUtils.clone](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/jsm/utils/SkeletonUtils.js).

**Adapt:** treat the loaded asset as a template. Each independently animated avatar gets its own rig/root and mixer. Bind the actions to that instance, not the cached template. Share immutable geometry; copy materials only where an instance must mutate them.

**Bounded experiment, proposed:** place two instances of our same original GLB in one comparison canvas. Make the first blink and tap while the second remains idle. Unmount and remount only the first.

**Pass / limit:** no coupled skeleton, morph, or material mutation; the second survives unmount. Assign ownership before disposing shared cached resources. Hooks reduce boilerplate, but do not solve state arbitration or resource ownership. Verify React/Three/Fiber/Drei compatibility before an isolated adapter trial.

## Recipe 4 — reproduce glass with a controlled material comparison

**Examples:** [native Three transmission live demo](https://threejs.org/examples/webgl_materials_physical_transmission.html) · [native example source](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_materials_physical_transmission.html) · [Drei transmission live story](https://drei.pmnd.rs/?path=/story/shaders-meshtransmissionmaterial--mesh-transmission-material-st) · [custom material source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/MeshTransmissionMaterial.tsx). Status: source read; native page opened and Drei story ID verified. Both repositories use MIT for code. Their external environment images/models are not part of our asset plan.

**Exact technique:** native `MeshPhysicalMaterial` exposes transmission, IOR, thickness, roughness, and environment response. Drei's custom material samples a scene buffer with optional blur, chromatic separation, distortion, and backside rendering. It adds rendering work; a shared transmission sampler has transparency visibility limits.

**Adapt:** start with native physical glass and an authored steel material under original broad reflection cards. Keep eye materials opaque. Geometry, camera, lights, display mapping, exposure, and output color space must be recorded before comparing materials.

**Bounded experiment, proposed:** make three versions of one candidate asset: opaque glossy, native transmission, and custom transmission. Use the same camera/environment. Compare 40–44 px, roughly 96 px, and 160 px against light/dark backdrops. For the custom test, start with backside off and low buffer resolution/sample counts; raise only one setting at a time.

**Pass / limit:** retain the least costly version that gives clearly better depth without losing the face. Native transmission also costs more than ordinary opaque PBR. Refraction sees the rendered scene, not arbitrary Windows content behind Electron. Matching geometry does not guarantee identical Blender/browser pixels. Code comments credit N8Programs and upstream inspirations; preserve those if copying the custom implementation.

## Recipe 5 — stop rendering when the character comes to rest

**Examples:** [R3F performance guide with on-demand example](https://r3f.docs.pmnd.rs/advanced/scaling-performance) · [guide source](https://github.com/pmndrs/react-three-fiber/blob/9e53355ce499ea518ac3729de7fd4dcc06d8cdb9/docs/advanced/scaling-performance.mdx) · [render-loop source](https://github.com/pmndrs/react-three-fiber/blob/9e53355ce499ea518ac3729de7fd4dcc06d8cdb9/packages/fiber/src/core/loop.ts). The [native transmission demo](https://threejs.org/examples/webgl_materials_physical_transmission.html) also illustrates event-triggered rendering. Status: guide and loop read; MIT code. The guide's embedded `wvgxp` CodeSandbox was identified, but direct retrieval was blocked, so its playback was not verified.

**Exact technique:** `frameloop="demand"` renders requested frames and stops when no work remains. Imperative mutations need invalidation. A running animation must keep requesting frames until it settles. The guide notes that starting an animation before a scheduled first frame can cause a visible jump.

**Adapt:** keep an almost still idle pose. Wake for pointer gaze, blink, a state transition, or tap; continue only while that motion is active. Apply the same scheduling idea to the existing plain renderer. Retain its visibility pause, frame caps, reduced-motion mode, and image fallback.

**Bounded experiment, proposed:** count actual renders across ten seconds still, one tap, ten seconds still, then a hidden/resumed view. Compare the existing capped loop with a settle-and-stop prototype.

**Pass / limit:** still periods stop rendering; first and resumed frames do not jump. Scheduled blinks can wake a still scene, but timers must pause when hidden. Continuous idle wobble or shader time defeats true stillness. R3F's demand mode is not automatically a 15/30 fps cap.

## Recipe 6 — prove the exported asset before polishing the integration

**Example:** [Khronos glTF Validator live tool](https://github.khronos.org/glTF-Validator/) · [validator source/API](https://github.com/KhronosGroup/glTF-Validator/blob/602c54043ba66856b2e68c40fdf2bced975cdb8a/node/index.js) · [Node usage](https://github.com/KhronosGroup/glTF-Validator/blob/602c54043ba66856b2e68c40fdf2bced975cdb8a/node/README.md). Status: live page, API, and usage read; Apache-2.0. The hosted tool says validation happens locally in the browser.

**Exact technique:** validate GLB bytes against glTF constraints and retain the report. A completed call can return a report containing errors; a resolved promise alone is not a pass. Separately inspect semantic names, clips, channels, skinning, and morph controls.

**Adapt:** use an asset contract shared by Blender and both render adapters. [Blender's exporter manual](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) documents shape keys, shape-key normals, animation export, and sampling. Verify the installed exporter before using those options.

**Bounded experiment, proposed:** export one original clay asset with Idle and Tap, Blink and Pleased, then validate it. Load it in the installed Three renderer; enumerate the expected controls, exercise every control, and render frame zero plus peak tap and peak blink. Save the GLB, report, control inventory, and screenshots together.

**Pass / limit:** no validation errors; warnings reviewed; all named controls and materials survive export. Validation proves format consistency, not beauty, material parity, reliable bounds, or a face that remains readable at small size. Keep the unoptimized source export; test any later optimized variant against the same inventory and poses.

## Recommended order and evidence

These are proposed work packages, not work already completed. They make a high-quality result reviewable before integration expands.

| Order                  | Bounded result                                                                             | Evidence needed to continue                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1. Silhouette proof    | One clay Sprout at matched actual review sizes                                             | Front/three-quarter comparison; recognizable eyes at 40–44 px and roughly 96 px                  |
| 2. Control proof       | Original candidate with the minimal body/face controls                                     | Valid GLB, named control inventory, Recipe 1 recording                                           |
| 3. Motion proof        | One transition controller plus Tap                                                         | Recipe 2 rapid-interruption recording; no neutral flash or delayed callback                      |
| 4. Material proof      | Neutral and Prism material comparison on the same Sprout under one recorded reflection rig | Recipe 4 contact sheet and measured render cost; no face loss                                    |
| 5. Delivery comparison | Plain Three baseline; optional R3F web adapter                                             | Same asset, poses, camera, and light settings; independent-instance and cleanup proof            |
| 6. Runtime fit         | Actual pill, proposed pet bounds, expanded view                                            | Native-size screenshots; Recipe 5 still/active/hidden counts; keyboard and reduced-motion checks |

An asset handoff should include the editable original source, GLB, transparent fallback PNG, camera and lighting settings, dimensions/bounds, clip and morph names, material notes, provenance, validation report, and pose screenshots. The controller should consume named controls rather than infer them from mesh or animation array order.

The polished effect comes from silhouette, facial clarity, deformation quality, timing, and broad controlled reflections. Use the reference examples to reproduce those mechanisms on original art. A framework migration, more bloom, or more complex shaders is useful only when the matched comparison proves an improvement.
