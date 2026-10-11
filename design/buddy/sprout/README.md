# Sprout / Prism v002 — delivery guide

Sprout is the original InsightOS jelly buddy selected from the Prism creature study. Its editable Blender master produces the same geometry used in the React/Vite/Three/Electron application. The glossy blue face, cyan crown, rising violet/coral lower streak, unequal buds, glints and smile were refined against actual browser sizes. The material suggests jelly; it is not a physical fluid simulation.

## Delivered asset

| Output                              | Location                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical GLB                       | [sprout-prism-v002.glb](sprout-prism-v002.glb)                                                                                                                                                                     |
| Export manifest                     | [sprout-prism-v002.manifest.json](sprout-prism-v002.manifest.json)                                                                                                                                                 |
| Editable Blender master             | [source/sprout-prism-v002.blend](source/sprout-prism-v002.blend)                                                                                                                                                   |
| Runtime copies                      | [GLB](../../../public/buddy/sprout-v002.glb), [transparent PNG](../../../public/buddy/sprout-v002.png)                                                                                                             |
| Offline 640×640 front proof         | [proofs/sprout-prism-front.png](proofs/sprout-prism-front.png)                                                                                                                                                     |
| Source inventory and visual studies | [final source inspection](proofs/final-source-inspection.json), [pose sheet](proofs/final-poses-sheet.png), [light study](proofs/final-lighting-sheet.png), [grayscale study](proofs/final-lighting-grayscale.png) |
| Full authoring record               | [SCENE-PASSPORT.md](SCENE-PASSPORT.md)                                                                                                                                                                             |

Canonical/runtime GLB size: **1,295,856 bytes**. Both SHA-256 hashes: `34cd83c23c60afedbf6edd9e9e337af4715a6f60070fe59ca90b9a8b7a73d756`.

Blender master SHA-256: `d636554af1d2ae493a8414de322a0028779f1fd6d47baff2133be0546a12a2ae`. The inspected master retains the original Scene and historical Ribbon scene alongside `INSIGHTOS_Sprout_v002`; it contains 29 objects, nine bones, three body shape keys beyond Basis, six clips and seven source proxies. Saving the master used a copy and preserved the connected Blender session's active filepath.

The exported runtime has **10 meshes, 10,328 vertices and 20,384 triangles**, one skin with nine deformation bones and three position/normal morph targets: `Jelly_Squash`, `Jelly_Sway_L`, `Jelly_Sway_R`. The six clips are `Sprout_Idle`, `Sprout_Listen`, `Sprout_Think`, `Sprout_Speak`, `Sprout_Click` and `Sprout_Blink`. Exported vertex counts include glTF splits; they need not equal editable Blender vertex counts.

The canonical body uses vertex colors and simple glTF PBR values: metallic about `0.035`, roughness about `0.16`, clearcoat `0.5`, clearcoat roughness `0.1`. It has no transmission extension. The separate [glossy](sprout-prism-glossy-v002.glb), [transmission](sprout-prism-transmission-v002.glb) and [refined](sprout-prism-refined-v002.glb) exports preserve controlled comparisons; the canonical asset above is the delivery.

Coordinates are glTF Y-up with the face toward +Z. Use the documented orthographic camera at `[0.1, 0.24, 6]`, target `[0, 0.08, 0]`, vertical span `2.8`; do not recenter separate parts. Blender uses Z-up and face −Y. The passport records source lights and camera. Browser reflections, tone mapping and transparency differ from offline rendering; source/browser comparison evaluates silhouette, face, color and motion rather than pixel identity.

## Run and inspect

On Windows, double-click **Start InsightOS UI.cmd** at the repository root. It verifies this checkout's served model, reuses healthy API/UI servers and opens the native buddy. Logs for any services it starts live in ignored `.local/ui-preview-logs/`.

For a fresh checkout, run `npm ci`, `npm run setup:desktop`, then `npm run dev`. If this checkout's servers already run on 4311/5173, launch only `node_modules\electron\dist\electron.exe . --dev`.

