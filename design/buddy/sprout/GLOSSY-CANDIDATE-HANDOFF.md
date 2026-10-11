# v003 glass candidate handoff

Research/authoring date: 2026-10-10. These are material studies, not promoted production assets. They were authored in separate background Blender 5.2.2 LTS processes from the immutable v002 saved master; the live Blender scene and public asset were not changed.

| Study | Editable source | GLB | Bytes | SHA256 |
| --- | --- | --- | ---: | --- |
| B — single volumetric body | [source/sprout-volume-v003.blend](source/sprout-volume-v003.blend) | [sprout-volume-v003.glb](sprout-volume-v003.glb) | 1,296,568 | `a2da2ca9c2891ffe7b94059d3ff63f2f8d1aff922b8480f0cd438b2de15ade69` |
| C — volumetric perimeter and inset blue core | [source/sprout-core-v003.blend](source/sprout-core-v003.blend) | [sprout-core-v003.glb](sprout-core-v003.glb) | 1,377,708 | `093e731f14b7b1bc4290b3b0124e6cfab48f8cbbde9b68141b93550d3ad4d4d5` |

The source master is `source/sprout-prism-v002.blend`, SHA256 `d636554af1d2ae493a8414de322a0028779f1fd6d47baff2133be0546a12a2ae`. The protected public/canonical v002 GLB remains SHA256 `34cd83c23c60afedbf6edd9e9e337af4715a6f60070fe59ca90b9a8b7a73d756`. The original body basis/topology, nine-bone rig, semantic hierarchy, gaze/eyes/lids, and six animation clips are retained. No new image texture or compression is present.

## Actual exported material contract

Both GLBs contain `KHR_materials_transmission`, `KHR_materials_volume`, `KHR_materials_ior`, and `KHR_materials_clearcoat`. Alpha is 1; the body uses physical transmission rather than an alpha-blended opacity shortcut. Thickness values are model units (body width is approximately 2 units), not a claim of measured physical anatomy.

| Parameter | B | C outer body |
| --- | ---: | ---: |
| Transmission | 0.84 | 0.90 |
| Roughness | 0.105 | 0.095 |
| IOR | 1.38 | 1.36 |
| Clearcoat / coat roughness | 0.85 / 0.055 | 0.90 / 0.045 |
| Constant thickness | 0.48 | 0.36 |
| Attenuation distance | 3.5 | 4.5 |
| Attenuation colour, sRGB author input | (0.38, 0.77, 1.00) | (0.80, 0.96, 1.00) |

`Prism_Color` remains the vertex-colour attribute. It now blends broad lavender/coral undertones into the lower perimeter at low strength, replacing the narrow painted stripe. C uses a paler cyan shell. Lids have a separate **opaque** coated blue material with zero transmission; navy eye, white glint, and smile materials retain their v002 settings. Complete exported values and nodes are in each `*.manifest.json`.

The installed Blender exporter initially discarded a custom Thickness-only metadata group through its inline-material route. Authoring now uses its `create_settings_group()` helper, including the recognized Occlusion input, and asserts the actual exported volume extension and thickness. This export gate must remain; a pleasing Blender surface alone does not verify runtime volume.

## C core ownership and containment

`SPROUT_CORE` is a closed inset blue ellipsoid in `SPROUT_MODEL`, parented to `RIG_Sprout` and skinned entirely to the existing `BODY` bone. Its material is opaque, non-emissive, roughness 0.23 with clearcoat 0.20. No extra bones, rig controller, or runtime writer was added.

The core owns `Jelly_Squash`, `Jelly_Sway_L`, and `Jelly_Sway_R` in the same order as the shell. The original deformation fields are evaluated on the inset basis. Each of the four base clips contains one complete three-weight vector for both shell and core; C therefore has 29 channels per base clip. Click retains the two `REACTION_ROOT` tracks, and Blink retains two lid-scale tracks. Runtime additive attention compression must use the same mixer/property binding and apply the same weight to both owners. Rotating a common outer mount must not become an authored animation track.

Source geometry containment checks cover 20 sampled authored base poses and all eight full independent morph corners combined with peak click transforms. All 28 states have zero outside core vertices, with minimum shell clearance 0.1380779594 units. These source checks support handoff; the runtime combined pointer, blend, and additive-squash pose still needs its actual exported-mesh proof. Common shell/core mount yaw and pitch preserve geometric containment, while visible clipping and face readability need camera captures.

