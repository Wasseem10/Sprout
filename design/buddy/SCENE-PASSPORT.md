# InsightOS Ribbon v001 — Scene Passport

SCENE
- intent: Original, calm, premium assistant core; luminous sea-glass pearl held by one continuous asymmetrical titanium ribbon. Approved reference direction: middle column of `artifacts/buddy-concepts-v1.png`; interpret its material hierarchy and silhouette. Initial Aperture study is retained in recovery copies.
- deliverable: Separate editable live Blender scene, authored Python stages, transparent 640×640 PNG, animated GLB geometry reference, audit evidence. No final `.blend` save requested.
- units: metres; axes: right-handed Z-up
- render: Cycles for reflection/transmission proof; 640×640; 24 fps; frames 1–145, 144 unique loop frames.
- dynamic: yes; explicit static request: none

HIERARCHY
- collection/object naming: `INSIGHTOS_Buddy_v001`; `HERO_*`, `RIG_*`, `CAM_*`, `LGT_*`; role-specific light collections.
- parent/child relationships: `RIG_buddy_root` → core, `RIG_ribbon_pose` → `RIG_ribbon_spin` → outer ribbon; root → `RIG_inner_flow` → three distinct inner flow surfaces.
- protected existing objects: Original `Scene`, `Cube`, `Camera`, `Light`, existing World/materials. No deletions or changes to these. Active filepath remains empty.

ASSETS
- A01 `HERO_pearl_core` | route [BLOCK] | fidelity detailed | dimensions [1.2,1.2,1.2] m | location [0,0,0] | orientation [0,0,0] rad | centered origin | parent root | focal pearl glass.
- A02 `HERO_titanium_ribbon` | route [BLOCK] | fidelity detailed | explicit closed sweep: 1.22 turns, center radius 0.73–0.835 m, section width 0.26–0.39 m and thickness 0.022 m; total local bounds [1.934,1.943,2.054] m; verified surface clearance 0.04555 m at maximum core breath | location [0,0,0] | static pose [0,0,-0.20] rad | centered origin | parent ribbon spin | continuous asymmetrical sculptural ribbon.
- A03–05 `HERO_flow_sage`, `HERO_flow_cyan`, `HERO_flow_ivory` | route [BLOCK] | fidelity detailed | inside radius 0.49 m; tapered sweep widths 0.045–0.085 m | centered | parent inner flow | luminous directional flow, not a particle swarm.
- generation estimate/submission state for each [GEN]: none; local procedural authoring, no paid generation.
- construction mode: blockout / procedural refinement.

SHOT
- active camera: `CAM_buddy_hero`
- framing/lens/target: orthographic, scale 2.72 m, Blender location [0.35,-5.8,0.75], target [0,0,0]; front product view; sampled loop silhouette margin ≥9%. Runtime glTF camera [0.35,0.75,5.8], up [0,1,0], target origin, same 2.72 m vertical span.
- foreground, subject, background depth: isolated core and aperture, transparent film; no ground/platform asset. Intentional suspension as an abstract interface instrument.

LOOK
- material roles and palette (linear RGB): luminous pearl [0.90,0.96,0.91], titanium [0.32,0.35,0.34], sea-glass cyan [0.045,0.58,0.57], sage [0.15,0.53,0.38], ivory flow [0.71,0.80,0.63].
- material route [NONE / locally authored] / target object: named Principled materials with simple portable PBR values. Core transmission 0.94, roughness 0.07, IOR 1.25, clearcoat 0.25 / coat roughness 0.08, emission strength 0.055. Titanium metallic 1, roughness 0.255. GLB carries KHR_materials_transmission, KHR_materials_clearcoat and KHR_materials_ior.
- texture scale in metres / UV or Generated coordinates: no procedural shader, displacement, external texture, or UV dependency; actual meshes and normals are exported.
- relief polarity / bump-only or true displacement: none; shell polish and ring cross-section provide the detail.
- dielectric/metallic / roughness/specular intent: low-IOR transmissive pearl shell, metallic titanium ring, restrained emissive flow (strength ≤2).
- world/background: low-strength neutral studio World; transparent film in final PNG.

