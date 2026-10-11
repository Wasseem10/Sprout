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

### Color exploration — 2026-10-10

The user likes the vibrant blue concept and asked whether a beautiful combination of colors would improve it. [The palette study](PALETTE-STUDY.md) compares Ocean, Prism and Lagoon with a [saved reference board](../../../artifacts/ripple-palette-study-v003.png). The user subsequently selected **Prism**: blue/aqua with a violet-to-coral side/lower streak, clear face and quieter reading surfaces. At this stage, character and final layout were open and the master prompt was an earlier draft awaiting consolidation; later decisions are recorded below.

### Creature exploration — 2026-10-10

The user asked for other actual character silhouettes before deciding whether Ripple is best, and made the steel cradle interchangeable. [The avatar study](AVATAR-STUDY.md) compares Ripple, Sprout and Drift with Prism materials and no required support. Our preferred challenger is Sprout, with shorter rounded asymmetric buds to test in the next blockout. Steel sweep, glass pebble and free float are independent support ideas. Character selection and final layout remain open; no runtime or Blender model was replaced.

### Production workflow and Sprout selection — 2026-10-10

The user selected **Sprout**, retained **Prism**, and asked to set accessory discussion aside while defining a workflow with working examples and clean animation. This superseded the earlier open-character status above. At this stage, final compact/expanded layout was open and prompt consolidation was pending; the subsequent request and completed brief are recorded below.

[PRODUCTION-WORKFLOW.md](PRODUCTION-WORKFLOW.md) records the build order: actual-size clay → minimal rig/four clips → audited GLB motion in current Three → Prism lookdev → bounded R3F reuse → panel choreography → measured delivery. [ANIMATION-WORKFLOW.md](ANIMATION-WORKFLOW.md) defines the rig/clip/export contract, [INTERACTION-MOTION-WORKFLOW.md](INTERACTION-MOTION-WORKFLOW.md) defines native bounds/focus/reversal, and [REFERENCE-RECIPES.md](REFERENCE-RECIPES.md) extracts experiments from official Three/Drei/R3F/Khronos examples with pinned sources and license limits.

The inspected UI checkout is React 19/Vite 8/Electron 44/direct Three 0.186.1, with no Next.js or R3F dependency. Its Vercel public build is Vite. Blender → GLB → R3F → Next.js → Vercel is a valid later browser route, while the existing desktop host can reuse the same asset/controller. The unrelated Next.js project at the workspace root is not part of this plan.

The installed Blender exporter warns that applying modifiers prevents shape-key export. The proposed runtime mesh therefore completes topology operations before keys and exports with Apply Modifiers false. Exported morph normals, logical clips and actual channel ownership require a semantic manifest audit. Current 15/30fps renderer caps are inspected baseline behavior, not proof of the proposed 60fps active-motion target.

This workflow pass changes documentation only. No Sprout scene, rig, clip, runtime controller, framework migration or deployment has been created, and none of its proposed review gates is reported as passed.

### Upstream audit and consolidated prompt — 2026-10-10

The user supplied a Higgsfield → Blender → GLB → R3F/Next authoring workflow and requested prompt creation after checking it. [HIGGSFIELD-UPSTREAM.md](HIGGSFIELD-UPSTREAM.md) records the point-by-point audit. Official documentation confirms standalone 3D Jutsu's editable scenes and GLB import/export, separately from its Blender plugin. The live host check returned Blender connected and 3D Blocking Studio disconnected. The exposed 3D catalog returned model labels/IDs but no full schemas; this connector exposes no non-spending estimate tool or motion-submission tool. No generation was submitted to probe cost.

[MASTER-PROMPT.md](MASTER-PROMPT.md) revision 2 now covers selected Sprout/Prism, optional generated intake, Blender cleanup/retopology, animation/channel proof, local runtime assets, selective compression/decoder support and a compact portrait starting layout. The user's request authorizes writing this brief now; the layout remains a prototype to review. Earlier Ripple stage prompts are explicitly historical.

Compression is a derived build after the canonical asset passes. Preserve gaze anchors, semantic names, morph normals, skins and clips through selective transforms, and revalidate manifests/playback. Avoid changing topology after deformation authoring without rebuilding/transferring and proving that data. Idle-loop versus parked-demand behavior and the limits of a p95 threshold were also clarified in the animation specification.

This turn creates documentation and the copyable prompt only. No Sprout generation, Blender mutation, runtime migration or deployment is reported as completed.

### Existing stack and audio reactivity audit — 2026-10-10

The user supplied an interactive audio-avatar/portfolio architecture and asked to rule out work already in the workflow or implemented on GitHub. Live upstream master was fetched at **f1423fd84e554e307294a02f16c09bfa01bdaa8e**; the UI branch was **a13bd134c0c4238c3db6a0ad3c4b90fadc319dd1** before this documentation change. Both refs have the same voice.ts blob **86b3829ac31db2fd02156fa6ac29f2d27da9c7ac**. The voice path is existing upstream work; the direct Three/Ribbon GLB renderer is implemented in the unmerged UI branch.

[STACK-AUDIO-AUDIT.md](STACK-AUDIO-AUDIT.md) records the classification. ElevenLabs Scribe, TTS and interruption remain in place. The internal automatic fallback RMS analyser is not exposed to the avatar, realtime input has no verified level source, and output playback has no analyser. Current rendered speaking pulses are phase-driven. The proposed addition is a narrow read-only voice-owned phase/level/freshness adapter, preserving playback and cancellation.

[MASTER-PROMPT.md](MASTER-PROMPT.md) revision 3 now makes reuse explicit. Sprout keeps its custom GLB rig; Mixamo and VRM/three-vrm are omitted because of their humanoid structure. R3F/Drei remain planned packaging; GSAP scroll motion, Zustand, additional UI/spring libraries and Rapier are deferred. Current Rapier documentation does support soft bodies; deferral reflects scope and cost, not a claim of incapability. Authored morphs remain the first jelly route, with shaders a bounded later study.

The three interaction levels describe capabilities, not three systems to rebuild: conversation already exists, expressive Sprout is planned, and measured sound reactivity is the unimplemented signal integration. Aerospace examples do not expand InsightOS scope. This turn changes documentation only; no voice graph, microphone access, dependency or runtime was changed.

Append future entries with observed defects, source revisions, controlled comparisons and actual artifact links. Do not report planned budgets, generated concept pixels, or untested audio responses as completed implementation.
