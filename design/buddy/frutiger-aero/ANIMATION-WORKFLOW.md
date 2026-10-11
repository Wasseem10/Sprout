# Sprout animation workflow — authored motion, portable proof

Research and proposal dated **2026-10-10**. This document creates a production plan; it does not create a Sprout scene, change the renderer, or report proposed tests as passed. The selected direction is an original compact **Sprout** creature in the **Prism** palette. [AVATAR-STUDY.md](./AVATAR-STUDY.md) supplies the silhouette intent. Earlier Ripple and Ribbon documents remain historical references.

The immediate deliverable is a small, convincing **Blender → GLB → existing Three** animation proof. The same GLB and controller contract can then move into a bounded React Three Fiber component. The current app uses React 19, Vite 8, Electron 44 and Three 0.186.1; it currently has no Next.js or R3F dependency. A Next/Vercel browser host is a later integration decision, covered by the main production runbook.

All rig counts, amplitudes, durations, performance thresholds and budgets below are **proposed starting values to tune against the actual character**. No Sprout performance or topology measurement exists yet.

## 1. One definitive character rig

Author one continuous, compact pear-shaped body with two short unequal rounded buds and two tiny base lobes. Keep the navy eyes large, the eye band blue/aqua, and the violet/coral color sweep along the side or lower interior. The buds should read as blunt jelly growths, roughly 12–18% of body height, rather than long ears. Maintain a near-front viewing direction; a full body revolution would hide the face.

Use **nine FK bones**, with no runtime IK or fluid simulation:

| Bone                      | Parent            | Ownership and purpose                                   |
| ------------------------- | ----------------- | ------------------------------------------------------- |
| `ROOT`                    | Armature root     | Authored overall pose; stable character reference       |
| `BODY`                    | `ROOT`            | Gentle body lean and breathing pose                     |
| `FACE_MOUNT`              | `BODY`            | Rigid mounting plane for eyes, lids and glints          |
| `BUD_L_BASE`, `BUD_L_TIP` | `BODY`, then base | Two-stage soft bend and delayed follow-through          |
| `BUD_R_BASE`, `BUD_R_TIP` | `BODY`, then base | Same mechanism with restrained asymmetry                |
| `FOOT_L`, `FOOT_R`        | `ROOT`            | Small base-lobe poses; later contact authoring controls |

Skin the body/buds/base lobes to this rig. Keep weights broad and smooth at bud roots; avoid a visible joint crease. The face patch is strongly attached to `BODY`, with morph displacement fading smoothly to zero there. Foot sole patches also receive little or no jelly displacement. The face mount follows the body pose, while the face itself stays readable during jelly deformation.

Create editable `EYE_L`, `EYE_R`, `LID_L`, `LID_R`, `GLINT_L`, `GLINT_R` objects. Place eyes and their lid/glint children on rigid mounts just outside the body surface. A small unkeyed `GAZE_L`/`GAZE_R` node moves each eye/glint pair locally; lids stay on the face mount. Use a blue lid cap with an authored closing motion, rather than deforming the whole face to blink. Check closed lids for shell penetration and a clean line at 40–44 px. A mouth is deferred until the eyes work at that size.

The exported character looks toward **glTF +Z**, with **+Y up**. In Blender, author the corresponding front toward −Y with Z up, then verify the exported axis convention. `SPROUT_ROOT` is the application's placement node. Its child `REACTION_ROOT` contains the complete armature and all character meshes, so a click squash moves body and face together. The body mesh remains a direct child of the armature when bone-driven shape-key sampling is used. Required attachment bones must survive export; do not blindly enable “deformation bones only.”

## 2. Fixed topology before jelly animation

Finish the silhouette and runtime tessellation before adding relative shape keys. Apply topology-changing modeling operations to the intended runtime basis first. Then create **Basis plus three broad keys**: `Jelly_Squash`, `Jelly_Sway_L`, `Jelly_Sway_R`. Use hand-shaped, volume-conscious changes with smooth masks around the face and soles. Bud follow-through belongs to the FK bones, so it does not require a second set of bud morphs.

The first proof limits combined jelly weights to a sum at or below 1. This is a convenient conservative envelope, not a mathematical requirement of morphing. Test all extreme and blended poses for self-intersection, body-volume loss and face drift. Never remesh or change vertex ordering after the keys exist. If a higher-resolution offline mesh is needed, produce a separate authoring/render copy with corresponding evaluated shapes; do not apply arbitrary modifiers to the runtime mesh at export and assume its morphs survived.

