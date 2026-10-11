# Sprout v002 — live authoring passport

Owner: root agent only. Started 2026-10-10 from UI revision 39afc30. Native Blender MCP reports Blender 5.2.2 LTS. Higgsfield reports connected but its scene-summary call timed out; the native scene read and screenshot succeeded. No spending estimate tool is exposed, so the approved original local authoring route is used. Existing image-generation boards provide reference only.

## Build checklist

- [x] Read blender-scene, blender-scene-spec, blender-modeling, blender-lookdev, blender-lighting-camera, blender-animation, blender-audit-finalize and blender-volatile.
- [x] Read current project production, animation, interaction, reference and upstream contracts; inspect original Sprout and Prism boards.
- [x] Phase A: inspect live source and write passport.
- [x] Phase B: recovery copy and protected inventory; original three-object default scene and thirteen-object Ribbon scene retained.
- [x] Phase C: bounds → primary masses → secondary masses → proportions → attachments → viewed camera gate. Front/profile and continuous clay renders are in proofs/.
- [x] Phase D: continuous runtime topology, rig/morphs/clips, actual GLB replay, then Prism look.
- [x] Phase E: structural, motion, material/light and local application evidence. Live ElevenLabs provider/physical-device acceptance remains unavailable; see limits below.

## SCENE

- intent: original compact expressive Sprout companion; actual clay proof before Prism polish.
- deliverable: editable source copy, versioned GLB, fallback PNG, semantic manifest and viewed motion/app evidence.
- units: metres; axes: right-handed Z-up; character faces Blender -Y, exported glTF +Z with +Y up.
- render: Cycles, 640 × 640 transparent delivery; 24 fps; loop frames 1–145. Lower-resolution evidence renders are explicitly labelled.
- dynamic: yes; authored character acting with stable near-front camera.

## HIERARCHY

- collection/object naming: scene INSIGHTOS_Sprout_v002; collections SPROUT_MODEL, SPROUT_STUDIO, SPROUT_PROXIES; named semantic meshes and controls.
- parent/child relationships: SPROUT_ROOT → REACTION_ROOT → RIG_Sprout; SPROUT_BODY is a direct armature child. FACE_MOUNT bone carries face mounts; unkeyed GAZE_L/R carry EYE_L/R and GLINT_L/R; separate LID_L/R motion.
- protected existing objects: all objects/datablocks in Scene and INSIGHTOS_Buddy_v001. Original Cube/Camera/Light, all Ribbon meshes, rig, lights, materials and source scripts remain unchanged. Preflight active filepath is empty; copy saves preserve it.

## ASSETS

- A01 SPROUT_BODY | route [BLOCK] | fidelity detailed stylized hero | intended envelope [2.05,1.32,2.28] m | location [0,0,0] | orientation [0,0,0] | origin body centre | parent RIG_Sprout | one continuous pear, short unequal buds and stubby feet; editable source proxies retained separately.
- A02 EYE_L/R | route [BLOCK] | fidelity detailed stylized | each [0.31,0.10,0.43] m | near [±0.34,-0.61,0.00] | near-front orientation | local eye centre | parent GAZE_L/R | navy oval face with opaque white glints.
- A03 LID_L/R | route [BLOCK] | fidelity detailed stylized | fit each eye shell | local face attachment | authored open/closed transform | FACE_MOUNT | readable blink without deforming the face patch.
- A04 RIG_Sprout | route [BLOCK] | fidelity functional | fits A01 | [0,0,0] | [0,0,0] | body-centred | REACTION_ROOT | nine FK bones, three jelly shape keys, named animation clips.
- A05 CAM_sprout_hero, LGT_sprout_key/fill/rim | route [BLOCK] | fidelity studio | camera/lights outside character | fixed near-front camera | aimed at body | no runtime export | controlled shape/reflection evidence.
- generation estimate/submission state: no [GEN] assets in this pass; zero generation jobs submitted.
- fidelity defaults: hero receives continuous topology, clean deformation and controlled reflections before final acceptance; primitives are temporary blockout evidence only.

## SHOT