## Completed checks and remaining visual gates

Both GLBs pass the Khronos validator with zero errors. B retains the v002 non-root skinned-body warning; C also has that warning for the new core. The warning is acceptable only with the shared parent/bone transforms demonstrated by the evaluated geometry checks. The reserved body UV has an unused-UV informational diagnostic. Six-clip 30/60/120 exact-time replay checks pass for both candidates. Reports are [B validation](proofs/volume-v003-validation.json), [C validation](proofs/core-v003-validation.json), [B motion](proofs/volume-v003-motion.json), and [C motion](proofs/core-v003-motion.json).

The matched transparent offline front studies are [B](proofs/volume-v003-front.png) and [C](proofs/core-v003-front.png), with adjacent render manifests. They use the v002 hero camera (orthographic span 2.8), unchanged key/fill/rim/world, AgX exposure 0, and OptiX 24 samples at 320 px. B has liquid reflection/edge distortion but a dark uniform blue interior. C separates the inset blue lobe from the cyan perimeter, buds, and feet; its offline face remains pale and the undertones subdued compared with the reference. Neither is visually accepted yet.

Required comparison: actual served A/B/C at 44/96/160/320 CSS px on bright, dark, and busy owned backgrounds; front and bounded pointer turns; open and closed eyes; click and speaking blends; interrupted pointer reversal and settle. At 96 px, depth and the character's eyes must survive without a milky opaque centre, a circular core seam, hard colour banding, or a disappearing silhouette. Native transparent-compositor and transmission cost checks remain separate from these Cycles stills.

## Refined C checkpoint

The first actual browser studies confirmed a muted solid oval interior and a pale cyan perimeter. A new unaccepted checkpoint preserves the initial B/C files:

- [sprout-core-refined-v003.glb](sprout-core-refined-v003.glb): 1,382,784 bytes; SHA256 `2659add1d2ae3fac64df9f4a33a06b36f5c3368737ac92acfd30f9d3b4eefcc2`.
- [source/sprout-core-refined-v003.blend](source/sprout-core-refined-v003.blend): SHA256 `70e6f1f95a82f0f9040f0c5537cb922c78969656a3d438d2ad172392b3ec529d`.
- [Manifest](sprout-core-refined-v003.manifest.json), [validator](proofs/core-refined-v003-validation.json), [six-clip motion](proofs/core-refined-v003-motion.json), and [combined source attention clearance](proofs/core-refined-v003-attention-clearance.json).

Its 610-vertex core keeps the same rig and paired morph tracks, with a gently unequal pear profile and a cyan edge vertex gradient around a brighter royal-blue centre. The core's authored constant blue emission strength is 0.16 (exported linear emissive factor approximately `[0.00018576, 0.03278428, 0.16]`); runtime audio may subtly adjust intensity while retaining this hue. This fill is a stylized inner-light treatment, not scattering. Shell roughness is 0.065, IOR 1.4, thickness 0.34, transmission 0.90, and clearcoat 0.85. Broad blended undertones are stronger at the low lateral perimeter; the outer silhouette/body basis and opaque lids remain unchanged. Reflection cards are still the initial rectangular cards pending joint runtime lighting comparison.

Validator errors remain zero, with the same two expected non-root skin warnings. Exported six-clip replay passes. The initial 28 authored/morph-corner source states retain a minimum clearance of 0.1108152270 units. A separate CPU-only 42-state source probe applies measured attention lag 0.296 and a conservative configured bound 1, paired additive squash, BODY bone-local scale, all four base clips and click peak, and a common 10-degree yaw/-6-degree pitch. It finds zero outside core vertices and minimum clearance 0.1136023924 units. The probe extends the in-memory Blender squash slider range so the conservative bound does not silently clamp baseline-plus-additive weights; it never saves the source. It is not a substitute for actual exported/runtime mixer, eye, and camera-envelope checks.

Three's raster transmission can sample its own rendered scene, not arbitrary pixels behind an Electron window. Desktop alpha compositing can reveal the desktop but does not establish refraction or blur of OS pixels. No screen capture is authorized or implemented for this material effect. Constant thickness is a stylized approximation, and the inset core is an opaque inner form rather than a fluid or scattering simulation. This handoff makes no final performance, deployed URL, or live-provider claim.