The measured **v001 Ribbon** export contains **8,266 exported vertices and 16,512 triangles**, across five meshes; it has one 6-second, three-track clip and 145 samples per track. Vertex/triangle totals were rechecked directly from the GLB accessors during this research; clip measurements are recorded in [glb-audit.json](../glb-audit.json). These are baseline measurements, not a Sprout budget. Start the compact Sprout proof around **6,500–10,000 total exported vertices / 13,000–20,000 triangles**, including face parts. Count exported vertices, including splits at normals/UVs, rather than Blender control vertices. Refine where the bud roots, cheeks, eye shells and silhouette need it; more polygons alone will not fix poorly shaped highlights.

Export vertex normals and **shape-key normal deltas**. Audit each morph's POSITION/NORMAL accessor count against its primitive's basis vertex count, accounting for sparse accessors. Preserve any tangents required by an actual normal map. Compare clay and glossy poses before adding elaborate transmission: stable specular flow is part of the modeling gate.

## 3. A small clip library with explicit channels

Author at **24 fps** and sample evaluated export motion at one frame per sample for the initial proof. Playback interpolates between those samples; a 24 fps authoring rate does not restrict rendering to 24 fps. For a 6-second loop, frames **1 through 145** provide 144 intervals, including the matching endpoint. After zero-time export the intended clip duration is exactly 6 seconds.

