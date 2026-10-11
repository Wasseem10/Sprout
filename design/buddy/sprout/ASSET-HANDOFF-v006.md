# Sprout Daylight v006

A separate look for the bright glass panel, based on the selected v005 Sprout. The original v005 `.blend`, source GLB, canonical GLB, idle/sleep PNGs and public copies remain intact. This is a material and lighting alternative: the silhouette, happy eye morphs, rig, eleven animations and original multicolour core texture are preserved.

## Files

| Asset                 | File                                                                                                   | SHA256                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Editable source       | [sprout-daylight-v006.blend](source/sprout-daylight-v006.blend)                                        | Recorded in the manifest                                           |
| Full source export    | [sprout-daylight-source-v006.glb](sprout-daylight-source-v006.glb)                                     | Recorded in the manifest                                           |
| Canonical/runtime GLB | [sprout-daylight-v006.glb](sprout-daylight-v006.glb), `public/buddy/sprout-v006.glb`                   | `b8de0b88395e4b876f0eb668a0a7f39317c24d3530c9d15e58a01c7aa561824f` |
| Idle fallback         | [sprout-daylight-v006.png](sprout-daylight-v006.png), `public/buddy/sprout-v006.png`                   | `9032ab7125f370c6f4a1f229406ab69408633cca442604f714b14d2c6db6ce53` |
| Sleep fallback        | [sprout-daylight-sleep-v006.png](sprout-daylight-sleep-v006.png), `public/buddy/sprout-v006-sleep.png` | `c476ff185fd92212b70dc865096efab68e43534078de13a6447bdbf0e70c9a4f` |

The GLB is 1,445,452 bytes. Both PNGs are transparent 640×640 source renders, 293,943 and 237,254 bytes. They have unclipped alpha bounds and show the actual source idle/sleep actions. The [manifest](sprout-daylight-v006.manifest.json) records source hashes, settings, material values, preservation exceptions and lighting.

## What changes

| Property               | Original v005 | Daylight v006                            |
| ---------------------- | ------------- | ---------------------------------------- |
| Shell roughness        | .06           | .11                                      |
| Clearcoat amount       | .85           | .52                                      |
| Clearcoat roughness    | .045          | .10                                      |
| Transmission           | .88           | .80                                      |
| Core emission strength | 1.1           | .78                                      |
| Shell vertex colour    | Original      | Linear RGB multiplied by `[.78, .90, 1]` |

The new shell retains glossy highlights while reducing the broad white reflection and adding enough blue to keep its edge visible on a pale panel. The coral, lavender and aqua texture is unchanged. The deliberately limited transmission still reveals the original coloured inner body; this does not sample or refract arbitrary desktop windows behind the application.

The editable source also has cooler, less intense reflection cards: key/fill/rim/upper strengths `7/6/6/8`, with RGB `[.92,.97,1]`, `[.78,.92,1]`, `[.84,1,.95]` and `[.88,.95,1]`. Card geometry is unchanged. Source key/rim lights are 385/200 watts; fill stays 45 and world strength .18. These provide a Cycles approximation of the matching daylight browser profile, not a claim of identical pixels between engines.

## Preservation and reproduction

[35_author_daylight_v006.py](35_author_daylight_v006.py) runs in an isolated background Blender 5.2.2 process opened on the immutable v005 source. It saves a new editable file and full source export, then places only the two source-exported material dictionaries and shell `COLOR_0` bytes into the frozen v005 runtime package. All other accessor bytes, nodes, meshes, skins, animations and texture bytes remain exact. This avoids unrelated exporter round-trip drift and preserves the existing eye/animation ownership contract (`happy-morph-v005`). The script refuses existing output names; reproduce in an isolated copy or a new version.

[36_render_daylight_v006.py](36_render_daylight_v006.py) reopens the new source, checks all 198 authored eye closure samples across blink/sleep/wake, then renders the idle and sleeping fallbacks at 64 Cycles samples. Reflection cards are invisible to direct camera rays but remain available for actual surface reflections. Neither background script changes the live unsaved Blender scene.

Read-only asset verification:

```powershell
node design/buddy/sprout/37_verify_daylight_v006.mjs
node scripts/validate-buddy-asset.mjs design/buddy/sprout/sprout-daylight-v006.glb .local/v006-validator-review.json
```

The [preservation audit](proofs/v006-preservation-audit.json) passes, including exact original v005 hashes and matching public copies. The [Khronos validation report](proofs/v006-gltf-validation.json) has zero errors, the same two skinned-child warnings and one unused-UV information item as v005. The [source render record](proofs/v006-daylight-fallback.json) verifies reopened source actions, source/asset hashes, eye values and PNG bounds. Browser, native window, fallback selection and runtime lighting verification belong to the integration report; this asset handoff does not claim those checks.
