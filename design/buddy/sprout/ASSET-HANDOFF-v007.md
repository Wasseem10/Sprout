# Sprout speaking v007

The Daylight Sprout now has a planted explaining gesture. The left bud leads one phrase, the right leads the next, and each tip follows its base by 130 ms. A small closing gesture settles into the loop seam. The torso expands slowly; the root and both feet stay fixed. It does not hop, repeatedly nod or rock from side to side.

This replaces **Sprout_Speak** under the existing six-second base-loop contract. It adds no new mouth rig, lip-sync claim, eye track or reaction-root track. Runtime speech activity controls when it plays; the asset does not own audio.

## Versioned files

| Asset                                                  | Path                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Editable Blender source                                | [source/sprout-speaking-v007.blend](source/sprout-speaking-v007.blend)                                 |
| Full reopened-source export                            | [sprout-speaking-source-v007.glb](sprout-speaking-source-v007.glb)                                     |
| Canonical GLB                                          | [sprout-speaking-v007.glb](sprout-speaking-v007.glb)                                                   |
| Runtime GLB                                            | `public/buddy/sprout-v007.glb`                                                                         |
| Idle fallback                                          | [sprout-speaking-v007.png](sprout-speaking-v007.png), `public/buddy/sprout-v007.png`                   |
| Sleep fallback                                         | [sprout-speaking-sleep-v007.png](sprout-speaking-sleep-v007.png), `public/buddy/sprout-v007-sleep.png` |
| Settings, hashes, preservation and fallback provenance | [sprout-speaking-v007.manifest.json](sprout-speaking-v007.manifest.json)                               |

Canonical/runtime SHA256: `dc609f0962b946bcae632988697d3dc12284e4405b03d80a3dd20950dd0fdb1c`. Size: **1,460,192 bytes**, 14,740 bytes above v006.

The new version uses the **Daylight** appearance profile and `happy-eyes-v005` animation audit profile. URL/default selection, metadata, fallback paths and lighting must agree. In particular, selecting the successfully loaded v007 must not fall through to Original reflection cards. Original v005 and legacy assets remain available.

## Preservation

- The v005 and v006 source, full source export, canonical/runtime GLB and public idle/sleep PNGs remain unchanged. The verifier checks their recorded hashes, including the two immutable runtime hashes in the implementation brief.
- All geometry, materials, textures, hierarchy and skins are exact v006. The entire prior runtime binary remains an exact prefix. Ten non-Speak animation dictionaries and their streams remain exact.
- The v007 **full Blender export** independently preserves v006 source geometry/materials and all ten non-Speak animation sample streams. Preservation is not merely a claim based on copying runtime bytes.
- Speak has the same 29-channel body contract: nine bones × translation/rotation/scale, plus the complete paired shell/core jelly vectors. It has no eye, glint, reaction-root or procedural gaze channels.
- Idle and sleep did not change, so the versioned fallback PNGs are exact copies of the approved v006 actual Cycles renders. The manifest records their provenance. They were not regenerated with random sampling differences or represented as newly rendered images.

## Authoring and checks

[38_author_speaking_v007.py](38_author_speaking_v007.py) runs in an isolated background Blender 5.2.2 process opened on `source/sprout-daylight-v006.blend`. It authors the three Speak action owners, saves a new source, reopens it and exports the actual animation. Only those source-authored animation samples are packaged into the immutable v006 container. Constant exporter-added armature-object tracks are excluded from the established body contract. Original assets and the unrelated live scene are untouched.

[39_verify_render_speaking_v007.py](39_verify_render_speaking_v007.py) reopens the saved v007 and verifies:

- All 145 authored Speak frames have finite values, fixed root/feet and identical shell/core morph vectors.
- First and last full-body values match exactly; the exported loop seam also has zero numerical error.
- Seven visible mesh bounds remain finite and inside the existing framing.
- Twelve sampled source poses retain the inner core inside the shell; the smallest sampled clearance is **0.10704** source units.
- All **198** retained happy-eye closure samples match the existing Blink/SleepEnter/SleepLoop/Wake contract.
- Seven actual 320 px source renders have unclipped alpha bounds. Idle, Listen, Think and four speaking phases are included.

[40_verify_speaking_v007.mjs](40_verify_speaking_v007.mjs) independently checks the runtime GLB against both the baseline and complete new source export. It verifies all 29 channel bindings, exact sample provenance, six-second duration, loop seam, fixed feet/root, paired morphs, original file hashes and fallback/render hashes.

Evidence: [preservation audit](proofs/v007-preservation-audit.json), [reopened-source audit](proofs/v007-source-audit.json), [source render record](proofs/v007-source-render.json), [Khronos validation](proofs/v007-gltf-validation.json).

The validator reports **zero errors**, the same two inherited skin warnings, the existing unused-UV information item and seven additional unused original Speak accessors. Those old streams are deliberately retained to preserve the complete baseline binary; the runtime animation points to the new samples.

Recheck the immutable data and source without altering either:

```powershell
& 'D:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup design/buddy/sprout/source/sprout-speaking-v007.blend --python-exit-code 1 --python design/buddy/sprout/39_verify_render_speaking_v007.py -- audit
node design/buddy/sprout/40_verify_speaking_v007.mjs
node scripts/validate-buddy-asset.mjs design/buddy/sprout/sprout-speaking-v007.glb .local/v007-validation-review.json
```

The authoring script refuses complete existing versioned outputs. Reproduction belongs in an isolated copy or a fresh version. Its explicit incomplete-export retry is limited to a candidate with no canonical asset or manifest.

## Actual source frames

| Idle                                                    | Speaking, left phrase                                     | Speaking, right phrase                                    |
| ------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| ![Source Idle frame 26](proofs/sprout-v007-idle-26.png) | ![Source Speak frame 26](proofs/sprout-v007-speak-26.png) | ![Source Speak frame 81](proofs/sprout-v007-speak-81.png) |

These are unchanged transparent Cycles renders from the reopened source, not generated reference art or browser screenshots. The small gesture is intended to read in motion. Actual-size browser, native panel and automatic voice-state evidence belongs to the integration delivery; this asset handoff does not claim those checks or live-provider testing.