| Proposed clip   | Initial duration                        | Tracks and intended behavior                                                              |
| --------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Sprout_Idle`   | 6 s, repeat                             | Body/bud/foot bones plus the complete body jelly-weight vector; low-amplitude soft motion |
| `Sprout_Listen` | 6 s, repeat                             | Same base channels, compatible loop phase; attentive lean and restrained bud lift         |
| `Sprout_Click`  | 10 intervals at 24 fps = 0.4167 s, once | Only `REACTION_ROOT` TRS; quick 6–8% squash, one damped recovery, neutral endpoints       |
| `Sprout_Blink`  | 4 intervals at 24 fps = 0.1667 s, once  | Only left/right lid transforms; fully open at both endpoints                              |

Prove these four first. Then add `Sprout_Think` and `Sprout_Speak` using the same base channels and 6-second phase convention. Speaking initially means a state-driven pose with a modest body pulse; audio-driven amplitude requires a real authorized audio signal and a separate measured envelope. Do not imply that a generic repeating pulse is lip-sync. A completion reaction must follow actual completion, rather than a visual timer.

Make both endpoint poses and seam velocities agree for repeating clips. Matching just the first and final matrices can still leave a visible jerk. Give bud tips a small delay relative to the body, with motion returning smoothly across the seam. Keep eyes in view at every loop sample and every allowed transition. A proposed starting range is body lean within ±3°, buds within ±8°, and jelly displacement around 2–4% of body width.

### Property ownership contract

| Property group                              | Sole owner                                 | Rule                                                      |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| Base bones and body `morphTargetInfluences` | One base-animation mixer/compositor        | Idle/listen/think/speak blend intentionally in this group |
| `REACTION_ROOT` TRS                         | Click reaction action on the same mixer    | Base clips must omit these tracks                         |
| Lid TRS                                     | Blink action on the same mixer             | Base and click clips must omit lid tracks                 |
| Unkeyed gaze nodes                          | Frame-time gaze controller                 | No GLB clip targets these nodes                           |
| App placement / panel position              | UI layout controller outside the character | Does not rewrite authored bones                           |
| Visibility, reduced motion, status text     | Presentation adapter                       | Backend/voice state remains authoritative                 |

**Different body morph names do not create independent animation channels.** Installed Three 0.186.1 `GLTFLoader` builds a weight track for the mesh's entire `morphTargetInfluences` array ([local source](../../../node_modules/three/examples/jsm/loaders/GLTFLoader.js), lines 4586–4664). Two exported clips can therefore carry zeros for each other's targets. Keep one authoritative writer for the body weight vector. Blink uses separate lid nodes, and click uses a separate transform node, so neither fights body jelly weights. Do not write runtime body weights after `mixer.update()` while also playing clips that own that vector.

## 4. Blender packaging and GLB export

Use a separate `INSIGHTOS_Sprout_v002` scene and semantic objects. Preserve the existing default scene and the v001 Ribbon asset. Keep source rig, shape keys, actions and editable face parts together; exported runtime meshes are a derived deliverable.

Create one clearly named NLA track per logical clip on each participating owner: armature, body shape-key datablock, reaction root or lid objects. Use the **same logical track name** for parts intended to form one glTF clip, and distinct names for independent blink/click clips. Use one strip per track for this proof, matching time ranges, no unintended strip offsets, and no overlapping unrelated tracks. In current Blender's **NLA Tracks** export mode, matching custom track names merge participating objects into one animation. The **Actions** mode default changed with Blender 4.4 slotted actions; do not rely on an older tutorial's naming behavior. See the [official glTF exporter manual](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html).

Concrete settings to verify against the installed Blender 5.2 exporter:

- Selected scene/collection only; no default-scene objects, lights or unrelated cameras in the runtime asset.
- Animation mode `NLA_TRACKS`; force sampling; frame step 1; slide exported starts to zero; armature rest pose preserved.
- Shape keys enabled; shape-key animation enabled; normals and shape-key normals enabled.
- **Apply Modifiers false.** The installed official exporter explicitly warns this setting prevents exporting shape keys.
- Keep ordinary pose-bone TRS, object TRS and morph weights as the portable motion contract. Authoring constraints, drivers, IK or procedural motion must be baked into those channels. Experimental material animation is outside this proof.
- Export all required face/bud attachment joints and preserve named gaze nodes. Inspect the actual exported hierarchy instead of trusting checkbox intent.

Verified installed exporter definitions: [`__init__.py`](<D:/Program Files/Blender Foundation/Blender 5.2/5.2/scripts/addons_core/io_scene_gltf2/__init__.py>) lines 679–683 (`export_apply` warning), 734–746 (animation modes), 846 (`export_anim_slide_to_zero`), 865–873 (merge mode default `ACTION`), 945–958 (morph normals/animation), and 1248–1249 (NLA sampling). [`tracks.py`](<D:/Program Files/Blender Foundation/Blender 5.2/5.2/scripts/addons_core/io_scene_gltf2/blender/exp/animation/tracks.py>) lines 667–672 shows custom-name merging while excluding generic `NlaTrack` and `[Action Stash]` names. These local line numbers describe the inspected installation, not a universal Blender version.

Inspect the GLB's animation channel manifest after every export. NLA sampling can create channels beyond the intended ones; a clip containing unwanted lid/gaze/reaction channels fails the ownership gate. Correct its authoring/export setup. If a deterministic packaging filter becomes necessary, make it an explicit, reviewed build step with a manifest diff; do not hide channel removal in the application.

## 5. Smooth playback and interruption

Load the original GLB through `GLTFLoader`, create one mixer for the character instance, and advance it **once per rendered frame** with elapsed seconds. Gaze updates run afterwards on their unkeyed nodes. React state carries discrete phase events; the per-frame pose stays outside React rerenders. This contract is shared by direct Three and a later R3F `useFrame` wrapper.

For an isolated two-state demonstration, use `crossFadeTo(next, duration, false)` with a proposed 0.18–0.24 s fade. Keep equal-duration base loops at a shared normalized phase. `warp=false` avoids altering blink/body timing just to blend states. The official [AnimationAction documentation](https://threejs.org/docs/pages/AnimationAction.html) confirms that `clampWhenFinished` applies to natural completion, not an interrupted action; it does not solve cancellation.

For production voice-state interruptions, use **one explicit weight-transition controller** for the base group, rather than stacking new fade schedules. On each new phase event, capture current effective weights, cancel existing fades/warps, and blend that weight vector toward the new one-hot target. Keep contributing action times running; initialize a newly enabled base action to the shared loop phase. Normalize nonnegative weights and retire a source only after its contribution reaches zero. A new event starts from the currently visible mixture, even halfway through the previous transition. Do not reset an action that still contributes to the pose. This avoids a reset pop when listening → thinking → speaking arrives quickly.

Click and blink use separate channels and can overlap a base transition. Replay a click by an explicit reaction policy, not by resetting every action. Finished-event handlers must check the exact action and a current generation/token; remove replaced handlers. A stale click completion cannot restore an old listening state after speech has started. Endpoints return to neutral so stopping a reaction does not snap the character. A first proof can serialize clicks until their short reaction ends; rapid-retrigger behavior needs its own later visual test.

Use elapsed-time damping for gaze and other unkeyed controls:

```js
// Original planning example; dt is seconds. Not installed application code.
const alpha = 1 - Math.exp(-lambda * dt);
current += (target - current) * alpha;
```

This is first-order exponential damping, not a simulated elastic spring. It matches the mechanism in Three's [MathUtils.damp](https://threejs.org/docs/pages/MathUtils.html) and inspected local `MathUtils.js` lines 134–136. Proposed λ=12 for gaze reaches 90% of a step in about 0.192 s; λ=18 for an attention control takes about 0.128 s. Use a single easing stage for each control; authored clip motion already has its own timing. Bound gaze travel to the eye sockets and return toward center when the pointer leaves.

Render visible interaction and panel transitions at a **60 fps target**, subject to measured device results. Existing 15/30 fps caps are a baseline, not the smoothness target. Quiet idle may settle into demand rendering/static rest. Any new phase, gaze input, click or blink must resume the frame loop immediately and keep it active until movement settles. Suspending motion while hidden should also suspend its animation clock; reset the first resumed delta rather than feeding a large background interval into the mixer. Reduced motion freezes secondary animation at a chosen readable pose while HTML status and controls continue working. Do not silently reduce frame rate during an active reaction to meet an idle power target.

## 6. Three working primary examples to study

The examples below are executable references, not Sprout artwork. Source links are pinned to Three commit **11738a9d55e502fb484cefffcea3a66dc44e9fe9**, inspected during this research, so the cited lines stay stable. Verify any adopted APIs against installed Three 0.186.1.

| Official working example                                                                               | Exact mechanism/source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | How Sprout uses the lesson                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Skinning + morphs demo](https://threejs.org/examples/webgl_animation_skinning_morph.html)             | [Lines 150–155](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_morph.html#L150-L155) set one-shot emotes. [181–197](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_morph.html#L181-L197) restore a base state on completion; [227–245](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_morph.html#L227-L245) reset, fade and play actions. | Separate repeatable states from short reactions. Add exact-action/token guards before using its completion pattern under interruptions.                                                                             |
| [Skinning blending demo](https://threejs.org/examples/webgl_animation_skinning_blending.html)          | [Lines 377–407](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_blending.html#L377-L407) wait for the correct action's loop and crossfade; [412–418](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_blending.html#L412-L418) initialize effective weights.                                                                                                                                                     | Contact-dependent motion can transition at a compatible phase. Attention changes should respond immediately rather than wait for an entire idle cycle. Sprout's equal-duration loops initially use no time warping. |
| [Additive blending demo](https://threejs.org/examples/webgl_animation_skinning_additive_blending.html) | [Lines 135–147](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_additive_blending.html#L135-L147) convert clips to additive and extract a reference pose; [344–387](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_additive_blending.html#L344-L387) blend and weight actions.                                                                                                                                 | This is a later option for an authored lean overlay, after the simpler four-clip proof. Clone clips before mutation and use the actual 24 fps reference pose, not the demo's literal 30 fps extraction.             |

Three's [MIT license](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/LICENSE) covers its source; preserve the required copyright/license notice if copying substantial example code. The morph demo credits RobotExpressive as CC0, while the Soldier examples use a Mixamo asset; the library license does not automatically license those assets. This workflow copies **no example character, geometry or animation**. Sprout's design, rig and clips remain original. The source mechanisms are references for an original controller.

## 7. A bounded animation proof with failure gates

Produce a clay proof before Prism lookdev. Deliver:

1. An editable separate Sprout scene and source rig, under the existing save/checkpoint policy.
2. `sprout-proof-v002.glb`, plus an exported manifest listing mesh counts, bone names, morph names, each clip's channels/duration and hash.
3. A deterministic replay in the current direct Three renderer, at real **40–44 px** and proposed **96 px** character sizes, followed by a native Electron capture.
4. Matching Blender and browser camera/pose captures at loop opening, midpoint and seam. Compare silhouette, pose and normal flow; do not claim pixel-identical lighting or transmission.
5. An audit report with measured results and named failures. Proposed gates remain proposals until this report exists.

Run this short repeatable sequence with fixed events and saved timestamps. The replay splits update intervals at exact event boundaries, so a 30 fps step does not deliver a 12.15 s event later than a 120 fps step. Capture shared timestamps from the evaluated pose, independently of the display raster:

| Time                    | Proof event                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| 0–12 s                  | Two complete idle cycles; inspect frame 0/6/12 and nearby samples for seam position and velocity |
| 12.00 s                 | Click reaction starts over idle                                                                  |
| 12.15 s                 | Listening arrives during click; base blends while click completes independently                  |
| 12.50 s                 | Blink and a bounded gaze step while listening remains active                                     |
| 13.00 / 13.15 / 13.30 s | Alternate idle/listening/idle while a previous blend is unfinished                               |
| 14.00 s                 | Enable reduced motion halfway through a visible response; status still updates                   |
| 15.00 s                 | Resize between the real small and large views, then resume motion without a clock jump           |

After Think/Speak are authored, replace the rapid idle/listen events with actual listen → think → speak signals and repeat. The studio replay labels synthetic events as test inputs; it is not evidence of a working voice backend.

Reject the proof when any of these gates fails:

- **Export:** missing named clips/joints/morphs/normals, non-finite data, wrong duration, changed topology, unexpected overlapping property ownership, or a clip whose channel manifest differs from its contract.
- **Loop:** first/final pose mismatch beyond an initial 1e-5 m position / 1e-4 rad rotation tolerance, or a visible velocity kink. Compare poses immediately on both sides of the seam; exact endpoint equality alone is insufficient. Tune the numeric tolerance to the asset's scale and float precision.
- **Face:** eyes/lids/glints penetrate, disappear behind jelly or buds, drift off the face patch, or become unreadable at actual 40–44 px. A proposed tiny-view eye width of at least 3 physical pixels is a check, not a guaranteed aesthetic optimum.
- **Interruption:** resetting a contributing action causes a pop; stale completion changes the current phase; click suppresses blink; or repeated transitions lose weight/phase consistency. Record pose samples at each event and each fade boundary.
- **Time independence:** the same deterministic events replayed at 30, 60 and 120 update steps/second disagree at shared timestamps beyond an initial 0.2 px projected-pose tolerance, excluding raster differences. Confirm the first visible response starts within two presented frames after a valid event.
- **Bounds:** valid morph/skin combinations are culled or clipped. Audit the animated envelope, including combined key extremes; static basis bounds are insufficient. Validate render bounds in the actual camera rather than assuming the loader covers every combination.
- **Smoothness:** measure the proof device during active motion and panel transitions. Initial target is p95 presented-frame interval at or below 20 ms, with no app-caused gap above 50 ms. Record GPU/model/viewport and main-thread/GPU costs before calling 60 fps achieved; tune geometry/material/render scale when it fails.
- **Access:** reduced-motion motion remains visible, keyboard controls fail, canvas blocks meaningful HTML controls, or WebGL failure has no readable static fallback. Avatar click is exposed through an HTML button with a label/focus state; status is semantic HTML rather than encoded solely in movement.

Dispose finished instances by removing event listeners, stopping actions and uncaching the mixer root; dispose only resources the instance owns. Replay mount/unmount and resize to detect duplicated mixers or runaway frame loops.

## 8. Contact is a later dependency

The first Sprout proof floats; the base lobes are character anatomy, and this pass makes no physical floor or support claim. Once a planted pose is introduced, define sole patches, contact windows and the support transform in the authoring scene. Keep foot controls under `ROOT`, mask sole jelly displacement, and solve/bake contact in Blender before export. Blend only contact-compatible poses or author an explicit lift/settle transition. Scaling the entire character during a planted click would move the soles, so that reaction then needs a contact-aware body deformation.

Measure sole-to-support gap and lateral slip throughout those future contact windows, including crossfades. Blender IK/constraints can aid authoring, but the exported motion must reproduce them as baked channels. Accessory styling is deliberately outside this animation proof.

## Completion criterion

The first milestone is complete when the **original exported Sprout** passes the four-clip replay in the current browser and Electron renderer, keeps a clear face at both actual sizes, and has a measured smooth-motion report. Only then expand its expression library, finalize Prism materials, and wrap the proven asset/controller in R3F for the existing app and any optional Next/Vercel browser host.
