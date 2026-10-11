# Animated Soft Original — v008

The preferred Original Blender still now has a separate animated counterpart: **Soft Original**. It restores the v005 lavender-blue materials and shell colors on the latest v007 rig, happy-eye morphs and eleven animation clips. Original, Daylight and their source files remain unchanged.

Open the [live Pearl panel](http://127.0.0.1:5173/?studio=panel&material=pearl&asset=sprout-v008) or [character animation studio](http://127.0.0.1:5173/?studio=buddy&asset=sprout-v008). In the panel choose **Soft Original → Animated 3D**. The status must read **Soft Original · Live 3D**. Pearl texture remains at the approved 40%. Collapse the conversation to see the floating companion.

## Appearance and motion

The new Blender source is `design/buddy/sprout/source/sprout-soft-original-v008.blend`; the deployed-format asset is `public/buddy/sprout-v008.glb` (1,460,216 bytes). Source production, immutable-file hashes and preservation checks are in [the asset handoff](../sprout/ASSET-HANDOFF-v008.md).

The browser applies a separate soft shading profile to this version. Premultiplied alpha removes the bright canvas-compositing fringe, while restrained lavender/teal edge pigment compensates for Three.js screen-space refraction. Bud/foot shading uses bind-pose coordinates, so the color follows the animated mesh. This profile changes no existing material preset, pose, rig, face or motion controller. It remains real-time 3D with changing reflections, rather than an animated PNG.

The result is closer to the approved still at companion size; it is not pixel-identical to a Cycles render. The large comparison exposes remaining differences in refraction and lower-body opacity. The exact approved still remains separately labelled as a reference and available as the no-WebGL fallback.

All eleven clips are preserved: Idle, Listen, Think, Speak, Blink, Click, Done, JoyJump, SleepEnter, SleepLoop and Wake. Existing eye tracking, subtle body attention, click bounce and automatic behavior routing use the same controllers. There is no second microphone or provider session. The general production default remains v007 until the new look is adopted; the explicit review links select v008.

## Verification

- Independent source/runtime preservation audit: every non-color accessor and all animation data match v007; v005 material dictionaries and shell colors match exactly. Original asset hashes are unchanged.
- Actual rendered v007/v008 comparison at 240px and 96px: idle, listening, thinking, speaking, happy-eye closure, joy, sleep, wake, Done, pointer directions and neutral return. Paused and reduced-motion frames are stable. No API/microphone requests or page/console errors occurred.
- Deterministic motion replay at 30/60/120Hz: maximum matrix difference `8.49e-14`, projected-eye difference `1.30e-13px`. This is a controller/geometry check, not a GPU performance claim.
- Actual v008 studio UI: joy, sleeping Zs, wake, Done interruption, motion pause, reduced motion and the matching closed-eye fallback after WebGL context loss pass.
- Panel integration and the existing local-interaction/accessibility test pass (three tests): rapid version changes preserve the live v008 model and draft; reference/live switching and collapse/expand retain state; a missing v008 correctly loads v007 with Daylight lighting. The panel remains readable at 320px. Production build passes.

Evidence:

- [Reference / Original live / Soft Original live comparison](../../../artifacts/sprout-soft-v008/study/comparison.png)
- [Recorded actual motion](../../../artifacts/sprout-soft-v008/verification/actual-motion-review.webm)
- [Browser report](../../../artifacts/sprout-soft-v008/verification/report.json)
- [Motion replay](../../../artifacts/sprout-soft-v008/verification/motion-replay.json)
- [Sleeping pose](../../../artifacts/sprout-soft-v008/verification/sleep-closed-eyes.png)
- [Actual expanded panel](../../../artifacts/sprout-soft-v008/panel/soft-expanded.png)
- [Actual compact companion](../../../artifacts/sprout-soft-v008/panel/soft-compact.png)
- [Unmodified recorded-video frames](../../../artifacts/sprout-soft-v008/verification/video-frame-review.json): `joy-04` is airborne, `joy-06` shows landing squash, and `blink-06` shows the closed happy-eye arc.

The first browser proof used a fixed 600ms neutral-gaze wait that was too short under four-canvas recording load (0.03552 versus a 0.035 bound). The proof now waits for actual settling with the same bound; the initial report/video are retained. Screenshot capture latency can miss a blink or jump peak, so timed stills are not claimed as exact-peak frames. This pass does not re-certify live ElevenLabs, native-window pointer delivery or microphone inactivity timing, which are unchanged.

Reproduce the focused checks:

```powershell
node scripts/study-sprout-soft.mjs
node scripts/verify-sprout-soft.mjs
npx tsx scripts/verify-sprout-motion.ts public/buddy/sprout-v008.glb artifacts/sprout-soft-v008/verification/motion-replay.json
$env:INSIGHTOS_PROOF_ASSET_VERSION='v008'
$env:INSIGHTOS_PROOF_TAG='sprout-soft-v008/verification'
npx playwright test tests/e2e/sprout-behaviors.spec.ts --grep 'authored joy'
npx playwright test tests/e2e/sprout-soft.spec.ts tests/e2e/buddy-panel-preview.spec.ts
npm run build
```
