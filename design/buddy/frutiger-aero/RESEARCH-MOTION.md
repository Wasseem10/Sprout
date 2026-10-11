# Ripple: motion and rendering research

Research date: **2026-10-10**. Status: **reference study and proposed implementation**, with source and license checks completed. This document adds no runtime code, dependencies, Blender objects, voice connections, or copied artwork.

The latest direction is a cute character with eyes: an original electric-ocean-blue jelly drop, held by a polished steel ribbon cradle. The current native collapsed window is a 360 × 86 px pill, with the buddy rendered around 40–44 px. A proposed freestanding pet around 96 px needs new window-bounds planning; 160 px is an expanded concept/preview comparison target. Its face must remain legible at the size where it actually appears. The expanded interface serves a general conversational assistant, using luminous glass around readable content. Finance may change; bills are stress-test content examples here. Frutiger Aero guides the watery materials, light, and optimism; it does not require a collage of retro assets.

The current application maps conversation **phases** to motion. It does **not** feed measured microphone or speaker amplitude into the buddy. Any proposed amplitude response below requires future integration with the existing voice owner. The studio must label simulated states honestly.

## Six useful primary references

Each adaptation is our recommendation, not a claim that the reference implements Ripple. Code licenses do not automatically cover externally loaded textures, models, or brand artwork.

### 1. Three.js MarchingCubes: genuinely merging blobs

- **Primary code:** [MarchingCubes implementation](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/jsm/objects/MarchingCubes.js) and [working example](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_marchingcubes.html).
- **License/status:** [MIT](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/LICENSE); implementation and example read on the research date. Preserve notices for copied code. Reference only.
- **Mechanism:** metaball contributions populate a scalar field; an isolation threshold extracts a smooth surface. Reset, add moving balls, then update the geometry. Position and normal buffers are dynamic.
- **Adaptation:** an optional experiment with two or three small lobes joining the main jelly body during click squash. Keep the face region stable and the steel cradle independent.
- **Limits:** polygonization scales with the cube of grid resolution. Test roughly 24–32 cells as starting points, not a performance promise. Changing topology makes attached eyes harder to stabilize. Start with authored deformation; adopt this only if real merging adds visible value at the proposed roughly 96 px pet size, with a simpler treatment for the current 40–44 px pill. Do not reuse example textures without separate checks.

### 2. Drei MeshDistortMaterial: low-frequency jelly wobble

- **Primary code:** [MeshDistortMaterial](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/MeshDistortMaterial.tsx) and [distortion shader](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/helpers/glsl/distort.vert.glsl).
- **License/status:** [MIT](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/LICENSE); source read. Reference only; no React Three Fiber or Drei installation proposed solely for this effect.
- **Mechanism:** extends a physical material and injects time, radius, and distortion uniforms into the vertex shader; simplex noise displaces an existing surface.
- **Adaptation:** gentle broad deformation on the blue body, with a protected frontal face zone. Increase the deformation briefly after a tap, then damp it back to an almost still idle silhouette. Keep the steel rigid.
- **Limits:** this changes the shape without creating merging topology. The sampled code does not reconstruct deformed surface normals; glossy reflections need a separate normal-quality test. Verify any imported noise dependency license if copying. Dense, fast noise will look nervous and shimmer at small size.

### 3. Drei MeshTransmissionMaterial: wet glass without a foggy face

