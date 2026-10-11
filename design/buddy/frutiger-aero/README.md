# Sprout / Prism — character, interface and production plan

Updated **2026-10-10**. **Sprout is the selected character; Prism is the selected palette.** Final compact/expanded layout remains open. The running application still uses Ribbon v001; this packet plans the next visual pass without changing voice, financial or backend behavior.

Sprout is an original compact jelly creature with two short unequal rounded buds, stubby base feet, large navy eyes and small white glints. Prism keeps its frontal face blue/aqua, with a restrained violet-to-coral side/lower streak. Supports are interchangeable and outside the first animation proof.

Its personality comes from a clear face and restrained motion: blink, local gaze, press squash, attentive listening and smooth phase transitions. The conversation panel has a luminous glass frame and a stable nearly opaque reading surface. Essential text remains readable; animation never delays voice interruption, Stop or access to content.

## Start here

Read [PRODUCTION-WORKFLOW.md](PRODUCTION-WORKFLOW.md) for the build order, actual app stack, examples, outputs and review gates.

The [full copyable implementation prompt](MASTER-PROMPT.md) consolidates the selected direction. [HIGGSFIELD-UPSTREAM.md](HIGGSFIELD-UPSTREAM.md) audits the additional generation/blocking/animation/export workflow point by point and records current connector capabilities.

The browser direction is Blender → GLB → R3F/Three → Next.js → Vercel. The inspected app currently uses React/Vite/Electron/direct Three. First prove the actual Sprout export in that working renderer, then package the shared R3F avatar for the desktop host and an optional Next.js browser host.

| Current specification                                            | Purpose                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [PRODUCTION-WORKFLOW.md](PRODUCTION-WORKFLOW.md)                 | Overall runbook and first implementation milestone                             |
| [ANIMATION-WORKFLOW.md](ANIMATION-WORKFLOW.md)                   | Canonical Sprout rig, morphs, clips, export settings, interruptions and replay |
| [INTERACTION-MOTION-WORKFLOW.md](INTERACTION-MOTION-WORKFLOW.md) | Panel coordination, native bounds, focus, reversal and performance proof       |
| [REFERENCE-RECIPES.md](REFERENCE-RECIPES.md)                     | Primary examples, pinned sources, licenses and bounded experiments             |
| [AVATAR-STUDY.md](AVATAR-STUDY.md)                               | Creature comparison and selected Sprout silhouette intent                      |
| [PALETTE-STUDY.md](PALETTE-STUDY.md)                             | Selected Prism palette and original comparison                                 |
| [RESEARCH-LOG.md](RESEARCH-LOG.md)                               | Decisions, portfolio process and refinement evidence                           |

## Earlier studies retained as provenance

[CONCEPT-PROMPT.md](CONCEPT-PROMPT.md) preserves the original blue Ripple concept. [BLENDER-V002-SPEC.md](BLENDER-V002-SPEC.md), [INTERFACE-SPEC.md](INTERFACE-SPEC.md) and [RESEARCH-MOTION.md](RESEARCH-MOTION.md) retain the measured Ribbon baseline and earlier Ripple/layout research. Their general geometry, lighting and readable-interface lessons remain useful; the current Sprout workflow takes precedence for rig and clip decisions.

The [complete implementation prompt](MASTER-PROMPT.md) now consolidates Sprout, Prism, the upstream Higgsfield audit and a compact portrait starting layout. The layout is reviewed during the actual prototype. [PROMPT-PACK.md](PROMPT-PACK.md) preserves the earlier Ripple prompts as historical provenance.

Concept images are references, not application screenshots or completed 3D assets: [blue concept](../../../artifacts/ripple-aero-concept-v002.png), [palette board](../../../artifacts/ripple-palette-study-v003.png), [creature board](../../../artifacts/prism-avatar-study-v004.png).

## First milestone and collaboration

Build one clay Sprout and four clips—Idle, Listen, Click, Blink—then prove the exported GLB at actual sizes with interrupted transitions. Add Prism materials and panel choreography after those results. Each pass produces editable source, inspectable exports and a recording rather than relying on a generated image to establish quality.

Continue on the isolated UI branch **ui/presentation-polish** and [existing draft PR](https://github.com/Wasseem10/insightos/pull/1). One owner edits the live Blender scene. Presentation and original assets belong here; backend planning, API/provider sessions, financial logic and interruption behavior remain with their existing owners.

The application can still be opened with **Start InsightOS UI.cmd** at the repository root. The local visual studio at **http://127.0.0.1:5173/?studio=buddy** shows implemented Ribbon v001 with simulated states. Sprout, the new motion controller and the proposed native layout are not implemented yet.
