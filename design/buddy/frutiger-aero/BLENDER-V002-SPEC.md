# Ripple v002 — Blender authoring specification

Planning and curated authoring prompts only. No scene mutation, runtime change, export replacement, or final `.blend` save was performed in this pass. Preserve v001 as the comparison baseline.

## Intended result

An original, friendly **electric ocean-blue jelly buddy with eyes**, held by a refined steel ribbon cradle. Keep the glassy optimism of Frutiger Aero: rounded forms, water-blue color, clear white highlights, a small number of bubbles, and tactile chrome. The blue body and face are the first read; the steel is a beautifully finished supporting object.

Use a rounded droplet or sphere with a softly flattened base. Give it two high-contrast navy oval eyes with small white glints. Its body deforms like slow elastic jelly. The steel remains rigid, with a gentle cradle rock. Keep the face visible throughout every ambient and interaction pose. The previous full 360° outer-ribbon spin is unsuitable for this character because it can hide the eyes.

## Verified v001 baseline

Read from the current authored source and the actual `public/buddy/insight-core-v1.glb`, not estimated from screenshots:

| Exported surface                  |  Vertices |  Triangles |
| --------------------------------- | --------: | ---------: |
| Pearl core, evaluated subdivision |     4,514 |      9,024 |
| Titanium ribbon                   |     2,576 |      5,148 |
| Cyan inner flow                   |       392 |        780 |
| Ivory inner flow                  |       392 |        780 |
| Sage inner flow                   |       392 |        780 |
| **Total**                         | **8,266** | **16,512** |

Current GLB: **302,104 bytes**, nine model/rig nodes, five mesh surfaces, one six-second clip with three channels and 145 inclusive samples. All five surfaces have exported normals. The v001 source core has 1,106 vertices before its one subdivision level; the ring sweep uses 160 longitudinal stations × 16 cross-section samples plus capped ends. Its minimum measured surface clearance beyond maximum core breathing is 0.04555 m. These are baseline measurements, not v002 performance claims.

The existing construction stages are `../01_blockout.py`, `02_ribbon_geometry.py`, `03_materials.py`, `04_lighting.py`, `05_animation.py`, `06_audit.py`, `07_export.py`, `08_render_proofs.py`, and `09_final_visual_audit.py`. The current browser renderer adds PMREM reflection cards and separate lights; it is already a different lighting implementation from Cycles.

## Editable construction and silhouette

Future authoring should create a separate `INSIGHTOS_Buddy_v002` scene and semantic collections. Keep the original `Scene` and the whole v001 scene untouched. Use recovery copies with `save_as_mainfile(copy=True)` under the established Blender skill gates; preserve the active filepath. Inspect solid front, side, and three-quarter views before materials. Retain source curves, cross-section controls, rig objects and independent eyes; export mesh copies from the v002 model collection only.

Suggested hierarchy:

```text
RIG_ripple_root
  RIG_body_response
    HERO_ocean_jelly
    FACE_mount
      EYE_left / EYE_right
      GLINT_left / GLINT_right
      LID_left / LID_right
      MOUTH_optional
    BUBBLE_01 … BUBBLE_03
  RIG_steel_cradle
    HERO_steel_ribbon
```

Start with a body approximately 1.05–1.15 m across and a 1.65–1.85 m overall cradle. These are proposed dimensions. Keep the blue body at least 60% of the projected subject width, and reserve the central upper face band for the eyes. Preserve at least 0.03 m actual mesh-surface clearance in every combined deformation pose. Measure the final values after modeling.

The steel should have broad gently curved faces, a real 0.018–0.025 m thickness, smoothly rounded edges, and softened or rolled ends. Replace the uniformly elliptical v001 cross-section with a rounded rectangular profile: allocate samples to the curved corners and keep broad faces calm. Start with a 0.003–0.005 m edge radius, then judge the highlight width at the target camera. Avoid pointed caps, a balloon-like cross-section, and abrupt changes in width.

