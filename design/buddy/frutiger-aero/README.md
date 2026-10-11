# Ripple — character and interface plan

Updated **2026-10-10**. This is the proposed next visual direction for InsightOS. The running application still uses Ribbon v001; this packet does not implement Ripple or change voice, financial, or backend behavior.

## The direction

**Ripple is a cute ocean-blue jelly drop with two expressive navy eyes, small white glints, and a tiny optional smile.** A continuous polished steel ribbon curls behind and beneath it as a sculptural cradle. The character faces the user; the metal leaves a clear band around its eyes. The body is softly gooey, while the cradle remains rigid and substantial.

Its personality comes from restrained movement: an occasional blink, a small gaze shift toward the pointer, a brief squash when activated, an attentive listening tilt, and a gentle speaking pulse. This is an original character, with InsightOS remaining the product name. Ripple is a working name for the character.

The interface carries the same ocean blue and cyan, with small lime and coral accents. Glass is strongest around the frame and controls. Conversation text has a stable, nearly opaque reading surface. Space, aligned typography, and one clear next action create the quality; extra glowing cards do not.

This is a contemporary Frutiger Aero interpretation: watery color, optimistic light, rounded tactile forms, and restrained glass. It should remain useful over a real desktop and at enlarged text sizes. Bills are one possible content stress test; the visual system must also work for ordinary conversation and other tools.

## Why this can be built faithfully

The main forms are editable meshes: one jelly body, two eyes and glints, an optional mouth, and a steel cradle. Broad squash morphs and an independent face mount can preserve identity. These are controllable in the existing Blender → GLB → Three.js → React/Electron pipeline. Dynamic metaballs, multi-pass refraction, and liquid simulations are optional experiments, not dependencies for the character.

The same exported geometry can appear in Blender and React. Offline and WebGL transmission differ; a generated image or Cycles render cannot promise identical browser pixels. The quality target is a matched silhouette, face, color, and reflection structure, verified in the actual app.

The [original concept board](../../../artifacts/ripple-aero-concept-v002.png) shows the proposed character and material direction. Its [exact generation prompt and output critique](CONCEPT-PROMPT.md) are preserved. The board is a concept image; use the interface specification for actual portrait layout and contrast.

## Read this packet

| File                                         | Purpose                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| [MASTER-PROMPT.md](MASTER-PROMPT.md)         | Copyable brief for the next implementation pass                                        |
| [PROMPT-PACK.md](PROMPT-PACK.md)             | Focused prompts for concept, geometry, lighting, motion, interface, and critique       |
| [CONCEPT-PROMPT.md](CONCEPT-PROMPT.md)       | Exact image-generation prompt, saved concept board and concrete critique               |
| [BLENDER-V002-SPEC.md](BLENDER-V002-SPEC.md) | Measured v001 baseline, proposed topology/materials/face, morph export and asset gates |
| [INTERFACE-SPEC.md](INTERFACE-SPEC.md)       | Proposed layout, spacing, colors, glass, native bounds and accessibility               |
| [RESEARCH-MOTION.md](RESEARCH-MOTION.md)     | Six primary code references, licenses and mechanisms to adapt                          |
| [RESEARCH-LOG.md](RESEARCH-LOG.md)           | Decisions, portfolio workflow lessons, research ledger and refinement record           |

## Build in reviewable passes

The [Ocean / Prism / Lagoon palette study](PALETTE-STUDY.md) records the user's **Prism** selection. Character silhouette, interchangeable accessories and final layout remain open; the current master prompt is an earlier draft awaiting consolidation.

The [avatar exploration](AVATAR-STUDY.md) compares Ripple, Sprout and Drift independently of their supports. The steel cradle is optional; glass and free-floating variants are also under consideration.

1. **Character silhouette.** Preserve v001. Make v002 clay views with the eyes and cradle before adding glass. Compare the actual collapsed icon at 40–44 px, a proposed larger pet near 96 px, and an expanded/preview character near 160 px. Decide from visible results which details survive.
2. **Geometry refinement.** Compare the current ribbon against a rounded edge profile and selectively higher longitudinal sampling. Render with the same camera and lights. Keep the lowest density that removes a visible defect. Finalize the body topology before authoring shape keys.
3. **Material and lighting study.** Capture three matched light rigs—balanced, soft studio, and stronger rim—with fixed camera, exposure, and pose. Choose the rig that separates blue jelly from steel without losing the eyes. Export supported PBR materials; keep any offline-only treatment documented.
4. **Character behavior.** Add blink, gaze, click squash, and phase transitions. Keep the steel rocking near ±8° as an initial proposal; replace v001's full spin if it would obscure the face. Give each transform or morph channel one owner. Test interrupted transitions.
5. **Actual React slice.** Mount the new GLB and original transparent fallback in the existing renderer. Match lighting and evaluate the real pixels before changing the rest of the UI. Retain lazy loading, visibility pause, reduced motion, and WebGL recovery.
6. **Expandable interface.** Build the compact conversation panel with one header, one conversation region, and a fixed composer. Show details only when needed. Reconcile the proposed pet size with current native window bounds; preserve dragging, focus, expand/collapse, shortcut, draft state, and existing security settings.
7. **Review on desktop.** Capture bright, dark, and busy backgrounds; keyboard flow; 200% text/zoom; long messages; collapsed and expanded states; no GPU; reduced motion; and rapid voice interruptions. Then update the prompt and research ledger with the observed defect and evidence.

Each pass must produce inspectable output, not merely a more ambitious adjective in the prompt. One agent owns the live Blender scene; other agents can research or critique images. Keep geometry, lighting, and interface passes separate enough to explain which change improved the result.

## Collaboration boundaries

Continue on the isolated UI branch `ui/presentation-polish` and the existing draft pull request. The cousin can continue backend work on their own branch. Frontend presentation changes and original assets belong here; API schemas, financial planning, OCR, database verification, provider sessions, and interruption behavior remain under their existing ownership.

A later audio-level adapter may reuse numeric data from the already-owned voice pipeline. The current visual pulse is phase-driven. The inspected voice hook uses Scribe and its own recorder/playback path, with an internal microphone analyser for automatic recording; it does not expose conversation volume getters to the buddy. Do not create a second microphone session or change recording thresholds for an animation. Start with honest phase-based motion and isolate any measured-level addition for coordination.

The existing application can still be opened locally with `Start InsightOS UI.cmd` at the repository root. `http://127.0.0.1:5173/?studio=buddy` shows the implemented v001 studio, not this proposed v002 character.

## Definition of ready

The eyes remain visible in every state; the steel looks rounded rather than foil-like; the jelly silhouette is stable and cute at actual scale; the browser reproduces the intended material separation; activation performs the real open action; readable HTML explains status; glass never compromises essential text; and CPU/GPU work stops appropriately when hidden or motion is disabled. New performance values are measured on the target machine rather than promised from the concept board.