- **Primary code:** [MeshTransmissionMaterial](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/MeshTransmissionMaterial.tsx); [maintainer documentation](https://drei.docs.pmnd.rs/shaders/mesh-transmission-material).
- **License/status:** same [Drei MIT license](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/LICENSE); code and documentation read. Material technique study only.
- **Mechanism:** refracts a scene buffer with thickness, roughness, attenuation, optional chromatic separation and temporal distortion. A local buffer adds a scene pass; a backside option adds further work. A shared transmission sampler has visibility limitations.
- **Adaptation:** test a clear outer jelly edge over a denser blue body, broad white reflections, and only slight spectral highlights. Keep the two eyes opaque and readable. Compare against native Three.js physical transmission before building a custom multi-pass material.
- **Limits:** extra passes and samples cost GPU time; overlapping transparency needs review. WebGL refraction can sample its rendered scene, not arbitrary Windows content behind a transparent Electron window. The expanded HTML panel's backdrop blur is a different technique. Rich glass never replaces a sufficient content backing.

### 4. OGL Flowmap: a pointer wake that relaxes

- **Primary code:** [Flowmap class](https://github.com/oframe/ogl/blob/385ce65c352c70734a36dc98c787fdd1d30ddb3b/src/extras/Flowmap.js) and [mouse flow example](https://github.com/oframe/ogl/blob/385ce65c352c70734a36dc98c787fdd1d30ddb3b/examples/mouse-flowmap.html).
- **License/status:** [Unlicense declaration](https://github.com/oframe/ogl/tree/385ce65c352c70734a36dc98c787fdd1d30ddb3b#unlicense), also declared in [package metadata](https://github.com/oframe/ogl/blob/385ce65c352c70734a36dc98c787fdd1d30ddb3b/package.json); source read. Reference only.
- **Mechanism:** stamps pointer velocity into alternating render targets. The stored flow dissipates and offsets sampled texture coordinates, leaving a short fluid wake.
- **Adaptation:** optional soft internal blue swirl following a local pointer movement. Use an original procedural color field. Separate the eyes from this distortion; gaze should follow through a small, damped offset instead.
- **Limits:** this is texture advection, not a 3D liquid simulation. It requires render targets and cleanup. The example's photograph has separate provenance and should not be copied. A small head tilt and gaze offset may convey the same interaction more clearly with less work. Pointer effects cannot replace keyboard activation.

### 5. Three.js character expressions and damping: a stable face

- **Primary code:** [skinning and morph example](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_morph.html) and [MathUtils.damp](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/src/math/MathUtils.js).
- **License/status:** [MIT code](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/LICENSE); source read and `damp` independently checked in the installed package. The example separately credits its robot as CC0; no robot asset is proposed.
- **Mechanism:** the mixer crossfades body clips while independent morph-target weights control facial expressions. `damp` interpolates with an exponential factor using delta time, avoiding frame-dependent fixed lerp factors.
- **Adaptation:** separate body motion, blink, gaze, and click-response controls. Damped gaze targets can change direction without restarting an animation. Author blink/squash shape keys if they improve the silhouette; keep body clip tracks away from runtime-controlled face weights.
- **Limits:** `damp` is a first-order approach, not an elastic spring; a deliberate authored curve or velocity-based spring is needed for bounce. Simultaneous clips and runtime writes to the same property conflict. Test interruptions, not only full uninterrupted loops.

### 6. ElevenLabs UI Orb: separating state from measured volume

- **Primary code:** [Orb component and shader](https://github.com/elevenlabs/ui/blob/23c31bd3088814215a8b5d0bfb56b327cad1a578/apps/www/registry/elevenlabs-ui/ui/orb.tsx); [component documentation](https://ui.elevenlabs.io/docs/components/orb).
- **License/status:** [MIT](https://github.com/elevenlabs/ui/blob/23c31bd3088814215a8b5d0bfb56b327cad1a578/LICENSE.md); code and documentation read. Interaction architecture reference; no branded orb or shader appearance copied.
- **Mechanism:** maintains distinct input and output controls. Manual mode accepts supplied volume values, refs, or callbacks. Its auto mode synthesizes motion from the state using periodic functions; that mode is not proof of measured audio reactivity.
- **Adaptation:** preserve a presentation adapter: phase plus optional normalized input/output levels. Listening may add a tiny inward lean from input level; speaking may add a soft body pulse from output level. Keep the face clear.
- **Limits:** use the already authorized voice connection's level data if available; do not start another microphone or session for animation. Smooth using elapsed time, clamp non-finite values, and return naturally to rest when data stops. HTML must still communicate listening, muted, interrupted, and error states.

## Recommended original implementation

The first production candidate should use **an authored blue jelly mesh with a small set of controlled deformations**, rather than continuous topology changes. This keeps identity, face placement, fallback imagery, and browser/offline silhouettes consistent. Dynamic metaballs remain a separate comparison study.

Give Ripple a compact round drop silhouette, a slightly uneven lower edge, and two navy oval eyes with small white glints. Let the ocean blue body provide the color; use a brighter, denser frontal region to keep the eyes visible over light and dark desktops. Place the steel ribbon low as a cradle or behind the body, with no orbit that crosses the eyes. The face and body stay oriented toward the viewer. Rotate neither through a full turn merely to demonstrate 3D.

Two realistic face routes should be compared in a small isolated prototype:

1. **Attached geometry:** create two shallow eye meshes and glints on a named face anchor. Damp the anchor's local tilt and the pupils' bounded offsets. Blink with an authored eye shape key or local vertical eye scale. Apply only broad body squash to this anchor; keep local noise weak around it. This is the simplest editable route for the current GLB renderer.
2. **A face surface shader:** use fixed UV coordinates on a stable frontal patch to draw original antialiased oval masks and glints. Drive `blink`, `gazeX`, and `gazeY` uniforms; transform the face patch with the same body deformation. This can avoid eye-mesh separation, but shader/material integration and UV stability require careful proof. A screen-space overlay alone can appear to float away from the body.

For authored shape keys, [Blender's glTF exporter documentation](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) describes morph-target, normal, and shape-key animation export. Verify the installed Blender exporter options, then inspect the actual GLB's named morph dictionary and rendered normals. An attractive Blender preview does not establish browser parity.

Proposed motion values below are starting art-direction targets, to be tuned after actual-size review:

| Trigger                   | Character response                                         | Practical boundary                                                                  |
| ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Idle                      | Almost still body; occasional brief blink; slight settling | No perpetual spin or restless scanning; keep eyes open most of the time             |
| Local pointer             | Small damped gaze and a gentle lean                        | Clamp the gaze inside the face; clear target on pointer exit                        |
| Tap / keyboard activation | Brief 6–8% body squash, then a single soft settle          | Preserve the existing open action; dragging must not trigger a tap response         |
| Listening                 | Attentive 3–5 degree tilt, open eyes, slight inward lean   | State-driven until genuine volume data is integrated                                |
| Thinking                  | Look slightly upward; slow body sway                       | A legible HTML status remains visible; no rapid dots across the face                |
| Speaking                  | Gentle 2–3% body pulse and warmer eye expression           | Initially phase-driven; measured speaker level is an optional later input           |
| Verified completion       | One small lift and pleased eye curve                       | Only use after an actual confirmed action, never infer task success from appearance |
| Reduced motion            | Stable open-eyed pose; immediate readable status updates   | Stop drift, wobble, gaze chase, and continuous pulses; retain the real action       |

Blink and gaze are decorative character behavior, not hidden status codes. The existing voice and application workflow remain the source of truth. A mute, retry, or interrupted state needs explicit text and ordinary controls, not only a change of eye shape or color.

## How to reproduce a polished result

1. **Isolate the mechanism studies.** Compare the same body and camera with plain PBR, authored squash, low-frequency deformation, and optional metaballs. Compare glass and steel under one controlled light rig. Capture the current 40–44 px pill, the proposed roughly 96 px freestanding pet, and 160 px expanded/preview comparisons, not only a large hero render.
2. **Create the character direction board.** Use image generation for original silhouette, eyes, materials, and the expanded glass panel. Treat generated details as proposed art direction. Record the exact prompt and reject examples whose face disappears, ribbon intersects the body, or interface becomes a generic grid of gradient cards.
3. **Author in Blender.** Preserve the existing scene and recovery copies. Make a new version with semantic body, eye, glint, cradle, and face-anchor names. Critique clay silhouette and face first; add materials only after these read clearly. Use broad reflection cards, soft cool fill, and a controlled rim rather than bloom to create shine.
4. **Transfer the actual asset.** Export the same authored geometry and supported morphs to GLB, plus an original transparent PNG fallback. Use the approved camera and matched reflection rig in direct Three.js. Do not add a second render framework merely to import one effect.
5. **Review behavior under interruption.** Test rapid listening → thinking → speaking → idle transitions, pointer exit, a tap while a pulse is running, expand/collapse, and reduced-motion changes. Retarget from current values instead of resetting to a default pose.
6. **Review on the intended surfaces.** Check the buddy on bright and dark desktops; stress-test the expanded interface with long conversation content, large text, keyboard focus, and narrow widths. Bill corrections are one useful example of dense content and consequential confirmations. Keep glass strongest in the frame and decorative header, with stable readable backing behind content and confirmation controls.

The visual signature should come from Ripple's original asymmetric drop, expressive eyes, carefully shaped steel reflection, and unusually readable typography. Avoid recycled sci-fi rings, particle halos, empty giant orbs, decorative ticker data, or a dashboard made entirely from repeated glowing cards.

## Performance and integration gates for the later build

These are proposed acceptance checks; no new performance test was run for this research document.

- Begin with the existing renderer's 15 fps idle / 30 fps active caps, bounded pixel ratio, visibility/offscreen pause, abortable asset load, context recovery, and authored image fallback. Measure the new character before raising those budgets.
- Keep the body and face control work in the existing animation loop. Avoid per-frame React updates and new allocations for gaze, blink, or deformation. Clamp resume deltas so returning from a hidden window does not create a bounce explosion.
- Capture metal/glass detail at native target resolution. Compare browser and Blender separately for silhouette, eye readability, reflection bands, and tone mapping. Claims of pixel identity require evidence.
- Use opaque eye materials and restrained transparency. Try native physical transmission first; add an extra refraction pass only when a side-by-side screenshot shows a useful improvement at the real size.
- Preserve the current presentation/voice boundary. A later level adapter should pass bounded numeric values into the visual renderer and should neither retain raw audio nor own microphone permissions, connection state, application actions, or message sending.
- Keep references and assets distinct. If source is later copied, record exact revisions, preserve its applicable notices, and separately audit noise files, example imagery, and any external asset. No third-party mascot is part of this plan.

Repository heads captured for provenance on the research date: Three.js `11738a9d55e502fb484cefffcea3a66dc44e9fe9`; Drei `bf6f4addf47467d3885de272d94ca5127f6ef68f`; OGL `385ce65c352c70734a36dc98c787fdd1d30ddb3b`; ElevenLabs UI `23c31bd3088814215a8b5d0bfb56b327cad1a578`. The installed Three.js runtime is a separate pinned dependency; upstream examples must be adapted to that installed version before implementation.
