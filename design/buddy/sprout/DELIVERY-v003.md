# Sprout v003 delivery

Status: the clear-rim Prism look is selected after actual browser comparison. The exact GLB and source-backed fallback are promoted, and final local native integration evidence is complete in [GLOSSY-REFINEMENT-AUDIT.md](GLOSSY-REFINEMENT-AUDIT.md). This guide belongs to the glossy refinement; [README.md](README.md) and the v002 evidence remain historical.

## Selected files and integrity

| Deliverable | Accepted path | SHA256 | Status |
| --- | --- | --- | --- |
| Editable Blender source | [source/sprout-clear-prism-rim-matched-v003.blend](source/sprout-clear-prism-rim-matched-v003.blend) | `7eedbf68bd66c8242ccb91815c547b1e5da8832208f076a6989a589e7bf00e20` | Selected model plus four fixed reflection cards; source preserved |
| Canonical GLB | [sprout-prism-v003.glb](sprout-prism-v003.glb) | `63bc8f0289634e03716732c6beefe2f3492d53d1f54ec04dd8e23d28fddf0a32` | 1,402,276 bytes; nine bones, paired morphs, six clips |
| Runtime GLB | [public/buddy/sprout-v003.glb](../../../public/buddy/sprout-v003.glb) | Same canonical SHA256 | Exact byte equality verified |
| Source-backed static PNG | [sprout-prism-v003.png](sprout-prism-v003.png) | `47a46dd7ea30020f3e8cc1850622f8b62277534e3ae522e961aea9e4affc0033` | 371,572 bytes, 640px RGBA; viewed, open eyes, unclipped |
| Runtime PNG | [public/buddy/sprout-v003.png](../../../public/buddy/sprout-v003.png) | Same canonical PNG SHA256 | Exact byte equality verified |
| Source/export manifest | [sprout-prism-v003.manifest.json](sprout-prism-v003.manifest.json) | Contains exact selected digests | Materials/extensions/core ownership, retained bytes, colour and lighting recipe |
| Actual served binary | [Compiled native production report](../../../artifacts/glossy-v003/sprout-native-prism-production/report.json) | Same canonical GLB SHA256 | Local response magic header, glTF2 version/length and exact hash verified; deployed URL is separate |

Protected v002 source SHA256: `d636554af1d2ae493a8414de322a0028779f1fd6d47baff2133be0546a12a2ae`. Protected canonical/runtime GLB SHA256: `34cd83c23c60afedbf6edd9e9e337af4715a6f60070fe59ca90b9a8b7a73d756`. Promotion must add versioned v003 files and update the app adapter deliberately, preserving the previous assets and rollback provenance.

## Candidate evolution and material intent

[GLOSSY-CANDIDATE-HANDOFF.md](GLOSSY-CANDIDATE-HANDOFF.md) records initial B (one volumetric body), C (clear cyan perimeter with inset blue core), and the refined C checkpoint with complete hashes and checks. Initial B/C remain available for comparison. They exposed two problems in actual browser images: a pale/matte single body and a hard muted oval core. Neither is accepted.

Refined C keeps the original Sprout outer topology/silhouette while giving the 610-vertex inset a gently unequal pear profile, brighter royal-blue centre, softer cyan edge vertex gradient, and low constant authored blue fill. Broad lavender/coral lower peripheral undertones replace a narrow painted stripe. The outer material exports real transmission, volume, thickness, IOR, and coating; opaque lids keep closed eyes readable. A separate owned lighting checkpoint mirrors the runtime's fixed tapered reflection-card study. It does not add cards to the exported model.