Author the cradle as an editable curve/sweep with controlled tilt or parallel-transported sweep frames, then create a mesh copy. A curve's preview resolution alone is not the export-quality metric. Count the evaluated/exported mesh and inspect the resulting outline. Blender exposes separate curve resolution controls; inspect the live 5.2 RNA before implementation. [Blender Curve API](https://docs.blender.org/api/current/bpy.types.Curve.html).

Read-only native RNA lookup confirmed in the connected Blender: `resolution_u` is the computed point count between control-point pairs; `render_resolution_u=0` uses preview resolution; `bevel_resolution` is segments per quarter-circle. The inspected defaults are 12, 0 and 4 respectively. These controls therefore are not interchangeable with the explicit 160-station v001 mesh sweep. No Blender scene state was changed for this lookup.

Use regular quads along the sweep. Keep continuous smooth normals across curved surfaces, intentional normal separation at capped ends, and smoothly blended bevels. Weighted normals are an optional correction for broad faces, not a replacement for a smooth silhouette or good topology. Judge normal changes with a moving large reflection band. A shader-only bevel does not change geometry and cannot supply the same exported edge silhouette. [Blender Bevel node](https://docs.blender.org/manual/en/latest/render/shader_nodes/input/bevel.html), [Weighted Normal modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/normals/weighted_normal.html).

## Tessellation and proposed budgets

All numbers below are **proposed ceilings or starting points**, not measured v002 costs. Start lower, increase only where a viewed outline or reflection breaks, and report exported counts after each candidate. UV seams and sharp normal splits can increase the exported vertex count. [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html).

| Version                     | Steel starting sweep                             | Proposed whole-model ceiling                                           | Use                                         |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------- |
| Runtime compact LOD         | 128–160 stations × 12–16 rounded-profile samples | 6,500 exported vertices / 13,000 triangles                             | Native 32–48 px avatar; low-power devices   |
| Runtime studio LOD          | 256–320 stations × 20–24 profile samples         | 22,000 vertices / 45,000 triangles                                     | Large buddy studio / normal desktop GPU     |
| Offline authoring high mesh | 384–512 stations × 24–32 profile samples         | 60,000 vertices / 120,000 triangles before optional offline refinement | Close hero stills and reflection inspection |

For the core, begin with roughly 1,000–1,600 evenly distributed runtime compact vertices and 3,000–5,000 studio vertices. Spend face detail on the eye outline and lid edges, not hidden back surfaces. Use at most three subordinate bubbles for the first study; in compact LOD omit bubbles that become subpixel noise.

Adapt longitudinal spacing to curvature, width change and rolled ends. Proposed acceptance: compact outline deviation below 0.5 px at its actual display size; studio LOD below 0.5 px in an 800 px comparison. Add stations near a visible curvature kink, not uniformly over the entire model. Inspect specular bands too: positional silhouette agreement can still hide poor normals.

Create all LODs from the same authored dimensions and sweep/body formulas. For the canonical Blender/browser comparison, render the **exact exported runtime mesh** in Cycles. An additional high-resolution beauty render may be smoother, but must be labeled as the offline high mesh. Do not claim that different LOD geometry is literally identical.

Proposed delivery targets: compact GLB ≤500 KB; studio GLB ≤1.5 MB before measured compression; ≤10 primary material draw groups. Proposed performance acceptance: smooth interaction near 60 fps on the target desktop and ≥30 fps on the fallback device at a bounded DPR. Profile actual frame time, transmission overdraw, GPU memory and loading before claiming those targets. More polygons cannot fix a black reflection environment or an unreadable face.

## Face mounting, gaze and expression

In glTF coordinates the character front is **+Z**, up is **+Y**. In Blender this corresponds to front **−Y**, up **+Z**. Keep `FACE_mount` stable on the front of the jelly, approximately near glTF Z=+0.48 m. Starting eye centers: X=±0.14 m, Y=+0.07 m; proposed oval size 0.08–0.10 m wide × 0.12–0.15 m high. Tune to the actual 32 px view. These are initial placements, not final measured coordinates.

Mount each navy oval, glint and lid as its own editable object. Use slightly domed eye geometry with a small standoff, not a decal depending on alpha sorting. Navy remains visibly darker than every blue-body pose. White glints should be restrained and consistent in position. A tiny mouth is optional; remove it if it adds noise at native size.

Pin a softly tapered region of the front body around the eyes against the large ooze deformation. The face rig follows the body's root response, while local surface motion under the eyes stays small enough to avoid floating or intersections. Use a smooth spatial mask rather than a sharp rigid patch. The eyes can glance by a small local offset or gaze-rig rotation; they must not orbit with the steel or the internal fluid. No camera or eye-tracking input is needed.

The cradle's front crossing must remain below the mouth/cheek line. Starting motion limits: yaw ±8°, pitch ±3°, vertical float ≤0.02 m. Audit actual camera visibility of both eye silhouettes and glints at every sampled pose, not only frame zero. Check combinations such as maximum jelly bulge + cradle yaw + blink. If any metal crosses the eyes, revise the cradle geometry before adding animation polish.

## Goo motion and portable morphs

Use fixed-topology relative shape keys for the jelly. Finalize the runtime mesh first. Proposed targets: paired positive/negative broad flow fields on the sides and back, a small squash/rebound, and a cheerful rounded pose. Keep the main ooze field low frequency: two or three broad bulges, not noisy ripples. Proposed normal displacement amplitude 0.015–0.035 m outside the pinned face patch. The steel uses rigid transforms only.

A six-second ambient loop can blend opposing shape pairs with smooth sine/cosine weights so shape and velocity agree at the seam. The body should roll internally without rotating the face away. Use separate short interaction clips for a 300–450 ms click squash/rebound and a 120–180 ms blink. Avoid a per-frame changing-topology fluid simulation in the runtime asset. The shape-key workflow depends on a stable mesh topology. [Blender shape-key workflow](https://docs.blender.org/UATEST/manual/en/dev/animation/shape_keys/workflow.html).

**Critical pipeline change:** `../07_export.py` currently sets `export_apply=True`. The installed official Blender 5.2 glTF exporter warns that this prevents shape-key export. Verified locally in `D:/Program Files/Blender Foundation/Blender 5.2/5.2/scripts/addons_core/io_scene_gltf2/__init__.py`, lines 679–683. For v002, bake/convert the steel export copy and finalize the core mesh before creating morphs; then export ready mesh copies with **`export_apply=False`**, shape keys and shape-key normals enabled. Read the live exporter properties before writing the v002 script.

Export object transforms and shape-key weights with one zero-based ambient clip, sampled at 24 fps over 1–145 inclusive. Export named short reaction clips separately. Ordinary material/light animation and physics caches are not supplied by this glTF animation path; state-dependent emission and runtime lighting are explicit presentation parameters. [Blender glTF animation support](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html).

In Three.js, named morph targets and their weights are exposed on the loaded mesh; use an `AnimationMixer` for authored clips. Keep one owner for any animated morph property: either let its mixer track control it or explicitly blend an interaction channel, never have two writers overwrite it each frame. Morph buffer contents are created before rendering; change the weights during interaction rather than rebuilding geometry. [Three Mesh morph targets](https://threejs.org/docs/pages/Mesh.html), [BufferGeometry morph attributes](https://threejs.org/docs/pages/BufferGeometry.html), [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html).

## Material and lighting study: three controlled comparisons

Hold geometry, camera, pose, AgX/exposure, background and crop fixed. Run the following **three labeled material candidates with the same studio cards**. Select the candidate from side-by-side Cycles and browser views before independently refining its lighting. Values are proposed art-direction starts, not final optical measurements.

| Candidate                                | Ocean body                                                                                                               | Steel                                                | Purpose                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| A — glossy blue jelly, recommended first | Saturated electric blue, roughness 0.12–0.18, transmission 0.15–0.30, clearcoat 0.7–1.0                                  | Metallic 1, roughness 0.20–0.28, neutral cool silver | Strong color and eye contrast at tiny size; controlled watery shine        |
| B — water-glass bubble                   | Same blue direction, roughness 0.06–0.10, transmission 0.60–0.80, IOR near 1.33; explicitly tested thickness/attenuation | Same steel as A                                      | More transparent, potentially more expensive and more background dependent |
| C — luminous ocean gel                   | Same blue direction, roughness 0.16–0.24, transmission 0.05–0.15, subtle blue emission strength 0.03–0.10                | Same steel as A                                      | Softer playful glow while keeping white highlight shape and deep-blue body |

Choose color swatches in display sRGB, then convert explicitly to linear material values and record both. Do not pass a hex swatch directly as three linear floats. Keep eyes nearly navy-black and opaque. Suggested display palette: electric blue `#007DFF`, ocean blue `#005AC8`, aqua accent `#46D8FF`, eye navy `#04152D`, highlight white `#F3FCFF`. These are proposed colors.

Start with one broad upper-front key card, a weaker side fill, a narrow cool rim, and a dark gap reflected by the steel. Record card size, pose and relative intensity in a shared lighting manifest. Use a locally generated PMREM environment in the browser, not an external HDRI dependency. PMREM prefilters the environment according to roughness; it can be generated from a scene. [Three PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html).

For the selected candidate, view world-only, zero-world, key-only, fill-only, rim-only and full lighting proofs. Then adjust one card at a time. A broad white highlight must describe the blue body; silver must retain dark reflected bands so it does not become flat white. Do not fix illegible chrome by clipping exposure. Keep iridescence/dispersion off in the first pass; add them only if the basic material wins.

Physically based transmission costs more per pixel and benefits from an environment map. Keep opacity 1 when using transmission; test nonzero thickness deliberately for the volume candidate. Candidate A is a design recommendation for readability, not a documented guarantee of speed. [Three MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html). Loader support includes clearcoat, transmission, IOR, volume and anisotropy, but verify that Blender actually writes each desired extension. [Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).

## Interaction profile and product semantics

| State/event    | Body and face                                                                          | Steel                 |
| -------------- | -------------------------------------------------------------------------------------- | --------------------- |
| Idle           | Slow broad ooze, mild breathing, occasional calm blink                                 | Cradle rock ±3°       |
| Hover/focus    | Eyes attend forward, glint/blue highlight lifts slightly                               | Remains rigid         |
| Click/tap      | Small squash/rebound, quick delighted eye widen; open the existing conversation panel  | One gentle ±3° settle |
| Listening      | Open attentive eyes, subtle forward lean; modest restrained pulse                      | Stable cradle         |
| Thinking       | Brief upward glance, slower ooze and asymmetrical bulge                                | Rock up to ±8°        |
| Speaking       | Friendly eye expression and bounded jelly response, no word-level mouth sync claim     | Stable or ≤±3°        |
| Done           | Small rounded cheerful pose, one settle                                                | Returns to rest       |
| Reduced motion | Frozen calm readable pose; immediate state/color change; no continuous float or squash | Frozen                |

Use actual existing voice/task phases to drive presentation. A state-driven speaking pulse is not an audio-amplitude meter; add amplitude coupling only if a real, already-authorized audio signal is available. Keep simulated states clearly identified in the visual studio.

The interactive avatar is a real HTML button with a meaningful action label, visible keyboard focus, Enter/Space support and a suitable hit area. Treat the 3D canvas as decorative inside that control. Express status in accessible text outside the artwork; use the existing conversation controls for starting/stopping voice. Do not make eye movements the only state indicator. Clicking the buddy should preserve the current panel-opening behavior, not unexpectedly request microphone access.

## Review and acceptance gates for a future v002 build

1. Preserve original and v001 scenes; create v002; record a recovery copy and the scene passport before mutation.
2. Review neutral solid body/cradle/face at front, side, three-quarter and actual avatar size. Eye readability and continuous steel silhouette must pass before lookdev.
3. Finalize runtime topology; create the deformation masks and morphs; verify separate semantic eyes/lids/glints. Bake export-copy modifiers before shape keys. Keep the live source editable.
4. Compare the three controlled material candidates, select one, then isolate and refine its lights.
5. Verify fixed topology, positive normals/volumes, all morph extrema and blended poses, ribbon clearance, unobstructed face, camera bounds, no surface intersections and pose/velocity seam continuity.
6. Export versioned assets such as `insight-ripple-v2-compact.glb` and `insight-ripple-v2-studio.glb`. Independently inspect vertex/triangle counts, normals, morph target names/attributes, extensions, all clips, sample times and seam errors in the actual file.
7. Capture equal-pose runtime-mesh Cycles/browser comparisons at 800 px, 160 px, and native 32–48 px; test ivory, pale-blue and dark product backgrounds. Judge silhouette, face contrast, blue hue, specular bands and motion. Expect tone-mapping/refraction differences; do not claim pixel identity.
8. Profile real devices, verify loading/fallback/reduced motion/context loss, and compare the compact LOD against the PNG fallback. Keep PNG fallback eye readability equivalent to the interactive pose.

## Curated future authoring prompt: geometry and character

> Build an original Ripple v002 buddy in a new isolated Blender scene. Preserve all existing scenes and objects, keep the current active filepath unchanged, and make recovery copies under the established Blender skill gates. Use a rounded electric ocean-blue jelly droplet with a softly flattened base, two readable navy oval eyes, tiny white glints, separate editable lids, and an optional small mouth. Hold it in one sculptural steel ribbon cradle with broad calm faces, real thin thickness, rounded edges and softly rolled ends. Make the body and face the dominant read. Keep a permanent clear eye band: metal must not cross the eyes in any pose. Author body, eye, lid, glint, mouth and steel as semantic editable parts. First show neutral solid front/side/three-quarter and actual-size views; record measured bounds and a continue decision before materials. Increase tessellation only where outlines or reflection bands need it, using the proposed LOD budgets in this specification. Do not render extra decorative props, a floor, text, logos, particle swarms or physical fluid simulation.

## Curated future authoring prompt: look, motion and export

> Continue only after the Ripple geometry/face gate passes. Compare A glossy blue jelly, B water-glass bubble, and C luminous ocean gel with identical pose/camera/studio cards. Keep steel metallic, neutral silver, and reflective with controlled dark gaps; keep eyes opaque navy and glints small. Select the look from actual rendered comparisons, then isolate World/key/fill/rim contributions. Preserve a stable face while the sides/back ooze through fixed-topology morphs; use a six-second seamless ambient loop, a short click squash/rebound and a short blink. Rock the rigid steel cradle gently within ±8°; never spin it across the face. Finalize export-copy topology before creating morphs, export with modifiers already baked and export_apply=False, include morph positions/normals and named sampled clips, and inspect the actual GLB. Deliver compact and studio LODs, a transparent PNG fallback, staged source scripts, the passport and measured audits. Compare the exact runtime mesh in Blender and the browser with the same camera/pose, while documenting lighting/refraction differences. No final .blend save, runtime edits or commit is implied by this prompt.

Research uses official Blender/Three documentation and the installed Blender exporter. Some Blender pages were available through indexed official excerpts while direct fetches failed; implementation must still verify the connected Blender version, RNA and exporter flags. All geometric and material v002 choices above are proposals awaiting viewed modeling studies.
