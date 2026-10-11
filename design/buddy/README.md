# InsightOS Ribbon — authored source

The implemented v001 direction is **Ribbon**. The proposed next direction is [Ripple: a cute ocean-blue jelly character and Aero interface](frutiger-aero/README.md); that planning packet does not change the current runtime. The original Aperture blockout survives in recovery copies; the current hero is one continuous titanium ribbon around a luminous sea-glass pearl. All five visible surfaces are actual authored meshes. There are no procedural displacement or texture dependencies.

Runtime assets are `public/buddy/insight-core-v1.glb` and the transparent 640×640 `insight-core-v1.png`. The GLB contains only the nine model/rig nodes, five mesh surfaces with baked evaluated normals, portable PBR materials, and one six-second loop. The filename stays stable for the UI integration.

The origin is the pearl center. Blender uses metres and Z-up; glTF exports Y-up. Use an orthographic camera at **[0.35, 0.75, 5.8]**, target **[0,0,0]**, up **[0,1,0]**, vertical span **2.72**. Do not recenter individual meshes or add an extra default rotation. Authored lights, camera bounds, and material values are in `audit.json` and `glb-audit.json`. Lighting exposure is zero with AgX in the offline render.

The clip `INSIGHTOS_Buddy_v001` runs from 0 to 6 seconds with 145 inclusive sample keys at 24 fps. It rotates the outer ribbon once, counter-rotates the inner flow once, and breathes the pearl ±0.8%. Loop the entire clip. Reduced motion starts at frame zero or freezes the current clip pose when enabled during a session. Voice response can add a small independent parent-scale pulse without changing the authored mesh or audio workflow.

Rebuild only in a connected Blender session, with the original scene preserved:

1. Execute `00_checkpoint.py` with a descriptive `LABEL`. It saves a recovery **copy** while keeping the current active filepath unchanged.
2. Execute `01_blockout.py` successively with `PHASE` set to `bounds`, `primary_masses`, `secondary_masses`, `silhouette_proportions`, `pivots_attachments`, and `camera_review`. This is the retained study construction. Review solid camera and side views before continuing.
3. Execute `02_ribbon_geometry.py`, `03_materials.py`, and `04_lighting.py`; inspect the ribbon silhouette and reflection bands.
4. Execute `05_animation.py`, then `06_audit.py`. Any failed assertion stops the pass.
5. Execute `07_export.py`, `08_render_proofs.py`, and `09_final_visual_audit.py`; review the actual generated images.
6. Run `node design/buddy/check-glb.cjs` from the repository root to verify the exported clip and normals independently.
7. Return to frame 1 and the hero camera; make another checkpoint copy. No final `.blend` file save or active filepath change is part of this workflow.

The source intentionally keeps semantic parts and rig controls editable. Mesh replacement preserves the old study datablock; it does not delete existing scene objects. The original `Scene`, `Cube`, `Camera`, `Light`, World and materials are protected.

The geometry in the app is the same exported geometry. Cycles transmission and browser transmission differ in lighting, background refraction, and tone mapping; exact offline pixels are provided by the PNG fallback. This is a procedural sculpture, not a physical fluid simulation. The runtime should use PMREM studio reflections and the supplied camera, then be judged in the actual UI.

## Local preview and desktop

On Windows, double-click `Start InsightOS UI.cmd` in the repository folder. It reuses healthy local servers, checks that port 5173 serves this checkout's model, starts missing development services in the background, and opens the buddy. It leaves existing services and the original project alone. Startup logs for services it creates live in `.local/ui-preview-logs/`.

Run `npm run dev:web` and open `http://127.0.0.1:5173/?studio=buddy` to compare five simulated states and open the compact conversation panel. The studio never starts a microphone or sends messages.

For command-line setup, run `npm run setup:desktop` once, then `npm run dev` after closing previous development servers. Electron hosts the same React UI, with the existing transparent window, drag region, expand/collapse behavior, and keyboard shortcut. If the API and UI servers are already running from this checkout, launch only `node_modules\\electron\\dist\\electron.exe . --dev` to reuse them. The visual studio needs no provider credentials.

The live conversation supplies idle/listening/thinking/speaking phases through the presentation-only `buddyVisualState` adapter. Speaking rhythm is a state-driven visual pulse, not an audio-amplitude meter. Done is available in the visual studio; it is not inferred from financial task outcomes.

## Visual process and provenance

The process is reference comparison → original authored silhouette → material and isolated lighting studies → motion audits → shared mesh in the browser → actual-size UI critique. `../../artifacts/buddy-concepts-v1.png` contains the three generated directions. `imagegen-prompt.txt` preserves the built-in image-generation tool and exact prompt. No private portfolio document or third-party geometry is included.

Interaction architecture was studied from [ElevenLabs UI Orb](https://ui.elevenlabs.io/docs/components/orb), whose [repository license is MIT](https://github.com/elevenlabs/ui/blob/main/LICENSE.md). The implementation here is original; it does not embed that component or its shader.

Rendering uses [Three.js](https://threejs.org/) and its [MIT-licensed loader and renderer](https://github.com/mrdoob/three.js/blob/dev/LICENSE). The installed package includes its applicable license. No remote HDRI or purchased model is required.

Other studies: [OGL Fresnel](https://oframe.github.io/ogl/examples/fresnel.html) and [Drei MeshDistortMaterial](https://drei.docs.pmnd.rs/shaders/mesh-distort-material). These are references only; none of their source is copied into the buddy.
