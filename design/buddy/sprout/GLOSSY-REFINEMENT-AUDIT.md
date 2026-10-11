# Glossy Sprout refinement — implementation and verification

Implemented and locally verified 2026-10-10–11 from `02658748134e86b7de3c27356dc03242130fec50` on `ui/presentation-polish`, under the [revision-6 contract](../frutiger-aero/MASTER-PROMPT.md). The earlier [v002 audit](ACCEPTANCE-AUDIT.md) retains its original outcomes and external evidence gaps. The visual/UI refinement gates below pass; the final section distinguishes external acceptance that this task does not certify.

## Delivered change

Sprout now has a transmitting clear shell, cyan silhouette/buds/feet, bright blue interior and broad lavender/peach undertones. Neutral shell colour in the central transmission path prevents cyan vertex colour from filtering out the coral. The inset core is paired with the shell's skin and morph channels. Fixed curved reflection cards and Neutral tone mapping supply the selected look. This is stylized glass/jelly, not a physical fluid or optical refraction of other desktop applications.

The whole character turns toward an avatar-centred pointer, with eyes leading and a small delayed body compression/settle. The unkeyed attention mount owns ±10° yaw/±6° pitch; the existing mixer owns additive deformation and compensates face scale. No second voice, animation or per-frame React owner was added.

The actual DesktopBuddy panel now uses one continuous glass frame and opaque reading surface. Redundant title/welcome text is removed; Ideas and Tools retain their original actions in keyboard-accessible disclosures. Voice is beside the composer and Stop stays directly available. The studio expands the real panel and the separate `?studio=panel` route exposes it with labelled local sample data.

## Asset and source integrity

- Selected canonical/runtime GLB: **1,402,276 bytes**, SHA256 `63bc8f0289634e03716732c6beefe2f3492d53d1f54ec04dd8e23d28fddf0a32`.
- Canonical/runtime 640px RGBA PNG: **371,572 bytes**, SHA256 `47a46dd7ea30020f3e8cc1850622f8b62277534e3ae522e961aea9e4affc0033`.
- Editable matched-lighting source: `source/sprout-clear-prism-rim-matched-v003.blend`, SHA256 `7eedbf68bd66c8242ccb91815c547b1e5da8832208f076a6989a589e7bf00e20`.
- Nine bones, three paired morphs, six clips, 11 meshes, 10,967 exported vertices and 21,600 triangles. Validator: zero errors; two non-root skin warnings are separately checked with actual evaluated geometry.
- Original v002 GLBs and Blender master hashes rechecked unchanged. New versioned candidates, reconstruction scripts and manifests preserve the material studies.
- [Delivery/source guide](DELIVERY-v003.md), [selected manifest](sprout-prism-v003.manifest.json), [candidate history](GLOSSY-CANDIDATE-HANDOFF.md) and [pinned MIT glass source studies](../frutiger-aero/PANEL-GLASS-SOURCE-STUDY.md).

## Verification

All paths below are relative to the repository root.

| Gate | Result and evidence |
| --- | --- |
| Actual exported materials and appearance | Passed A/B/C at 44/96/160/320 CSSpx, selected light/dark/pattern backgrounds, real embedded 128×64 sRGB image decoding. `artifacts/sprout-glossy-final/report.json`, `matched-A-B-C.png`, `selected-controlled-backgrounds.png`. Root and material/runtime owners inspected the saved boards. |
| Source-backed PNG | Matched-source Neutral/Cycles render inspected. Nine actual PNG decodes at 44/96/160px over three backgrounds pass; source/canonical/public integrity is in the manifest. |
| Core/face geometry | 48 exported skinned/morphed state samples pass. Minimum core clearance 0.117524 model units; maximum eye-scale error 0.0719%. `artifacts/sprout-glossy-final/runtime-core-containment.json`. This is sampled containment, not continuous collision certification. |
| Six-clip replay | Selected GLB passes deterministic 30/60/120Hz replay: maximum matrix difference 8.52e-14; projected eye difference 1.30e-13px. `artifacts/glossy-v003/sprout-motion-replay.json`. CPU texture placeholders are explicitly excluded from material validation. |
| Attention and soft motion | Real pointer signs, avatar-centre neutrality, reverse/leave, simulated blur, overlapping clips, unchanged hit box and pixel-stable Pause pass. `artifacts/sprout-glossy-final/report.json`, `attention-angle-and-settle.png`, silent `attention-and-settle.webm`. |
| Native panel | Actual Electron main/preload, bounds acknowledgement, rapid reversal, draft, selection 5..17, manual scroll, modal/workspace focus and return pass. `artifacts/glossy-v003/buddy-panel-native-verification.json`. Root inspected the controlled busy-background and 200% zoom captures. |
| Accessibility | Six recorded normal-colour 392px/320px bright/dark/busy cases pass; minimum sustained-reading contrast 7.0807:1. Main prose remains 18px/22px Large; existing compact energy prose is separately recorded. Direct 44px Stop remains reachable with Tools open. `artifacts/glossy-v003/buddy-accessibility-audit.json`. Forced colours use separate system-palette/style/AX/screenshot evidence, not the normal paired-PNG ratio. |
| Browser regressions | Eight focused panel cases passed across initial/targeted runs. Final selected-asset studio and actual panel preview: 5/5, including phase/pause, local draft/focus, reduced motion, exact v003 PNG fallback and real WebGL loss/recovery. |
| Unit/build | 47 focused motion/coordinator/audio-presentation/native-visibility tests pass. Fresh default build and isolated public build pass. Existing lazy Three and connection chunks still emit the size advisory; no new runtime dependency or backend change. |
| Voice preservation | Actual MediaRecorder/HTMLAudio/Web Audio mechanisms pass local oscillator/PCM fixtures: interruption, fresh output, unsent draft preservation and explicit Pause cleanup. Native hide/show keeps the same capture track/recorder and advances playback 0.673658s while hidden. `artifacts/glossy-v003/buddy-voice-native-final/report.json` and `buddy-voice-native-visibility/report.json`. |
| Native recording | Compiled selected asset, screen-edge open/close, retained draft/focus and reduced-motion reopening pass. `artifacts/glossy-v003/sprout-native-prism-edge-panel/report.json` and `native-edge-panel.webm`. Recording is separate from performance acceptance. |

