# Research and decision ledger

Started **2026-10-10**. Claims below distinguish inspected implementation, researched mechanisms, and proposed design. No v002 runtime or Blender implementation has been performed in this planning pass.

## Decisions for revision 1

| Decision                                   | Reason                                                                                                | Status                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Original jelly drop with visible eyes      | User clarified that buddy means a cute character; simple editable forms support faithful reproduction | Proposed Ripple identity                                       |
| Steel ribbon becomes an open cradle        | Preserve the earlier sculpture's strongest material while leaving the face readable                   | Proposed shape and motion change                               |
| Authored fixed-topology deformation first  | Stable eyes and predictable GLB transfer are more valuable than continuously changing blob topology   | Recommended production route                                   |
| Restrained cradle rocking near ±8°         | v001's full spin could pass across the new eyes                                                       | Starting art direction, to audit                               |
| Glass frame plus protected reading surface | Color and glass can coexist with low-vision readability                                               | Proposed interface, contrast tests required                    |
| Phase animation before measured amplitude  | Current buddy has real phase input but no exposed level adapter                                       | Inspected baseline; live level integration remains future work |
| Density chosen through matched renders     | More polygons cannot repair poor normals, edge shape or lighting                                      | Geometry study required                                        |
| General assistant shell                    | Finance may change; the user asks for visuals and presentation                                        | Content-neutral direction                                      |

## Portfolio process carried forward

The local portfolio Blender prompt and web workflow were inspected. Their reusable lesson is a production method, not copied artwork or private context:

1. Inspect actual geometry and hierarchies before trusting reference images.
2. Establish semantic parts, pivots, camera framing and clay silhouette before material polish.
3. Preserve source work and use reversible, versioned assets.
4. Compare balanced/studio/rim lighting with identical camera and exposure.
5. Export the real mesh; inspect browser lighting and material behavior independently.
6. Critique final-size screenshots and test interactive interruptions and fallback behavior.
7. Keep image-generation/Higgsfield references upstream. They can suggest reflections and atmosphere, but generated detail is not proof of a manufactured or implemented asset.

This packet is self-contained; private portfolio documents and assets have not been copied into the repository.

## Primary reference index

Detailed mechanism, license and pinned-code checks are in [RESEARCH-MOTION.md](RESEARCH-MOTION.md). Geometry/export references are in [BLENDER-V002-SPEC.md](BLENDER-V002-SPEC.md), and material/layout/accessibility references in [INTERFACE-SPEC.md](INTERFACE-SPEC.md).

| Source                                                                                                                                                  | What we study                                              | Proposed adaptation                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| [Three.js MarchingCubes source](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/jsm/objects/MarchingCubes.js) | Scalar-field merging and dynamic surface cost              | Optional isolated jelly-lobe study               |
| [Drei distortion source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/MeshDistortMaterial.tsx)                 | Time-driven vertex deformation                             | Broad slow wobble, protected face region         |
| [Drei transmission source](https://github.com/pmndrs/drei/blob/bf6f4addf47467d3885de272d94ca5127f6ef68f/src/core/MeshTransmissionMaterial.tsx)          | Scene-buffer refraction and extra-pass tradeoffs           | Compare against native physical transmission     |
| [OGL Flowmap source](https://github.com/oframe/ogl/blob/385ce65c352c70734a36dc98c787fdd1d30ddb3b/src/extras/Flowmap.js)                                 | Dissipating pointer-velocity field                         | Optional internal color wake; gaze first         |
| [Three.js morph example](https://github.com/mrdoob/three.js/blob/11738a9d55e502fb484cefffcea3a66dc44e9fe9/examples/webgl_animation_skinning_morph.html) | Independent expression and body controls                   | Separate blink, gaze, squash and phase controls  |
| [ElevenLabs Orb source](https://github.com/elevenlabs/ui/blob/23c31bd3088814215a8b5d0bfb56b327cad1a578/apps/www/registry/elevenlabs-ui/ui/orb.tsx)      | State motion versus supplied volume                        | Honest phase/optional-level presentation adapter |
| [Microsoft Windows 7 layout guide](https://learn.microsoft.com/en-us/windows/win32/uxguide/vis-layout)                                                  | Hierarchy, proximity, alignment and progressive disclosure | One focus, grouped controls, details on demand   |

The Microsoft page explicitly labels itself historical Windows 7 guidance. Its organizational principles are studied here; its old control dimensions are not adopted as modern accessibility requirements. Specific spacing, colors, character values and layout dimensions in this packet are our proposals, not values prescribed by those references.

The Three.js, Drei and ElevenLabs references use MIT code licenses; OGL declares Unlicense. No reference source, example texture, HDRI, model, character or branded artwork has been copied in this planning pass. If implementation later copies code, preserve applicable notices and separately inspect all included assets and dependencies.

## Inspected baseline and technical limits

- v001 is an authored sculpture with one six-second loop; it is not fluid simulation. The measured asset topology and file size are recorded in the Blender specification.
- The current renderer is direct Three.js with lazy loading and existing performance/fallback protections. A referenced React Three Fiber example does not require a framework migration.
- The existing voice path uses Scribe, recording and playback, with an internal microphone analyser for automatic recording. Do not assume `useConversation` getters are exposed here. An optional numeric adapter should reuse the owned pipeline and retain interruption and cleanup behavior.
- WebGL refraction samples rendered scene data. It cannot read arbitrary desktop content behind a transparent native window. CSS backdrop filtering and native Windows materials also require distinct verification.
- Current native bounds are 360×86 collapsed and 440×580 expanded. Larger concept drawings are proposals, not screenshots of those windows.

## Refinement record

| Revision       | Trigger                                                    | Change                                                                                                       | Evidence / next gate                                                                                                                                                                |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — 2026-10-10 | User requested bubbly Aero visuals and clarified cute eyes | Proposed Ripple, open steel cradle, expressive face, controlled jelly motion and colorful readable interface | [Original concept board](../../../artifacts/ripple-aero-concept-v002.png) and [exact prompt / critique](CONCEPT-PROMPT.md); next implementation gate is actual-size clay/face proof |

The generated board's strong character silhouette and material separation guide the next authoring pass. Its extra slogans, wide panel and pale placeholder are not product requirements; the recorded critique asks for a portrait layout, meaningful conversation content and tested contrast in React.

Append future entries with observed defects, source revisions, controlled comparisons and actual artifact links. Do not report planned budgets, generated concept pixels, or untested audio responses as completed implementation.
