# InsightOS buddy — Sprout / Prism

**Sprout v004 is the current implemented character.** Start with the [current delivery guide](sprout/DELIVERY-v004.md): translucent Prism panel, centred Mic/Pause control, authored joy/sleep/wake and confirmed-completion acknowledgement. The [glass, joy and sleep prompt](frutiger-aero/GLASS-JOY-SLEEP-MASTER-PROMPT.md) records the implementation contract; [v003](sprout/DELIVERY-v003.md) preserves the preceding delivery.

The v002 inventory below is retained history. The original blue jelly creature has unequal rounded buds, navy eyes, white glints, a small smile and a restrained violet/coral lower streak. Blender-authored geometry, rig and animation are exported to GLB and rendered by the existing React/Vite/Three/Electron application.

Start with the [Sprout delivery guide](sprout/README.md), [scene passport](sprout/SCENE-PASSPORT.md) and [retained design and workflow studies](frutiger-aero/README.md).

| Delivery                 | File                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Canonical original asset | [sprout-prism-v002.glb](sprout/sprout-prism-v002.glb)                                                        |
| Export manifest          | [sprout-prism-v002.manifest.json](sprout/sprout-prism-v002.manifest.json)                                    |
| Editable Blender master  | [sprout-prism-v002.blend](sprout/source/sprout-prism-v002.blend)                                             |
| Runtime copies           | [sprout-v002.glb](../../public/buddy/sprout-v002.glb), [transparent PNG](../../public/buddy/sprout-v002.png) |
| Offline front proof      | [sprout-prism-front.png](sprout/proofs/sprout-prism-front.png)                                               |

The canonical and runtime GLBs are identical: **1,295,856 bytes**, SHA-256 `34cd83c23c60afedbf6edd9e9e337af4715a6f60070fe59ca90b9a8b7a73d756`. The export contains ten meshes, nine deformation bones, three body morphs with morph normals and six clips: Idle, Listen, Think, Speak, Click and Blink. The browser uses these authored shapes; the jelly appearance is a controlled material and deformation treatment, not a fluid simulation. Offline and browser lighting differ, so matching geometry does not promise identical pixels.

## Open the app

On Windows, double-click **Start InsightOS UI.cmd** in the repository folder. It reuses healthy local servers, checks that port 5173 serves this checkout's model, starts missing services in the background and opens the native buddy. Startup logs live in ignored `.local/ui-preview-logs/`.

Open [the local buddy studio](http://127.0.0.1:5173/?studio=buddy) to inspect Sprout at actual sizes, replay simulated phases and test reactions. The studio needs no credentials and starts no microphone or provider session.

For a fresh command-line setup, run `npm ci`, `npm run setup:desktop`, then `npm run dev`. If this checkout's API/UI servers already run, launch only `node_modules\electron\dist\electron.exe . --dev` to reuse them.

## Motion, conversation and verification

The live conversation remains authoritative for listening, thinking and speaking. The renderer crossfades authored clips, gives Click and Blink separate channels, respects reduced motion and visibility, and consumes a read-only audio presentation ref. Measured TTS output comes from the voice owner's existing playback graph; fallback speech remains audible when analysis is unavailable. Batch input reuses existing RMS without changing VAD or opening a second microphone. Provider, session and backend behavior remain with their existing owners.

[Audio verification](../../artifacts/audio-presentation-verification.json) and the [final native synthetic voice proof](../../artifacts/buddy-voice-native-final/report.json) exercise real capture/playback mechanisms with an oscillator and local PCM fixtures. The [full-flow recording](../../artifacts/buddy-voice-native-final/synthetic-voice-interrupt-panel.webm) shows open, unsent typing, reply interruption, new output, collapse/reopen with the same draft and explicit Pause cleanup using the final GLB. It is video-only; the audio elements, tracks and meter assert actual synthetic playback. This is not live ElevenLabs or physical-device verification. Local provider status reported `configured: false` and `ttsConfigured: false`; earlier clay evidence remains retained.

The [actual six-clip replay](../../artifacts/sprout-prism-final-motion-replay.json), [native panel evidence](../../artifacts/buddy-panel-native-verification.json) and [final Blender source audit](sprout/proofs/final-source-inspection.json) are retained. The [compiled native renderer proof](../../artifacts/sprout-native-prism-production/report.json) passes for the final asset: at 96×96 on the tested RTX 5050, renderer intervals had p95 16.8 ms and maximum 17.0 ms. Independent rAF-clock samples had a 19.6 ms maximum. These are local clock/render-call measurements, not verified operating-system presented frames or production backend/provider acceptance; see the delivery guide for scope and startup/resource values.

## Original work and references

The process was generated concept comparison → original clay silhouette → fixed runtime topology and rig → exported animation proof → isolated material/light studies → browser comparison → native interaction review. All character geometry, colors, rig and animation are original. Exact image-generation prompts and boards are linked in the [Sprout provenance guide](sprout/README.md#references-and-provenance). No third-party character, private portfolio file, purchased model, remote HDRI or paid Higgsfield job is included.

[Reference recipes](frutiger-aero/REFERENCE-RECIPES.md) and [animation research](frutiger-aero/ANIMATION-WORKFLOW.md) retain primary examples, pinned source revisions and license boundaries. Three.js is MIT licensed; glTF Validator is Apache-2.0 licensed. Referenced example characters and ElevenLabs Orb were not copied into the delivered avatar.

## Historical Ribbon v001

Ribbon is the earlier continuous titanium sculpture around a sea-glass pearl. Its original source scripts, [audit](audit.json), [GLB audit](glb-audit.json) and [runtime GLB](../../public/buddy/insight-core-v1.glb)/[PNG](../../public/buddy/insight-core-v1.png) remain available as history and fallback assets. Its five surfaces, nine model/rig nodes and six-second `INSIGHTOS_Buddy_v001` loop are Ribbon specifications, not Sprout's current inventory.

Ribbon's glTF camera is orthographic at `[0.35, 0.75, 5.8]`, target `[0,0,0]`, Y-up, vertical span `2.72`. Its 145 inclusive samples at 24 fps rotate the ribbon and inner flow and breathe the pearl. The original Aperture blockout remains in recovery copies.

To reproduce that historical study, inspect `00_checkpoint.py` through `09_final_visual_audit.py` before executing them in Blender. They retain the checkpoint-copy, staged blockout, geometry, materials, lighting, animation, audit, export and rendered-proof passes. `node design/buddy/check-glb.cjs` verifies Ribbon independently. Preserve the original `Scene`, `Cube`, `Camera`, `Light` and all unrelated objects; use one Blender editor and do not run those old scripts over the current Sprout scene.

The [first concept board](../../artifacts/buddy-concepts-v1.png) and [exact submitted prompt](imagegen-prompt.txt) preserve the initial art direction.