The selected clear-rim checkpoint narrows core X by 11% and uses one original 128×64 sRGB RGB PNG for base colour and emission 1.1. Its cobalt centre and cyan edge blend broadly into lavender on the lower left and peach on the lower right. Neutral tone mapping at exposure 1 preserves the blue better than the initial AgX study. The shell's central/lower colour is near-neutral so transmission does not filter warm red into green; cyan is restored only to the outer boundary, buds, and feet for readability against bright backgrounds. No geometry/core/light change accompanies that final shell correction. The actual browser decodes both material maps from the same embedded [Prism PNG](textures/sprout-core-prism-v003.png), SHA256 `4dbae7a23b6e0755c5eb5b131aca8dcc93d0705b44331a937c696c0a18a8ec33`, 10,247 bytes.

Shell transmission is 0.88, roughness 0.060, IOR 1.4, constant thickness 0.34, clearcoat 0.85/0.045, and attenuation distance 4.5 with modest cool attenuation. Core emission remains 1.1, roughness 0.15/coat 0.04. Opaque navy eyes, pale glints, blue lids, and the tiny smile retain their materials. Fixed white reflection cards supply real view-dependent highlights as the common mount turns; highlights are not painted into the texture or driven by a pointer-following light.

[22_clear_prism_material.py](22_clear_prism_material.py), invoked with `-- rim` on the frozen Prism source, exports the near-neutral/spatial-rim material and normalizes its container against the frozen Prism GLB. It retains all non-colour geometry/skin/morph accessor bytes, node/skin data, and six animation sample bytes exactly, avoiding saved-source Blender constrained-lid rest drift. The precise frozen input and normalization are in the manifest. [19_tapered_reflection_study.py](19_tapered_reflection_study.py) produces the selected editable lighting source, with its [recipe](proofs/clear-prism-rim-matched-v003.json); cards are excluded from `SPROUT_MODEL` and the exported GLB. Geometry-only Node texture placeholders explicitly omit material pixels; real browser decoding is a separate gate.

The user-supplied visual reference guides depth, cyan rims, blue interior, reflection hierarchy, and softly blended undertones. Its geometry and image pixels are not copied. The approximation preserves Sprout's existing identity, uses a stylized opaque inner form, constant thickness, raster transmission, and restrained inner fill. It is not simulated fluid/scattering or refraction of the OS desktop. The ordinary 96px pet is the primary target; 44px is the compatibility control, 160px the expanded study, and 320px the diagnostic view.

## Rig, animation, and ownership

The model retains `SPROUT_ROOT > REACTION_ROOT > RIG_Sprout/meshes`, glTF +Y up/+Z front, nine bones, `Jelly_Squash/Jelly_Sway_L/Jelly_Sway_R`, semantic gaze/eyes/lids, and `Sprout_Idle/Listen/Think/Speak/Click/Blink`. Both shell and `SPROUT_CORE` have complete paired morph vectors in each base clip. The inset is skinned to the existing BODY bone with the same morph key order. No extra mixer, rig controller, morph writer, or baked animation movie is introduced.

Authored phase/reaction clips, separate gaze, and pointer attention retain their documented owners. Pointer turn belongs to an unkeyed common outer mount. Any additive squash/BODY compression must use the existing mixer/property binding and remain coordinated for shell, core, face, and feet; source containment does not certify runtime property ownership. Every selected checkpoint needs its actual exported replay/containment/eye/frustum proof, including interruption and return to neutral. The source checks and their precise limits are linked in the handoff.

## Fallback reproduction

Run background Blender 5.2.2 LTS with `--factory-startup`, the selected saved source, and [20_render_selected_fallback.py](20_render_selected_fallback.py). Coordinate a quiet GPU slot; explicitly supply a new proof stem and `gpu` or `cpu`. The selected command is 640px/96 samples:

```powershell
& 'D:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --factory-startup --background 'D:/hackathon2026/insightos-ui/design/buddy/sprout/source/sprout-clear-prism-rim-matched-v003.blend' --threads 4 --python 'D:/hackathon2026/insightos-ui/design/buddy/sprout/20_render_selected_fallback.py' -- sprout-prism-v003-front gpu 640 96
```