- active camera: CAM_sprout_hero in the new scene only.
- framing/lens/target: orthographic near front, initially [0.10,-6.0,0.24], target [0,0,0.08], vertical span 2.8 m; tune once against actual bounds, then lock for comparisons.
- foreground, subject, background depth: character fills most square; transparent world; no pedestal/accessory for first proof.

## LOOK

- material roles and palette: accepted aqua/blue front with one violet-to-coral/peach lower sweep, controlled tall white highlights, opaque eyes/glints. Pale clay remains as milestone evidence.
- material route [NONE] for external generation; original portable vertex color/Principled materials authored locally.
- texture scale/coordinates: object-space color recipe baked into mesh color attributes; UVs created before morphs for future maps.
- relief polarity: no bump/displacement in initial proof; geometric morphs and bone motion.
- dielectric/metallic: glossy jelly dielectric; compare moderate transmission with opaque glossy under identical framing/exposure. Eye roughness keeps the oval visible.
- world/background: neutral reflection studio, transparent render; browser uses equivalent original broad reflection shapes.

## LIGHTING

- focal subject: stable eyes and front cheeks; secondary buds and lower color sweep; deepest navy remains in eyes.
- reference mood: bright friendly product illustration, deliberately stylized; reference boards viewed before building.
- environment route [NONE]; true HDR-EXR not required for the first clay proof.
- world-only and zero-world baseline: saved diagnostic renders during look development.
- key: broad upper camera-left softbox, describing the forehead and left cheek with one coherent highlight.
- fill: lower-power broad camera-right source recovers the right eye and silhouette without flattening the key.
- rim: cool rear-upper source separates buds/shoulder after the key and fill are evaluated.
- motivation: studio reflection cards; each role toggled separately.
- reflection strategy: broad smooth highlight bands, restrained darkness between them; tune geometry before extra lighting.
- gobos/flags/atmosphere: none initially; no bloom or volume masking geometry.
- color management: AgX, exposure 0, fixed across comparisons; record runtime tone mapping separately.

## MOTION

- fps/frame range: 24 fps; Idle/Listen/Think/Speak 1–145, Click 1–11, Blink 1–5; all export to zero-based time.
- object beats: Idle gentle body/short bud motion; Listen attentive lean; Click anticipation/squash/recovery on REACTION_ROOT; Blink on lids. Think/Speak follow four-clip proof.
- rest poses and loops: endpoints and seam velocity match; gaze is unkeyed and bounded; body morph vector has one animation owner; feet remain visible while floating.

## ACCEPTANCE

- structural: protected inventory unchanged; unique semantic names; continuous closed body; fixed topology before keys; 9 joints, 3 keys, 4 independent initial clips; valid GLB with expected POSITION/NORMAL deltas; copied .blend opens with editable source.
- motion: deterministic replay, real evaluated poses at rest/departure/peak/settle/seam, no eye penetration, clipping, channel ownership overlap or interruption snap.
- visual: inspected native Blender camera/side views and browser 44/96/160px; clear eyes, short unequal buds, rounded feet, clean highlights and controlled Prism sweep.
- lighting: viewed world-only/zero-world/key/fill/rim/full renders, grayscale hierarchy, clipping/spill check and motion contact sheet at fixed exposure; atmosphere absent.

## Preflight evidence

Native viewport showed the existing Ribbon around its pearl. Both existing scenes were read: Ribbon has 13 objects, Cycles/AgX/640px; default Scene has Cube/Light/Camera and EEVEE/AgX/1920×1080. Neither contains an existing Sprout candidate. Original source remains protected.

## Clay corrections and measured evidence

The continuous runtime body has 7,528 control vertices, 15,052 triangles and no non-manifold edges. Topology and spherical UVs were finalized before the nine-bone rig and three shape keys. The first runtime export has 9,792 split vertices across seven meshes. Crease meshes for closed eyes are a subsequent source refinement.

The first export accidentally included the default scene's selected Cube because the exporter's default includes multiple scenes. Setting both use_selection and use_active_scene removed it. A pose-review helper then exposed a second issue: muting a one-shot NLA track does not restore an object's unanimated neutral transform. Export and render scripts now explicitly reset reaction/lid rest transforms before evaluating the base pose. Both defects were observed and corrected before the accepted clay hash.