## Luminous texture checkpoint

The refined browser study still looked muted, with the refracted core too close to the silhouette. [sprout-core-luminous-v003.glb](sprout-core-luminous-v003.glb) is a new unaccepted 1,400,804-byte checkpoint, SHA256 `678b17b268a6feff098d63c6869d832dd5231fae442631eb61fcc385dc06ab06`. The saved [source](source/sprout-core-luminous-v003.blend) has SHA256 `571581043b3b056b054fbf35577a2ccdfcc298189d1b0736698e40f21d00bbf4`. Its core X coordinates narrow by 11%; rig, paired morph tracks, and core vertex count stay intact. Shell transmission is 0.88, roughness 0.060; other volume/IOR parameters retain the refined values.

[21_luminous_core.py](21_luminous_core.py) analytically authors [textures/sprout-core-light-v003.png](textures/sprout-core-light-v003.png), an original 128×64 RGB8 sRGB data map with spherical UVs and a seam-unwrapped repeat sampler. The core uses this same map for base colour and emission strength 1.1. It gives an azure centre, vivid cyan edge, and broad lower lavender/coral lobes. No reference pixels, baked highlights, texture scrolling, or custom shader are used. The image is packed into the editable source and embedded in the GLB. Its 8,773 bytes and SHA256 `9128429d432523822748e4dfae1e4c4a1b6d1c5760d380c4e5e2a33f892f7fdc` match the actual embedded PNG exactly. Blender emits two texture definitions for one shared image and sampler; material integrity checks compare the image source rather than assuming equal texture indices.

The validator still has zero errors/two expected skin warnings. Twenty authored source poses have minimum core clearance 0.1182323694 units; the additional42-state attention source probe has zero outside vertices and minimum clearance 0.1190010533 units. The Node exported-geometry/motion audit requires a clearly labelled no-pixels texture placeholder; it cannot certify material pixels. Real Chromium texture decoding/stills are mandatory.

The first real-texture browser board remains pastel under AgX and is not accepted. The centre palette is approximately sRGB `(0.01, 0.52, 1)` (azure), while the reference calls for deeper cobalt. A bounded built-in tone-mapping comparison should diagnose colour compression before a final palette refinement. Current lower coloured reflection cards create localized patches and must not substitute for broad authored undertones. [source/sprout-core-luminous-lighting-v003.blend](source/sprout-core-luminous-lighting-v003.blend) mirrors six fixed tapered/coloured trial cards, with the recipe in [proofs/core-luminous-lighting-v003.json](proofs/core-luminous-lighting-v003.json); it has not been rendered or accepted.

## Royal, Prism, and clear-shell comparison

The bounded tone-mapping study established that Sprout's authored blue survives better under built-in Neutral tone mapping at exposure1. The fixed lighting recipe now uses four white tapered/rectangular reflection cards; the lower coloured cards were removed because they produced cheek patches. Source copies use Blender's verified `Khronos PBR Neutral` view at exposure0. These renderers remain different implementations, so the matching recipe does not assert equal pixels.

| Checkpoint | Canonical GLB SHA256 | Bytes | Change |
| --- | --- | ---: | --- |
| [Royal](sprout-core-royal-v003.glb) | `2074926a313bbb0ce680b3156402e35b5dfa79dc2ebacc3874c906704d51ffde` | 1,401,164 | Core centre G decreases to0.34 while cyan edges remain; geometry/emission unchanged |
| [Prism](sprout-core-prism-v003.glb) | `b6cd58b14cfbe6dcb37033c9eaa35b5f84cee85001607d094f78492c86dc2045` | 1,402,276 | Broader lower lavender/coral lobes at normalized Z−0.40,width0.55,lateral strength0.84 |
| [Clear Prism](sprout-clear-prism-v003.glb) | `6d0c94ec614c0d2d5ffbc158a40443076594e6a6dbffe76b8b2745f25b5229f3` | 1,402,272 | Shell COLOR_0 becomes near-neutral sRGB(0.94,0.975,1); exact Prism core texture/geometry/motion retained |
| [Selected clear rim](sprout-clear-prism-rim-v003.glb) | `63bc8f0289634e03716732c6beefe2f3492d53d1f54ec04dd8e23d28fddf0a32` | 1,402,276 | Near-neutral central/lower shell, cyan only outermost boundary/buds/feet for bright-background silhouette |