The script refuses to overwrite existing outputs, renders neutral Idle with open eyes and zero attention, uses the saved hero camera/light/card recipe, preserves the source hash, and records PNG integrity, colour/exposure, camera, alpha, and unclipped bounds. It does not promote public files. The selected run used OptiX/96 samples; its [render manifest](proofs/sprout-prism-v003-front.render.json) records the source and output hashes. After viewing, the exact PNG was copied to canonical/runtime paths.

[23_verify_fallback.mjs](23_verify_fallback.mjs) loads that exact PNG in a GPU-disabled HTML fixture at44/96/160 CSS pixels on owned bright/dark/busy backgrounds. All nine actual image decodes and canonical/runtime byte equality pass; the [saved board](proofs/sprout-prism-v003-fallback-backgrounds.png) was visually reviewed. Face/eyes and the cyan appendage silhouette remain readable at96px; the44px control necessarily carries less material detail. This is a static fallback check. Cycles and Three use different lighting/rendering implementations, so the PNG is a faithful source-backed approximation rather than identical browser pixels.

## Integration evidence and limits

The selected [browser/background/attention matrix](../../../artifacts/sprout-glossy-final/report.json) and [actual exported controller/core containment](../../../artifacts/sprout-glossy-final/runtime-core-containment.json) pass with the exact selected hash. These establish local browser appearance, image decoding, and controlled motion/containment; they do not replace native timing/compositor evidence.

Root owns final default/public builds, served-file integrity, actual native transparency/compositor evidence, contextual panel verification, final performance/lifecycle traces, and acceptance audit. Their final scopes/results belong to the refinement audit; older opaque timings cannot certify transmission cost. No live-provider or physical microphone proof is implied by simulated fixtures. Chromium feedback timestamps and rAF/draw metrics retain their documented clock scopes; hardware scanout and causal two-presented-frame response require independent evidence.

The current v003 [native edge/panel recording](../../../artifacts/glossy-v003/sprout-native-prism-edge-panel/native-edge-panel.webm) and [synthetic voice/interruption recording](../../../artifacts/glossy-v003/buddy-voice-native-final/synthetic-voice-interrupt-panel.webm) were decoded with single-thread FFmpeg and six saved frames from each were visually inspected. [Edge contact sheet](proofs/v003-native-edge-video-contact.png): startup, compact pet, app preview, and open panel show the selected character and readable controls without visible clipping in reviewed frames. [Voice contact sheet](proofs/v003-native-voice-video-contact.png): the selected character, preserved draft, two turn/reply transcript states, and return to ready state are visible without composer/control clipping. These are video-only app captures with black transparency/gray padding; they do not record the private desktop. The voice runner uses an oscillator and local PCM fixtures, not a physical microphone or live provider, and its recording does not certify audible playback or frame performance. Exact native bounds, interruption, resource/lifecycle, and timing assertions remain in their linked reports and [the refinement audit](GLOSSY-REFINEMENT-AUDIT.md).

## Provenance and source licences

Sprout's mesh, rig, morphs, clips, gradients, new small colour/emission data texture, and reflection-card profile are project-authored. No purchased mesh, borrowed mascot, third-party texture/HDRI, motion-capture clip, or third-party animation asset is embedded in these candidates. The public repository has no top-level distribution licence in the inspected tree; this guide does not assign a new asset licence. The owner controls redistribution of the original project work.

The user-provided PDF remains a local visual reference with no asserted redistribution licence; it is not included as an asset. Three.js 0.186.1 is MIT (installed `node_modules/three/LICENSE`); glTF-Validator 2.0.0-dev.3.10 is Apache-2.0 (installed package manifest); the installed Khronos glTF-Blender-IO 5.2.40 exporter declares Apache-2.0 in its source header. These are tooling/code dependencies, not borrowed model content. The scripts use the installed export helper for valid volume metadata; they do not redistribute its implementation.