Accepted four-clip clay hash: b94192fea987064befd084a2a8ad2c27b9dcb7614ce2365fae88e2cc4e73fc15. Its Khronos validation has zero errors, one non-root skinned-mesh warning and one unused-UV information message. The body intentionally remains under its armature; evaluated Three vertex checks verify that both the skeleton and face follow the reaction root. UVs are reserved for later texture authoring; this pass uses no image texture.

The editable clay data library source was opened in a separate background Blender and its scene, nine bones, three keys, four named clips and seven source proxies verified. The final deliverable will additionally be a normal Blender copy with its active Sprout scene and UI context, preserving the live source filepath.

## Locked Prism asset and viewed evidence

Final canonical export: `sprout-prism-v002.glb`, 1,295,856 bytes, SHA256 `34cd83c23c60afedbf6edd9e9e337af4715a6f60070fe59ca90b9a8b7a73d756`. The runtime copy is `../../../public/buddy/sprout-v002.glb`. It contains six clips, nine joints and three body morphs. Its validator has zero errors and the same explained non-root-skin warning/unused-UV information as the clay proof.

The normal editable source copy is `source/sprout-prism-v002.blend`, SHA256 `d636554af1d2ae493a8414de322a0028779f1fd6d47baff2133be0546a12a2ae`. A separate background Blender opened it and verified the active asset's 29 objects, nine bones, three keys, six clips, seven source proxies and camera (`proofs/final-source-inspection.json`). Saving the copy preserved the live empty filepath and the existing 13-object Ribbon and three-object default scenes.

Matched glossy and transmission studies were rendered from the same camera and exposure, then loaded into the actual browser at 44/96/160/320px. Transmission added little useful character definition at pet size. The accepted glossy material uses roughness .16, coat .50, coat roughness .10 and transmission 0. The first lighting pass washed out the face; narrower reflection cards restored the blue. A lower bounce-card trial caused rectangular highlights and foot glare, so it was rejected. The final lower-color albedo was lifted slightly instead. No custom deformation shader, external HDRI, image texture or physics library was needed.

The 640px / 96-sample Cycles fallback is `proofs/sprout-prism-front.png`, also copied to the runtime PNG. Viewed 320px / 24-sample diagnostics include mid/closed blink, Click squash, Listen, Think and Speak. The final pose sheet and fixed-exposure world-only/zero-world/key/fill/rim/full sheets, including grayscale, are in `proofs/final-*-sheet.png` and `proofs/final-lighting-grayscale.png`. They show readable eyes and silhouette, controlled reflection hierarchy and no detached face during squash. Browser images in `../../../artifacts/sprout-web-look/final-*.png` verify the actual exported result, whose pixels differ from Cycles.

The final six-clip replay's evaluated geometry, face mount, loop endpoint/seam velocity and combined morph checks pass in `../../../artifacts/sprout-prism-final-motion-replay.json`. The largest 30/60/120Hz matrix difference is approximately 8.52e-14. Native production performance and complete application acceptance are recorded separately in the delivery README; a GLB validation pass alone does not establish those results.

The acceptance audit added explicitly paired Idle start/midpoint/seam views in `../../../artifacts/sprout-loop-pairs/matched-idle-board.png`. A separate background Blender process rendered the saved master at frames 1/73/145 without saving it; its SHA-256 remained unchanged. The browser captures evaluate the real renderer/controller at 0/3/6 seconds with centered gaze and automatic reactions suppressed only by the capture harness. Opening and seam browser pixels and pose matrices are identical. The viewed six-image board retains the face, feet and silhouette through the midpoint; Cycles/Three reflections and color differ. The report records the exact source version; subsequent visibility-only renderer changes do not change these authored poses or materials.

## Local application acceptance and remaining limit

The compiled UI running in actual Electron on the NVIDIA RTX 5050 achieved a 16.8ms renderer interval p95 at 96px, 17.0ms maximum and no renderer intervals over 18ms in the accepted replay. The independent rAF sample measured 16.8ms p95, 19.6ms maximum and 3/1,103 intervals over 18ms. Ten draw calls and .70ms render-call CPU p95 were measured locally. Its 309.4ms first model render followed an initial development buddy render, so it is a warm-avatar startup measurement. These are sampled clocks/CPU calls, not operating-system presented-frame or total-GPU-memory measurements. Screenshots and video are captured separately from the timing window. The exact served binary hash passed; no studio API calls or page errors occurred. See `../../../artifacts/sprout-native-prism-production/report.json`.

