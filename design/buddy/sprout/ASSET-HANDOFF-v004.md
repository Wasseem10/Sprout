# Sprout v004 — joy, reclined rest, wake and Done

Prepared 2026-10-11. The Blender/source/export work is complete; actual application integration and its browser/native acceptance are owned by the integration lead and runtime worker. No public asset, application file, live Blender scene, commit or deployment was changed by this asset worker.

## Frozen deliverables

| File | SHA256 | Scope |
| --- | --- | --- |
| [sprout-prism-v004.glb](sprout-prism-v004.glb) | `77d4b92bc5d06e440706243f6ac9e6745073ba6f98d173b972114fabb02bde7c` | 1,463,568 bytes; nine joints, paired three-value morphs, eleven clips |
| [Editable source](source/sprout-prism-behaviours-v004.blend) | `77df8aa69295604c48dec23a0bccb837e2cbdc012f5212c10b76cc37bbf38518` | Reopened and evaluated; rig, NLA actions and selected v003 materials/cards |
| [Idle PNG](sprout-prism-v004.png) | `35c5e60cb729bc8fa24e93b6ae9c02e39f734f5ee8817a79b5e9984142c913a1` | 302,929 bytes, 640px RGBA; open eyes |
| [Sleeping PNG](sprout-prism-sleep-v004.png) | `5057988aa1ff338d1661f8eea095cafa2f66653c08addc4933be63eac0e3e83d` | 246,617 bytes, 640px RGBA; actual recline/forward feet/closed creases |
| [Manifest](sprout-prism-v004.manifest.json) | Contains exact inputs/outputs/check digests | Channels, beats, source and full-mesh bounds, packaging diff and fallbacks |

The v003 geometry, materials, embedded Prism PNG, nodes, skins, morph targets and all six original animation streams remain exact. Only five Blender-authored animation streams are appended to the frozen binary. Original v002/v003 sources and runtime files are untouched.

## New animation contract

| Clip | Duration | Channels / owner | Behaviour |
| --- | --- | --- | --- |
| Sprout_JoyJump | 1.666667s | 29: nine bones TRS + complete paired shell/core weight vectors | Crouch, launch, buoyant apex, soft landing, small rebound, neutral settle; lids untouched |
| Sprout_SleepEnter | 1.666667s | 31: full-body group + both lid scales | Lower/recline, bring both feet forward, close lids; end matches resting loop |
| Sprout_SleepLoop | 5s | Same 31, including constant closed-lid channels | Quiet periodic breath; starts/ends at authored sleeping hold |
| Sprout_Wake | 1.25s | Same 31 | Resting hold to original neutral pose/open lids |
| Sprout_Done | 0.833333s | 2: REACTION_ROOT rotation + scale | Restrained nod, proud hold, settle; serialize with Click and retain base motion |

Joy/rest/wake contain no REACTION_ROOT, gaze, eye or glint channels. Done contains no bone/morph/lid channels. Runtime must suppress conflicting ordinary base/blink/click/attention writers during full-body behaviour and retarget interrupted visible mixtures; these are not source-only acceptance claims.

The selected sleep revision D uses BODY recline −0.91rad (52.1°), BODY local vertical scale 0.82, independent feet rotated forward, and FACE_MOUNT countertilt +0.55rad. The countertilt makes the original thin closed-eye creases face the viewer, covering the navy undersides that were visible in the initial steep pose. The [selected pose study](proofs/sprout-v004-sleep-face-D.png) and final sleeping PNG were visually reviewed. Initial candidate/source and corrected A/B/C/D/E/F studies remain historical. The first temporary-override study is explicitly invalid: render-time NLA reevaluation undid its pose overrides; it is excluded from acceptance.

## Bounds and checks

[Reopened-source audit](proofs/v004-reopened-source.json): all 11 mesh vertices at every authored 24 Hz frame, 255 samples. Union glTF bounds are approximately X[−1.148,1.148], Y[−1.1153,1.8283], Z[−1.262,0.8127]. The closed-lid head-emitter anchor is `[0,0.416484,0.083995]`, including a 0.05-unit head margin. This is a suggested posed anchor; the lead owns the complete Z path and native/canvas envelope.

Sampled core containment passes with minimum nearest-surface clearance 0.108342 model units. [Binary contract](proofs/v004-binary-contract.json) verifies exact original streams, complete new owners, finite/ordered samples, paired morph equality, neutral endpoints and rest/loop/wake joins. Maximum endpoint error is 1.1921e−7; the sleeping one-sided seam velocity difference is 2.862e−6. [Khronos validator](proofs/v004-gltf-validation.json) reports zero errors, two inherited non-root skin warnings and unused shell UV info. Actual skin replay and runtime mixed poses remain separate integration checks.

The new clips use the existing nine-bone topology and project-authored shape keys. Blender's keep-object-constant setting retains the sleeping lid hold, but also emits unkeyed object TRS. The packaging step explicitly lists and removes only generated constant RIG_Sprout TRS, lid translation/rotation, and Done translation after checking all samples are constant within 1e−6. No authored motion is filtered. [Full unfiltered source export](sprout-prism-behaviours-source-v004.glb) remains available; the manifest records its hash and every removed channel. Runtime performs no hidden stripping.

Source-backed PNGs use the selected fixed reflection cards, Khronos PBR Neutral, OptiX 64 samples, transparent film, orthographic span 3.44 and target Y 0.24. Their alpha bounds are unclipped. They approximate the same source/material family; Cycles and Three do not produce identical pixels. The CPU [real-size fallback board](proofs/v004-fallback-backgrounds.png) covers idle/rest at 44/56/72/96 px on three owned backgrounds; actual app fallback lifecycle is a lead-owned gate.

## Reproduction and provenance

Use background Blender 5.2.2 LTS with `--factory-startup` and the frozen matched v003 source for [25_author_behaviours_v004.py](25_author_behaviours_v004.py). It creates an owned v004 source/export/manifest, never public files or the live scene. Existing candidates are guarded; `--replace-owned-candidate` applies only to this explicitly hashed unpromoted output. Choose an unused version for later work.

Read-only/export checks: [27_verify_behaviour_binary.py](27_verify_behaviour_binary.py), [28_verify_reopened_behaviours.py](28_verify_reopened_behaviours.py), and the existing `scripts/validate-buddy-asset.mjs`. [26_render_behaviours_v004.py](26_render_behaviours_v004.py) accepts `sleep gpu 640 64` or `idle gpu 640 64` after `--` (separate arguments); existing images are protected. [29_finalize_behaviour_handoff.py](29_finalize_behaviour_handoff.py) records owned PNG/check provenance, and [30_static_fallback_board.mjs](30_static_fallback_board.mjs) decodes/composites the actual PNGs on CPU. Serialize GPU/native runs.

The new animations are original project work: no borrowed character, paid generation, motion-capture asset or third-party animation is embedded. Existing Three MIT, Khronos exporter/validator Apache 2.0 tooling provenance remains as recorded in [v003 delivery](DELIVERY-v003.md). The repository owner controls distribution of project-authored assets; this handoff assigns no new licence.
