# Sprout / Prism — implementation and retained studies

**Sprout v004: translucent Prism glass, centred voice controls, joyful jump, sleep/wake and a restrained Done nod.** The [current delivery guide](../sprout/DELIVERY-v004.md) records assets, usage and verification; the [implementation brief](GLASS-JOY-SLEEP-MASTER-PROMPT.md) and [worker assignments](GLASS-JOY-SLEEP-WORKER-PROMPTS.md) retain its design contract. The [v003 delivery](../sprout/DELIVERY-v003.md) and [refinement audit](../sprout/GLOSSY-REFINEMENT-AUDIT.md) preserve the preceding material and pointer-attention work.

The current application uses React 19, Vite 8, Electron 44 and direct Three.js. Its original Blender-authored character loads from GLB with nine deformation bones, three paired shell/core morphs and eleven authored clips. R3F/Next.js remain historical packaging ideas; this delivery runs in the existing application.

The v004 asset preserves the selected v003 material: a near-neutral transmitting shell, cyan boundary and appendages, and an inset blue/Prism core. Fixed curved reflections respond to body rotation. Preserved v003/v002 assets and Ribbon form the GLB fallback chain; source-backed idle and sleeping PNGs provide the graphics-loss path. Accessories remain outside the character's identity.

The panel has one identity/status row, one reading well, Ideas/Tools disclosures and voice beside the composer. Direct Stop, drafts, focus and native resizing retain their existing owners. Voice phases stay authoritative; the avatar consumes the existing numeric presentation samples. The [scene passport](../sprout/SCENE-PASSPORT.md) preserves the original construction history.

## Run and inspect

Double-click **Start InsightOS UI.cmd** at the repository root. Open [the local studio](http://127.0.0.1:5173/?studio=buddy) for actual Sprout sizes and simulated phase/reaction replay, or [the actual panel preview](http://127.0.0.1:5173/?studio=panel) for light/dark/busy backgrounds and Large text. Browser previews use local sample data and start no microphone/provider session.

Current evidence: [v004 manifest](../sprout/sprout-prism-v004.manifest.json), [asset handoff](../sprout/ASSET-HANDOFF-v004.md), [matched glass comparison](GLASS-PANEL-V005-STUDY.md) and [delivery checks](../sprout/DELIVERY-v004.md). The [v003 material comparison](../../../artifacts/sprout-glossy-final/report.json) remains separate historical evidence.

## Preserved v002 evidence

Current evidence includes the [canonical export manifest](../sprout/sprout-prism-v002.manifest.json), [actual six-clip interrupted replay](../../../artifacts/sprout-prism-final-motion-replay.json), [browser material and size comparisons](../../../artifacts/sprout-web-look/), [native panel verification](../../../artifacts/buddy-panel-native-verification.json) and [audio bridge verification](../../../artifacts/audio-presentation-verification.json). The [final native voice/panel recording](../../../artifacts/buddy-voice-native-final/synthetic-voice-interrupt-panel.webm) and [report](../../../artifacts/buddy-voice-native-final/report.json) show synthetic reply interruption and the original unsent draft surviving both voice turns and collapse/reopen. Synthetic PCM/oscillator fixtures exercise real audio mechanisms; the video is silent and live ElevenLabs remains unverified because local configuration reported false.

The [compiled native renderer proof](../../../artifacts/sprout-native-prism-production/report.json) passes for the final 96×96 asset on the tested RTX 5050, with renderer-interval p95 16.8 ms. The delivery guide records startup, resource values and independent rAF samples. This is native compiled-UI evidence, separate from production backend/provider acceptance and operating-system presented-frame verification. Clay measurements remain historical.

## Workflow and research history

These documents preserve the decisions, proposed budgets and implementation brief that led to this delivery. Read their historical status statements in that context; the current [Sprout README](../sprout/README.md) and passport take precedence for delivered inventory and evidence.

| Retained document                                                                  | Purpose                                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [PRODUCTION-WORKFLOW.md](PRODUCTION-WORKFLOW.md)                                   | Build order, actual application stack, milestones and review gates                             |
| [ANIMATION-WORKFLOW.md](ANIMATION-WORKFLOW.md)                                     | Fixed-topology rig/morph strategy, clip channels, export and interrupted replay                |
| [INTERACTION-MOTION-WORKFLOW.md](INTERACTION-MOTION-WORKFLOW.md)                   | Native bounds, focus, reversal and performance proof                                           |
| [REFERENCE-RECIPES.md](REFERENCE-RECIPES.md)                                       | Primary examples, pinned sources, licenses and bounded experiments                             |
| [MASTER-PROMPT.md](MASTER-PROMPT.md) and [launch prompt](SPROUT-LAUNCH-PROMPT.txt) | Revision 6 visual refinement contract; continue from delivered v002                             |
| [GLOSSY-SPROUT-PROMPT-PACK.md](GLOSSY-SPROUT-PROMPT-PACK.md)                     | Material, runtime motion, panel and independent verification assignments                        |
| [MASTER-PROMPT-v005.md](MASTER-PROMPT-v005.md)                                   | Preserved previous completion contract; outstanding external checks remain unverified            |
| [HIGGSFIELD-UPSTREAM.md](HIGGSFIELD-UPSTREAM.md)                                   | Upstream generation/blocking/export audit and connector observations                           |
| [STACK-AUDIO-AUDIT.md](STACK-AUDIO-AUDIT.md)                                       | Pre-implementation voice and renderer audit; the missing presentation meter is now implemented |
| [RESEARCH-LOG.md](RESEARCH-LOG.md)                                                 | Selection, portfolio process and refinement chronology                                         |

## Concept provenance

The built-in image-generation boards were art-direction references. They were not screenshots, generated production meshes or promises of identical final pixels. Exact submitted prompts remain with each study:

| Original study                                                         | Prompt and decision record                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| [Blue Ripple concept](../../../artifacts/ripple-aero-concept-v002.png) | [CONCEPT-PROMPT.md](CONCEPT-PROMPT.md)                |
| [Palette comparison](../../../artifacts/ripple-palette-study-v003.png) | [PALETTE-STUDY.md](PALETTE-STUDY.md) — Prism selected |
| [Creature comparison](../../../artifacts/prism-avatar-study-v004.png)  | [AVATAR-STUDY.md](AVATAR-STUDY.md) — Sprout selected  |

[BLENDER-V002-SPEC.md](BLENDER-V002-SPEC.md), [INTERFACE-SPEC.md](INTERFACE-SPEC.md), [RESEARCH-MOTION.md](RESEARCH-MOTION.md) and [PROMPT-PACK.md](PROMPT-PACK.md) retain earlier Ripple, accessory and layout studies. [Ribbon v001](../README.md#historical-ribbon-v001) remains an earlier delivered sculpture with separate source and audits.

All delivered Sprout geometry, vertex colors, rig and animation are original. No external character asset, private portfolio file, remote HDRI or paid Higgsfield job is included. Primary example code and license boundaries are recorded in the reference documents; referenced example characters and ElevenLabs Orb were not copied.

Work continues on **ui/presentation-polish** and the [existing draft PR](https://github.com/Wasseem10/insightos/pull/1). Use one live Blender editor. Presentation, original assets and the narrow read-only audio bridge belong to this UI work; backend planning, financial logic and provider/session ownership remain with their existing owners.