The independent `../../../artifacts/sprout-native-prism-cold-load/report.json` uses a fresh process/profile with both initial GLB fetches blocked before parse/GPU allocation and visible PNG fallback. The first compiled avatar measured 149.8ms fetch, 29.3ms parse, 1,125.2ms GPU setup and 1,306.7ms first model render; readiness appeared 1,629.2ms after compiled navigation. The native security settings and exact GLB hash passed. OS/driver cache state was not controlled. This first-use setup cost is separate from steady animation timing.

The computed-style/browser accessibility-tree audit in `../../../artifacts/buddy-accessibility-audit.json` passes 320 CSS-pixel reflow, Large text at 22px, 44px controls, forced colors and keyboard disclosure/focus. Audited sustained text meets 7:1 (welcome 7.27, conversation 7.49, compact bill prose 7.08 and source link 7.54); brief labels remain AA-passing and some below 7:1. Compact bill prose retains its 14px default and existing detailed views. Browser AX evidence is not a physical screen-reader session or blanket accessibility certification.

Native panel tests passed rapid reversals, real bounds acknowledgements, edge clamping, preserved draft/selection/scroll, modal/workspace focus and 200% zoom on the reference display. Viewed controlled bright/dark/patterned backgrounds retain readable text and visible character eyes. Actual initial UI screenshots are `../../../artifacts/sprout-native-welcome.png` and `../../../artifacts/sprout-native-collapsed.png`. The full test run passed 143 tests with three existing Python-configuration skips; both local and public builds passed.

Five focused final-asset browser checks subsequently passed: actual-size replay, keyboard/mobile accessibility, paused/system-reduced motion, no-WebGL PNG and context recovery with the draft retained. Their captures are in `../../../artifacts/sprout-browser-current/`. The separate native VP9 recording is `../../../artifacts/sprout-native-prism-video/native-replay-and-panel.webm` (1280×900, 25fps, 27.48 seconds); viewed frames show the actual full Blink and panel with an unsent draft. Recording cadence is not the performance acceptance measurement.

The final-asset native recording and report in `../../../artifacts/buddy-voice-native-final/` exercise the actual voice hook, MediaRecorder, HTMLAudio and Web Audio meter using local oscillator/PCM fixtures. A playing four-second reply was interrupted at .873 seconds, the next output generation was measured, and explicit Pause stopped capture/playback and cleared both levels. The original typed draft survives both voice turns, collapse and reopen without refilling or submission. This caught and corrected an unconditional draft-clear in the spoken-turn path. A permanent focused E2E also verifies that explicitly submitting the typed draft still clears it. The earlier .288-second clay proof remains historical. The final 14.8-second video is visual-only; element/track/meter assertions establish synthetic audio behavior.

The compiled native edge/panel record in `../../../artifacts/sprout-native-prism-edge-panel/` passes bottom-right work-area clamping, keyboard reopen, draft/focus retention and identical reduced-motion avatar pixels across 450ms. Its app-only video is paired with actual native bounds; it is not a full-desktop recording or physical multi-monitor test.

These checks do not prove physical device audibility or live ElevenLabs output. This machine reports ElevenLabs `configured: false` and `ttsConfigured: false`. The live-provider acceptance gate remains unverified; credentials were neither read nor included in artifacts. The implementation is reviewable with that limitation stated explicitly.

The [acceptance audit](ACCEPTANCE-AUDIT.md) records later requirement-by-requirement checks without changing the asset. It caught and corrected reading-memory loss on workspace remount and continuous avatar rendering after native hide/minimize. The native visibility bridge is read-only and keeps background voice/task timers unchanged. Its separate synthetic audio proof in `../../../artifacts/buddy-voice-native-visibility/report.json` records playback advancing 0.675 seconds while hidden, the same live capture track/recorder, fresh output samples, restored speaking state/draft and explicit Pause cleanup. Thirteen visibility/coordinator tests, two focused browser regressions and fresh default/public builds pass. Provider/device verification remains outstanding.