Open [http://127.0.0.1:5173/?studio=buddy](http://127.0.0.1:5173/?studio=buddy) to inspect actual sizes, replay simulated phases, blink and click. The studio does not start a microphone, provider session or financial task. The live buddy's HTML pet button opens/collapses the panel; Escape collapses it. Use the explicit Pause voice control to end capture/playback. Animation does not own these controls or voice sessions.

Run the independent structural/controller checks from the repository root:

```text
node scripts/validate-buddy-asset.mjs design/buddy/sprout/sprout-prism-v002.glb artifacts/sprout-gltf-validation.json
npx tsx scripts/verify-sprout-motion.ts design/buddy/sprout/sprout-prism-v002.glb artifacts/sprout-prism-final-motion-replay.json
npm run typecheck
```

The native fixture runners are `node scripts/smoke-buddy-panel.mjs` and `node scripts/smoke-buddy-voice.mjs --record` (omit `--record` for assertions only). Production renderer proof uses `node scripts/verify-sprout-native.mjs --production-bundle` after a current build. Run GPU proofs serially. These runners use isolated Electron profiles and leave the active user window and API/UI services running.

Use `node scripts/verify-sprout-native.mjs --cold-load` for the separate first-avatar-load check and `node scripts/verify-sprout-native.mjs --edge-panel-record` for the bounded native edge/reduced-motion recording. `node scripts/audit-buddy-accessibility.mjs` audits current HTML/styles with local fixtures after a build. Each runner records its actual scope and does not invoke a live provider.

## Editable authoring order

| Source                                                                                               | Responsibility                                               |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [01_blockout.py](01_blockout.py)                                                                     | Camera-readable clay silhouette and semantic parts           |
| [02_runtime_geometry.py](02_runtime_geometry.py)                                                     | Final runtime topology before deformation authoring          |
| [03_rig_and_shapes.py](03_rig_and_shapes.py)                                                         | Small FK rig, stable face mount and fixed-topology body keys |
| [04_animation.py](04_animation.py)                                                                   | First Idle/Listen/Click/Blink proof                          |
| [05_export.py](05_export.py)                                                                         | Selected model export, portable materials and clip manifest  |
| [06_render_proof.py](06_render_proof.py)                                                             | Offline visual evidence                                      |
| [07_closed_eyes.py](07_closed_eyes.py)                                                               | Readable closed-eye forms and corrected resting lids         |
| [08_prism_material.py](08_prism_material.py)                                                         | Original baked vertex-color recipe and material comparisons  |
| [09_phase_clips.py](09_phase_clips.py)                                                               | Think/Speak loops and phase-specific motion                  |
| [10_smile.py](10_smile.py)                                                                           | Small original smile geometry                                |
| [11_prism_lighting.py](11_prism_lighting.py)                                                         | Isolated key/rim/world study and selected lighting           |
| [12_final_proofs.py](12_final_proofs.py), [13_proof_contact_sheets.mjs](13_proof_contact_sheets.mjs) | Final pose/light renders and inspectable contact sheets      |
| [inspect_source.py](inspect_source.py)                                                               | Saved-master inventory                                       |

Inspect scripts and their checkout path before replaying. The saved master is the editable delivery; do not blindly rerun construction scripts over it. Keep one Blender editor, preserve unrelated scenes and checkpoint copies before mutation. Topology must be fixed before shape keys: a later topology change requires rebuilding the affected keys, weights and exported animation proof. Do not optimize by decimating an already keyed/skinned export.

## Evidence and limits

- [Final source inspection](proofs/final-source-inspection.json) passes for the saved master. [Final glTF validation](proofs/final-validator.json) reported zero errors, one non-root-skin warning and unused-UV information; the passport explains the retained hierarchy and UV status.
- [Final six-clip controller replay](../../../artifacts/sprout-prism-final-motion-replay.json) verifies the actual canonical export, loop seams, isolated reaction channels, rapid interrupted transitions and framing across each full six-second base loop. It is deterministic CPU evidence, not a GPU or live voice test.
- [Browser comparisons](../../../artifacts/sprout-web-look/) retain actual 44/96/160/320-pixel captures for glossy, transmission, refined and final candidates. The [clay native report](../../../artifacts/sprout-native-clay/report.json) is an earlier milestone; headless still-capture timings do not establish native frame cadence.
- [Native panel verification](../../../artifacts/buddy-panel-native-verification.json) records controlled bright/dark/busy backdrops, rapid reversal, focus/workspace round trips, IPC boundaries and 200% zoom. The final full suite passed 143 tests across 19 files, with three existing Python-configuration skips; four focused panel browser cases, including Axe, passed.
- [Computed-style and accessibility-tree audit](../../../artifacts/buddy-accessibility-audit.json) verifies 320 CSS-pixel reflow, the actual 22px Large text setting, 44px controls, forced colors and keyboard focus. Audited sustained text meets the 7:1 contrast aim: welcome minimum 7.27:1, conversation 7.49:1, compact bill prose 7.08:1 and its source link 7.54:1. Brief labels meet AA but some remain below 7:1. This is browser semantics/keyboard evidence, not a physical screen-reader session or blanket WCAG certification. Compact bill explanations retain their existing 14px default; the main conversation uses 18px body text. Detailed financial content retains its existing inline/workspace views.
- [Audio bridge verification](../../../artifacts/audio-presentation-verification.json) retains the [earlier clay voice proof](../../../artifacts/buddy-voice-native-verification.json). The [final native voice report](../../../artifacts/buddy-voice-native-final/report.json) and [full-flow recording](../../../artifacts/buddy-voice-native-final/synthetic-voice-interrupt-panel.webm) use the exact final GLB, oscillator input and local PCM output with the real voice hook, MediaRecorder, HTMLAudio and Web Audio meter. They prove a playing reply was interrupted at 0.873 of 4 seconds, newer-generation output, the original unsent draft surviving both voice turns and collapse/reopen, and Pause cleanup. The recording is video-only; the real audio elements, tracks and meter provide audio assertions. Physical microphone/speaker behavior and live ElevenLabs remain unverified: local status reported `configured: false` and `ttsConfigured: false`, and these fixtures use no paid provider request.

The accepted [compiled native renderer report](../../../artifacts/sprout-native-prism-production/report.json) verifies the exact final served GLB header, version, length and hash during a simulated six-clip replay in Electron at its trusted local origin. On the tested RTX 5050 at 96×96, with ten draws, it recorded:

| Local measurement                       | Result                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Renderer intervals                      | p95 16.8 ms; max 17.0 ms; zero above 18 ms                                   |
| Independent rAF clock                   | 1,103 samples; p95 16.8 ms; max 19.6 ms; three above 18 ms                   |
| Render-call CPU time                    | p95 0.70 ms                                                                  |
| Warm avatar startup, separate from replay | Fetch 86.0 ms; parse 6.5 ms; GPU setup 215.6 ms; first model render 309.4 ms |
| Resource counts                         | Ten geometries; four textures                                                |
| CPU geometry attribute storage          | 1,197,416 bytes                                                              |
| One RGBA16F environment target estimate | 1,572,864 bytes                                                              |

There were no page errors or API calls. This uses the compiled UI in the actual native shell, not the embedded production backend or a live voice provider. Clock intervals are not verified operating-system presented frames. This replay harness first rendered the development buddy, so its startup values are warm-avatar measurements rather than cold-load evidence. CPU attribute storage and one environment-target estimate do not measure total GPU VRAM, which WebGL does not expose here.

The separate [cold-avatar compiled-load report](../../../artifacts/sprout-native-prism-cold-load/report.json) uses a fresh Electron process/profile. Both initial development GLB requests were cancelled before parse/GPU allocation, with the PNG fallback visible; the first avatar load then used the compiled UI. It measured fetch **149.8ms**, parse **29.3ms**, GPU setup **1,125.2ms**, and first model render **1,306.7ms**. The WebGL-ready attribute appeared **1,629.2ms** after compiled navigation. This is application/process-cold evidence, not a guarantee of cleared OS/driver caches or power-on cold boot. Startup shader/environment work is separate from the steady replay frame budget; native security settings and the exact served asset hash passed.

The separate [native replay and panel recording](../../../artifacts/sprout-native-prism-video/native-replay-and-panel.webm) shows the six-clip simulated replay, native pet opening, an unsent draft and collapse. Its [report](../../../artifacts/sprout-native-prism-video/report.json), [initial welcome](../../../artifacts/sprout-native-welcome.png) and [collapsed buddy](../../../artifacts/sprout-native-collapsed.png) are retained. Recording is separate from the timing run and starts no microphone or task request.

The [edge/panel recording](../../../artifacts/sprout-native-prism-edge-panel/native-edge-panel.webm) and [native bounds report](../../../artifacts/sprout-native-prism-edge-panel/report.json) verify open/collapse/keyboard reopen at the bottom-right work-area edge. The native window changes from `(1624, 904, 296, 128)` to `(1512, 360, 408, 672)` inside the tested `1920×1032` work area. The original draft and expected focus survive; reduced-motion avatar pixels match across 450ms. The 11.24-second app-only video does not capture the desktop or prove physical monitor changes; native coordinates establish the tested edge position.

## References and provenance

The generated boards retained exact prompts and informed an original Blender build:

| Board                                                                                 | Exact prompt and decision record                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [Initial Aperture/Ribbon/Pebble directions](../../../artifacts/buddy-concepts-v1.png) | [imagegen-prompt.txt](../imagegen-prompt.txt)           |
| [Ripple Aero concept](../../../artifacts/ripple-aero-concept-v002.png)                | [CONCEPT-PROMPT.md](../frutiger-aero/CONCEPT-PROMPT.md) |
| [Palette study](../../../artifacts/ripple-palette-study-v003.png)                     | [PALETTE-STUDY.md](../frutiger-aero/PALETTE-STUDY.md)   |
| [Prism creature study](../../../artifacts/prism-avatar-study-v004.png)                | [AVATAR-STUDY.md](../frutiger-aero/AVATAR-STUDY.md)     |

Sprout and Prism were selected; the original unequal buds, clear eyes and blue frontal face became the authored character. Concept images establish art direction, not exact final pixels. All delivered geometry, colors, rig and animation are original. No external character mesh, private portfolio source, remote HDRI/texture or paid Higgsfield job is included.

[Reference recipes](../frutiger-aero/REFERENCE-RECIPES.md) and [animation research](../frutiger-aero/ANIMATION-WORKFLOW.md) retain primary Blender/Three examples, exact mechanisms, pinned revisions and licenses. Three.js/R3F/Drei examples informed architecture; their character assets were not copied. ElevenLabs Orb was an interaction reference, not an embedded component or shader. The installed Three.js package is MIT licensed and glTF Validator is Apache-2.0 licensed; reference asset licenses do not automatically apply to this original character.

## Ownership and changes

One Blender owner manages geometry, rig, vertex colors, clips, editable master, export manifest, PNG and passport. Renderer/controller ownership covers GLB loading, animation channels, fresh read-only audio samples, visibility, reduced motion and resource disposal. HTML/native panel ownership covers semantics, reversible bounds, focus, transcript scrolling and controls. Voice ownership retains provider SDKs, sessions, VAD, interruption and audio-resource lifecycle; only the narrow presentation bridge exposes levels.

Backend planning, finance behavior, API contracts and credentials are outside this asset delivery. Keep canonical and runtime GLBs byte-identical, refresh the PNG from the selected source, and rerun structural/motion/browser checks after relevant changes. UI work is on **ui/presentation-polish**, associated with the [existing draft PR](https://github.com/Wasseem10/insightos/pull/1).
