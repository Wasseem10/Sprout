# Sprout v005 — actual happy eye closure

The existing navy eyes now deform into rounded upward arches, with the middle higher than the outer corners. There is no added blue lid or separate closed-eye overlay. The glass body, paired core, rig and non-eye motion remain the frozen v004 design. Root accepted the actual intermediate, three-quarter and reclined source views before local asset promotion.

## Selected files and integrity

| Item | Path | SHA256 |
| --- | --- | --- |
| Editable source | [sprout-happy-eyes-v005.blend](source/sprout-happy-eyes-v005.blend) | `e97a0df2bafbffda9da972c538dbde60c54bc2d71efe264c163c8913c746a113` |
| Full source export | [sprout-happy-eyes-source-v005.glb](sprout-happy-eyes-source-v005.glb) | `54458172f8fbf32facd76abfbcff38d4e48ba05644fba554dd02329bb3807e1a` |
| Canonical and runtime GLB | [sprout-prism-v005.glb](sprout-prism-v005.glb), [runtime](../../../public/buddy/sprout-v005.glb) | `5090645ccbc11f1f577ca22373234a2f3f1d4409ba30876fdecc3af5041faeb2` |
| Idle RGBA fallback | [sprout-prism-v005.png](sprout-prism-v005.png), [runtime](../../../public/buddy/sprout-v005.png) | `1142a9ef44f70e13813e0ee542672852a7c2b5bbf5e87f89eb9c747159af6277` |
| Sleeping RGBA fallback | [sprout-prism-sleep-v005.png](sprout-prism-sleep-v005.png), [runtime](../../../public/buddy/sprout-v005-sleep.png) | `e5666517a4556ed7939e042ff10464d751954f4053a4e499c262388ada488887` |

The GLB is 1,445,476 bytes. Both PNGs are 640×640 with alpha; their sizes are 302,888 and 240,987 bytes. [The manifest](sprout-prism-v005.manifest.json) records the settings, individual contracts, baseline hashes, source closure samples and proof paths. v004 source and assets remain intact.

## Explicit eye ownership

`EYE_L` and `EYE_R` retain their original hierarchy, open basis, material and indices. Each now has exactly one exported morph, `CloseHappy` at index 0. The deformation compresses the actual eye volume and bends its top into a smooth arch, retaining positive depth and vertical dimensions throughout the transition. `GLINT_L` and `GLINT_R` retain their names and parentage, but scale smoothly from `[1,1,1]` to `[.001,.001,.001]`, disappearing visually by 75% closure without a singular scale matrix.

The obsolete rendered `LID_L/R` and `CLOSED_EYE_L/R` objects, nodes, meshes and unused cover material are removed. A surviving unused Blender datablock is not rendered or exported.

| Clip | Duration | Face bindings |
| --- | --- | --- |
| Sprout_Blink | 0.16666667 s | Both eye weight vectors and both glint scales; five closure samples, 0→1→0 |
| Sprout_SleepEnter | 1.66666667 s | Same four bindings plus unchanged complete full-body/core motion; 0→1 |
| Sprout_SleepLoop | 5 s | Same four bindings and unchanged full-body/core motion; held 1 and collapsed glints |
| Sprout_Wake | 1.25 s | Same four bindings plus unchanged full-body/core motion; 1→0 |

All eleven logical clip names and durations remain. Seven clips retain all original animation accessor bytes. The four face-related clips intentionally replace old lid channels with four eye/glint channels; all their non-eye samples remain exact. Blink has 4 channels; each sleep-family clip has 33. No eye channel is added to JoyJump, Done or the base phase clips. The runtime profile must validate these actual meshes/bindings, serialize blink/sleep ownership in one mixer, and derive the sleeping anchor from evaluated eyes rather than deleted lids. Legacy v004 remains a separate legitimate profile.

## Source/export repair and reproduction

[31_author_happy_eyes_v005.py](31_author_happy_eyes_v005.py) authors the morph and four source Key/glint actions in an isolated background copy of v004, saves the editable source, then reopens it. Blender 5.2.2's exporter initially sampled the newly added Key NLA tracks as constants. The supported exporter track-switch extension hook now evaluates the identical authored Key action and slot directly while preserving the NLA clip name, restores NLA afterward, and checks every exported closure sample before packaging. The script does not patch the installed exporter, reconstruct eye weights in application code, or change the source curves to hide the defect.

The final package preserves frozen v004 binary streams outside the explicit eye change, removes unreachable cover data and appends the source-exported eye morph/animation streams. [32_verify_happy_eyes_v005.mjs](32_verify_happy_eyes_v005.mjs) compares actual values and bytes against v004, not merely clip names. The authoring script refuses to overwrite a selected asset; reproduce in an isolated copy with unused candidate output paths.

For read-only verification of the delivered files:

```powershell
node design/buddy/sprout/32_verify_happy_eyes_v005.mjs
node scripts/validate-buddy-asset.mjs design/buddy/sprout/sprout-prism-v005.glb .local/v005-validator-review.json
```

[33_render_happy_eyes_v005.py](33_render_happy_eyes_v005.py) loads the saved source, samples the actual Key actions, and produces study/fallback views without saving its scene. It uses the original light/material setup, Khronos PBR Neutral view, a 3.44-unit orthographic span and target Blender Z .24. Reflection cards are hidden only from camera rays for the three-quarter proof. [34_happy_eye_contact_sheets.mjs](34_happy_eye_contact_sheets.mjs) assembles the source views without changing them. These are project-authored geometry and motion; no purchased, generated or downloaded character/animation asset and no new third-party asset license were introduced.

## Evidence and scope

- [Frozen-data audit](proofs/v005-frozen-data-audit.json): retained basis/indices/materials/texture/skin/body/core morph bytes, all clip durations and non-eye animation streams are exact.
- [Reopened source audit](proofs/v005-eyes-audit.json): all authored eye action samples match their intended closure values, including blink peak and sleep/wake endpoints.
- [Khronos validator](proofs/v005-gltf-validation.json): zero errors, two existing skinned-child warnings and one unused UV information item. Existing paired deformation/skin controller proof is handled separately by the runtime owner.
- [Source contact sheet](proofs/v005-eye-morph-source-contact-sheet.png): 0/25/50/75/100% closure, three-quarter intermediate/closed and reclined sleeping views.
- [44/72/96 source comparison](proofs/v005-eye-tiny-source-comparison.png): white/dark reductions of those source PNGs. These reductions support readability review and do not substitute for actual browser/native-size rendering.
- [Fallback render record](proofs/v005-eyes-fallback.json): exact source-backed idle and sleeping PNGs with alpha bounds and hash integrity.

The live unsaved Blender scene and filepath were preserved; all authoring and rendering used separate background processes. Integration and verification of runtime ownership, context-loss/reduced-motion fallback, actual 44/72/96 WebGL views, panel glass, whole-app branding, native performance and voice are owned by the parent task separately. This asset guide does not claim those wider gates or real provider output.