LIGHTING
- focal subject / secondary focal point / intended darkest region: pearl core, then ribbon edge; ribbon face between broad reflection bands stays dark.
- reference mood and time of day: sculptural studio product, no environmental time of day.
- environment route [NONE] / true HDR-EXR required: no HDRI.
- world-only and zero-world baseline: record both as separate local diagnostic renders.
- key direction / camera relation / softness: broad warm-white upper-left softbox; lateral to camera, aimed at core; long reflected band describes shell and ring.
- fill target and intended contrast: modest cool front-right fill restores shadow-side ribbon visibility, subordinate to key.
- practical or implied source motivation: studio softboxes; inner flow is a stylized source, not a physical fluid simulation.
- reflection strategy for glossy/product assets: distinct rectangular key/fill/rim shapes, controlled dark gaps, no visible cards in shot.
- gobos / flags / negative fill / atmosphere: no atmosphere or decorative gobo; neutral dark World supplies reflection gaps.
- color management and locked exposure: AgX, exposure 0; unchanged during lighting comparisons.

MOTION
- fps/frame range: 24 fps; 1–145 seam inclusive = six seconds; 1–144 unique frames.
- object/camera/light beats: outer ribbon continuous +360° about local Z; inner flow continuous -360° about local Z; core breathes ±0.8%; camera/lights stay fixed.
- rest poses and loops: frame 1 hero; frame 73 opposite angle; frame 145 equals frame 1. Rotation linear by intention for steady motion; breathing smooth Bezier with seam slopes flattened.

ACCEPTANCE
- structural: distinct editable semantic objects, intact original Scene, correct dimensions/parents, no unwanted duplicate parts, source meshes closed with outward normals, active filepath unchanged.
- motion: evaluated matrices move at departure/midpoint/settle; no teleport/flip; seam matrices match; swept ring clears sphere throughout; camera bounds hold across sampled frames.
- visual: sphere/ring/inner flow read at 640px and 160px; visible depth, controlled white reflection bands, dark titanium region, no clipped highlights/pink textures/solid-white glass.
- lighting: viewed World-only, zero-World, key-only and fill/rim isolation; grayscale focal hierarchy; no atmosphere to A/B; camera framing remains fixed.

refs_read: blender-scene; blender-scene-spec; blender-modeling; blender-lookdev; blender-lighting-camera; blender-animation; blender-audit-finalize; blender-volatile.

## Gate checklist

- [x] Read all seven applicable reference modules and core procedure.
- [x] A — inspect connected live Blender, original scene, concept reference; define passport.
- [x] B — recovery copy before mutation; active path unchanged.
- [x] C — bounds, primary masses, secondary masses, proportions, pivots, solid camera-read gates; updated Ribbon front and side orthographic views inspected.
- [x] D — refined explicit geometry, portable lookdev, controlled lighting, purposeful animation.
- [x] E — structural, motion, visual and product-lighting audits; restored frame 1 / hero camera; PNG and GLB exported.

## Completed evidence and runtime contract

`audit.json` records closed meshes, positive signed volumes, semantic parents, protected original Scene, evaluated camera bounds across frames 1/13/37/73/109/144/145, motion departure, and seam matrix error 1.75×10⁻⁷. Nearest mesh-surface radius was measured with a BVH, giving 0.04555 m clearance beyond maximum sphere breath.

Viewed render proofs: `renders/light-world_only.png`, `light-zero_world.png`, `light-key_only.png`, `light-fill_only.png`, `light-rim_only.png`; opening/departure/middle/end/loop frames `motion-001/013/073/144/145.png`; 160px readability and grayscale hierarchy proofs. The pearl remains the focal mass, the ribbon reads as one orbit, and dark gaps separate the broad reflections.

`visual-audit.json` verifies the 640×640 RGBA PNG: 77.5% transparent pixels, no fully clipped white pixels in the opaque subject, peak encoded channel 0.988. `glb-audit.json` independently verifies five exported mesh surfaces with normals, nine model nodes, one 0–6 second clip / three channels / 145 keys, zero exported clip seam error, and no cameras/lights/default objects. The maximum rotation step is 0.04364 rad per sampled frame.

The runtime GLB is 302104 bytes. The authored mesh silhouette is shared directly by Blender and React. Browser PMREM reflections and transparent transmission differ from Cycles; the runtime adds a front reflection card for legibility, so it matches geometry and camera rather than offline pixels. The PNG fallback provides the exact offline look. This is a procedural sculpture, not a physical fluid simulation.

The final recovery copy is `.local/blender-checkpoints/20261010-200805-656389_Ribbon-final-assets-audited.blend`; the active Blender filepath remains empty. No final `.blend` save or commit was performed.

## Connector fallback

Native Blender MCP 1.8 / protocol 13 on Blender 5.2.2 is responsive. Higgsfield reports connected but its scene calls time out; typed build/checkpoint/audit tools are absent. Use staged native `execute_blender_code`, bpy data API and local viewed render evidence under the same gates. Recovery copies use `save_as_mainfile(copy=True)`; no final save or active-path change.
