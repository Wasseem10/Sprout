# Sprout / Prism — implementation and retained studies

**Sprout v002 and the Prism palette are implemented.** The current application uses React 19, Vite 8, Electron 44 and direct Three.js. Its original Blender-authored character is loaded from the exported GLB with nine deformation bones, three body morphs and six authored clips. R3F/Next.js appear in the retained packaging plan; this delivery runs in the existing application.

The selected appearance is glossy electric blue/aqua jelly with a restrained lower violet/coral streak, unequal buds, navy eyes, white glints and a small smile. The clay four-clip proof preceded the two additional voice-phase loops and material/light refinement. The transmission candidate remains a comparison asset; the canonical export uses the refined glossy material. Accessories remain outside the character's identity.

The native compact/expanded panel, reversible resize/focus coordination, readable transcript and semantic controls are implemented. Voice phases stay authoritative. The avatar consumes fresh numeric input/output presentation samples without controlling provider sessions, VAD or playback. See the [delivery guide](../sprout/README.md) and [scene passport](../sprout/SCENE-PASSPORT.md) for current assets, run instructions and measured evidence.

## Run and inspect

Double-click **Start InsightOS UI.cmd** at the repository root. Open [the local studio](http://127.0.0.1:5173/?studio=buddy) for actual Sprout size comparisons and simulated phase/reaction replay. The studio starts no microphone or provider session.

Current evidence includes the [canonical export manifest](../sprout/sprout-prism-v002.manifest.json), [actual six-clip interrupted replay](../../../artifacts/sprout-prism-final-motion-replay.json), [browser material and size comparisons](../../../artifacts/sprout-web-look/), [native panel verification](../../../artifacts/buddy-panel-native-verification.json) and [audio bridge verification](../../../artifacts/audio-presentation-verification.json). Synthetic PCM/oscillator fixtures exercised real audio mechanisms and interruption in Electron; live ElevenLabs output remains unverified because local voice configuration reported false.

The [compiled native renderer proof](../../../artifacts/sprout-native-prism-production/report.json) passes for the final 96×96 asset on the tested RTX 5050, with renderer-interval p95 16.8 ms. The delivery guide records startup, resource values and independent rAF samples. This is native compiled-UI evidence, separate from production backend/provider acceptance and operating-system presented-frame verification. Clay measurements remain historical.

## Workflow and research history

These documents preserve the decisions, proposed budgets and implementation brief that led to this delivery. Read their historical status statements in that context; the current [Sprout README](../sprout/README.md) and passport take precedence for delivered inventory and evidence.

| Retained document                                                                  | Purpose                                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [PRODUCTION-WORKFLOW.md](PRODUCTION-WORKFLOW.md)                                   | Build order, actual application stack, milestones and review gates                             |
| [ANIMATION-WORKFLOW.md](ANIMATION-WORKFLOW.md)                                     | Fixed-topology rig/morph strategy, clip channels, export and interrupted replay                |
| [INTERACTION-MOTION-WORKFLOW.md](INTERACTION-MOTION-WORKFLOW.md)                   | Native bounds, focus, reversal and performance proof                                           |
| [REFERENCE-RECIPES.md](REFERENCE-RECIPES.md)                                       | Primary examples, pinned sources, licenses and bounded experiments                             |
| [MASTER-PROMPT.md](MASTER-PROMPT.md) and [launch prompt](SPROUT-LAUNCH-PROMPT.txt) | Revision 4 implementation/completion contract                                                  |
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