## Native performance and lifecycle

On the recorded Windows/RTX 5050 host, the compiled 96px avatar's 18.3-second six-clip replay records renderer interval p95 **16.8ms**, maximum **17.6ms**, zero renderer intervals above 18ms, and p95 render call **1.20ms**. Independent document rAF samples include one 20.2ms interval; clocks are not conflated. The fresh-process cold test blocked all initial GLBs before GPU allocation, showed PNG fallback, then measured first model render **2013.6ms**. See `artifacts/glossy-v003/sprout-native-prism-production/report.json` and `sprout-native-prism-cold-load/report.json`.

A separate compiled native panel interaction ran **6010.8ms** through five cycles and a rapid reversal. Chromium presentation-feedback samples: **359 events**, p95 **16.756ms**, maximum **16.873ms**, none above 20/50ms. Avatar/document callback intervals p95 16.8ms, maximum 16.9ms; avatar callback CPU p95 1.60ms. See `artifacts/glossy-v003/buddy-runtime-native/report.json` and its CSV samples. These are Chromium feedback timestamps, not certified hardware scanout.

Visible model cost: **21 draws, 11 geometries, 7 textures**. CPU geometry attributes total 1,289,060 bytes; the PMREM colour-target estimate is 1,572,864 bytes. Neither number is total VRAM. Five native panel cycles retain stable resource counts. Hide/minimize/offscreen suspension, restore and disposal pass.

The initial cleanup assertion expected the old opaque asset's single cached LUT entry; the transmitting material adds an internal target. The unchanged compiled renderer/asset passed a separate lifecycle followup after precise classification: four 1×1 fallback textures, a 16×16 DFG LUT, one 96×96 RGBA16F transmission target, five FBOs and three RBOs remain unmatched by explicit deletion in pinned Three 0.186.1. Forced context loss makes those handles unusable. Exact signatures and installed source hashes are asserted, all five owned texture handles including the 128×64 colour map are explicitly deleted, and no geometry/buffer/program/shader/VAO remains. The report retains the original timed five-cycle evidence and labels the followup separately. This is not a physical VRAM or garbage-collection measurement.

## Reproduction and handoff

Run `npm run build`, then the versioned proof commands. Their defaults use v003 and write under `artifacts/glossy-v003`, preserving prior evidence:

```text
npx tsx scripts/verify-sprout-motion.ts
node scripts/verify-sprout-native.mjs --production-bundle
node scripts/verify-sprout-native.mjs --cold-load
node scripts/verify-buddy-runtime.mjs
node scripts/smoke-buddy-panel.mjs --controlled-backgrounds --zoom-review
node scripts/smoke-buddy-voice.mjs --record
node scripts/smoke-buddy-voice.mjs --native-visibility
node scripts/verify-sprout-native.mjs --edge-panel-record
node scripts/audit-buddy-accessibility.mjs
```

Run GPU/native proofs serially. `Start InsightOS UI.cmd` verifies the served v003 hash before opening the native app. Browser studio: `http://127.0.0.1:5173/?studio=buddy`; panel preview: `http://127.0.0.1:5173/?studio=panel`. Both browser previews use local sample data. Existing UI/API listeners were reused without restarting the user's processes.

UI changes remain on `ui/presentation-polish` for the existing draft PR #1. Upstream `master` remains `f1423fd`; server/shared/Electron implementation and dependency manifests have no change in this refinement. No merge, production deployment or message to the cousin is part of this delivery.

Live ElevenLabs credentials, physical microphone/speaker rehearsal, human assistive-technology sessions, other physical displays, packaged installation and strict event-to-two-physically-presented-frame certification retain the earlier audit's unverified status. They are external acceptance, not implied by local fixtures or rendering clocks.
