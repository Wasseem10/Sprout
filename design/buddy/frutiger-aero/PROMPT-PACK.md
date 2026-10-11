# Focused prompts for refinement

Revision **1**, 2026-10-10. These prompts divide the master brief into bounded work. Proposed values are starting points, not measured v002 performance or finished geometry.

## 1. Original concept image

Create an original high-end product concept for Ripple, InsightOS's cute ocean-blue jelly drop. Give it two clear navy oval eyes, small white glints, a tiny smile, a soft peak and a compressed rounded base. Place it in an open polished steel ribbon cradle, with rounded edges and broad studio reflections. Keep all metal behind or below the eye band. Show a large three-quarter view and three consistent pose studies: attentive, soft click squash, listening tilt. Beside it, show a compact portrait assistant panel with one glass frame, a nearly opaque reading region, simple header and fixed composer. Use ocean blue/cyan, restrained lime/coral and bright sky-like light. Keep the panel spacious and text high-contrast. No finance dashboard, particle halo, robot head or purple neon. The character must be reproducible with a small set of editable meshes and broad deformation, not invented liquid microdetail.

Image generation produces a concept only. Preserve the exact submitted prompt and inspect consistency, silhouette and eye visibility. Do not overwrite runtime assets with a generated image.

## 2. Blender clay and ribbon geometry

Inspect the current scene and v001 audits. Preserve existing work and use a versioned v002 collection. Build the rounded drop, two shallow oval eyes/glints on a face mount, optional tiny mouth, and continuous cradle as semantic parts. First show front, three-quarter and side clay views with camera bounds. Compare ribbon longitudinal sampling and rounded section profiles with identical camera/light settings. Measure minimum body/cradle clearance throughout the proposed motion. Check seams, normals, thickness, curve continuity and the unobstructed eye band. Review 40–44 px, roughly 96 px and 160 px crops before adding materials. Choose topology from visible defects, not a blanket polygon multiplier. Finalize body vertex order before adding morphs. Return the actual clay proof and geometry audit.

## 3. Look development and lighting

Using one approved pose and camera, render balanced, soft-studio and stronger-rim studies at fixed exposure. Make steel read through long broad reflection bands and rounded edge highlights. Make the body rich electric ocean blue with clear cyan edges, a denser face region, modest transmission and controlled white softbox highlights. Preserve navy eye contrast; no light stripe through both eyes. Keep any internal lobe original and restrained. Diagnose flat metal with reflection placement before adding glow; diagnose a foggy body with lighting/attenuation before adding transparent layers. List offline-only shader features. Export portable PBR and reproduce the chosen reflection structure in Three.js, then compare actual-size browser crops. Higgsfield relighting, if used, is a reference study that may invent details; it cannot validate geometry or browser materials.

## 4. Character motion

Animate Ripple with independently controlled body, face, eyes and cradle. Begin with broad authored squash/settle and a stable frontal face region. Gaze has bounded damped offsets; blink briefly closes the eyes; activation gives roughly 6–8% squash and one settle while performing the real expand action. Listening adds a proposed 3–5° attentive tilt; speaking adds a proposed 2–3% pulse. Keep metal rigid and rock it near ±8° without crossing the eyes. Retarget from current values during interrupted transitions. The visual adapter receives real phase plus optional future numeric levels; phase pulses are not measured audio. Reduced motion uses a stable open-eyed pose and immediate readable status. Capture the interrupted listening → thinking → speaking → idle flow, repeated clicks, pointer exit and pause/resume. Audit clips and morph ownership before export.

## 5. Expandable React interface

Implement the proposed interface in the existing React/Electron frontend after the character renders correctly. Keep one header, one conversation region and a fixed composer; reveal supporting detail only when useful. Use the interface spec's blue/cyan glass frame, protected text surface, spacing scale, type hierarchy and contrast requirements. Keep glass effects restrained and separate from reading content. Preserve real mic/send semantics, existing backend events, draft state, dragging, keyboard flow, focus and native controls. Reconcile any proposed larger pet with current 360×86 collapsed and 440×580 expanded windows. Verify native blur rather than assuming CSS can blur desktop pixels. Render 320 px narrow content, enlarged text, a long answer, an interruption and an error. Keep controls usable without the canvas.

## 6. Screenshot critique and correction

Evaluate the actual output against the chosen direction. Identify the three most visible defects with locations, evidence and likely cause. Classify each as geometry, face readability, reflection/light, animation, spacing/type, contrast or framing. Change one cause at a time and capture the same camera/viewport before and after. Reject improvements visible only in a large marketing render. Check that the character's eyes survive the smallest view, the steel has a coherent continuous highlight, the core reads as blue jelly, and the panel has one clear next action. Record observed results, source revisions, budgets and any deliberate approximation in RESEARCH-LOG.md. Update the prompt with the defect and correction, not vague requests to make it more premium.

## Prompt evolution format

For each later revision, record:

- **Observed defect:** a concrete issue in an attached actual-size screenshot.
- **Cause to test:** one hypothesis, distinguished from a measured fact.
- **Bounded change:** geometry/material/layout/motion property to alter.
- **Controlled comparison:** same pose, camera, lighting, viewport and text.
- **Outcome:** improved, regressed or inconclusive, with artifact links.
- **Next prompt:** preserve the successful constraints and address the remaining defect.

Example: “At 44 px the glints merge with the steel reflection and both eyes disappear. Test a larger matte navy eye silhouette with smaller glints while leaving the camera and metal lighting fixed. Compare light/dark background crops.” This is a testable refinement; “make it insanely good” is only the ambition.