The Prism core map is [textures/sprout-core-prism-v003.png](textures/sprout-core-prism-v003.png), 10,247 bytes, SHA256 `4dbae7a23b6e0755c5eb5b131aca8dcc93d0705b44331a937c696c0a18a8ec33`. In the first Prism browser study its coral became green: Three's physical transmission multiplies sampled inner light by the shell diffuse colour, including vertex colour. Correcting only a material fallback factor cannot remove a saturated COLOR_0 filter. Clear Prism changes that shell filter, retains transmission0.88/roughness0.060/IOR1.4/thickness0.34/attenuation distance4.5, and keeps the exact embedded core PNG/base/emission1.1. Warm undertones recover in actual320/96 images, with a brighter nearly white perimeter/buds on the light background. Selection and native background readability remain separate gates.

[22_clear_prism_material.py](22_clear_prism_material.py) preserves every non-colour geometry/skin/morph accessor, node, skin, and animation sample from the frozen Prism GLB; it replaces only the source-exported shell COLOR_0 buffer and material name. This explicit normalization avoids a saved-source Blender export drift in constrained lid rest transforms (not a material change). Its [manifest](sprout-clear-prism-v003.manifest.json) records the frozen input, source digest, exact retained texture, and byte checks. The saved [editable source](source/sprout-clear-prism-v003.blend) has SHA256 `4a61caa8c08e2e07565f51de63a0f2bdb6a39e94314891ce26de47ef5a4d4012`. Direct manual export can reproduce the look but must use the documented normalization to reproduce this exact material-only comparison. [Validation](proofs/clear-prism-v003-validator.json) has zero errors and the same two non-root skin warnings.

The final `-- rim` variation restores a bounded cyan tint to the outermost source X/Z radial boundary and appendages, retaining the neutral path through the warm lower core. Its authored masks and colours are in [the selected checkpoint manifest](sprout-clear-prism-rim-v003.manifest.json). Actual320/96 browser comparison confirmed that the cyan appendage silhouette returns while lavender/peach survives. Root selected this exact checkpoint and copied it to [canonical Sprout v003](sprout-prism-v003.glb) and `public/buddy/sprout-v003.glb` without changing bytes. [Selected validation](proofs/clear-prism-rim-v003-validator.json) retains zero errors/two expected skin warnings. The final [browser matrix and interrupted attention proof](../../../artifacts/sprout-glossy-final/report.json) and [actual exported controller/core containment](../../../artifacts/sprout-glossy-final/runtime-core-containment.json) pass; Node containment uses a labelled no-pixels texture placeholder, with real embedded-image decoding separately verified by Chromium.

[DELIVERY-v003.md](DELIVERY-v003.md) and [the final manifest](sprout-prism-v003.manifest.json) identify the selected four-card Neutral editable source, exact core texture, canonical/runtime bytes, and source-backed static PNG. The640px/96-sample OptiX fallback preserves source SHA256 `7eedbf68bd66c8242ccb91815c547b1e5da8832208f076a6989a589e7bf00e20`; canonical/runtime PNG SHA256 is `47a46dd7ea30020f3e8cc1850622f8b62277534e3ae522e961aea9e4affc0033`. Both the original render and its actual44/96/160px bright/dark/busy HTML board were viewed. Native compositor/performance/lifecycle and live-provider gates remain independently scoped by root; these asset checks do not certify them.

## Reproduction

`15_glass_candidates.py` refuses to overwrite candidates or the protected master. New look refinements need a new named checkpoint. Run each B/C authoring command in a fresh background process with `--factory-startup` and the immutable master. This avoids unrelated installed addon/network startup.

`16_render_glass_candidates.py` reads the corresponding owned source, applies a study pose in memory, writes only new proof PNG/JSON files, and verifies the source hash is unchanged. `front` is the bounded front study; `poses` covers six supporting expressions/turns. Coordinate GPU renders with the native/runtime test owner. Public GLB/fallback promotion belongs to root after actual app selection.
