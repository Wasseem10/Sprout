# Sprout eye refraction during pointer turns

The black patch beside the eyes was consistent with the face being captured by the glass body's screen-space refraction. Three's transmission pass draws opaque objects into a texture; the body then samples that texture at a refracted offset. Sprout's dark exterior eyes and smile were included in that capture, allowing displaced copies to appear on the glass as the body turned. This renderer does not enable shadow maps.

The runtime now clones only materials beneath `FACE_ANCHOR` and places them in Three's post-transmission queue (`transparent: true`, `NoBlending`, unchanged full opacity). Depth testing and writing remain enabled, so the shell still occludes any physically hidden face surface. Authored double-sided face meshes use a single draw. Glass/core materials, lighting, eye geometry, closed-eye morphs, rigs, GLB files, pointer range and all animation clips are unchanged.

This applies in the shared renderer used by the floating companion and expanded conversation, including Original, Daylight and Soft Original. It does not paint the face on top of the entire scene or add a replacement light.

## Verification

The directional proof uses the three actual model versions with the real gaze/body controller at neutral, four cardinal directions and four diagonal directions. `before` uses the exact renderer from commit `6d5b35d` in an isolated temporary source file; `after` uses the current source. It never rewrites the live renderer or asset files. These wall-time animation samples are not frame-synchronized image diffs.

- [Before captures](../../../artifacts/sprout-gaze-glass/before/report.json)
- [After captures](../../../artifacts/sprout-gaze-glass/after/report.json)
- [Directional view after correction](../../../artifacts/sprout-gaze-glass/after/up-left.png)

Actual panel pointer sweeps pass for Daylight v007 and Soft Original v008 at the shipped 72px expanded and 96px compact sizes, covering nine directions, panel corners, moving and settled samples. Each version stays on its requested live GLB with no page/console errors, API calls or microphone activation. Visual review finds complete eyes/smile without displaced dark patches, including the closed-eye blink captured during a turn. The in-app Daylight panel was also inspected while looking down toward the transcript.

The nine existing eye/geometry tests and production build pass. The actual v008 UI joy, sleeping Zs, wake, Done interruption, pause/reduced motion and context-loss fallback test also passes. Live voice/provider integration is unchanged. Panel evidence: [Daylight](../../../artifacts/sprout-gaze-glass/panel/v007/integration.json), [Soft Original](../../../artifacts/sprout-gaze-glass/panel/v008/integration.json).

The [verified v008 pre-fix panel capture](../../../artifacts/sprout-gaze-glass/panel/before/v008/integration.json) records one successful replacement of the renderer module, including Vite query strings. Its artifact is much subtler than the user's large black patch; the exact GPU-specific severity was not reproduced headlessly. The correction excludes exterior face pixels from the refraction buffer by construction, and the fixed real-size panel captures are clean. Earlier captures without a verified route hit were discarded.

```powershell
$env:SPROUT_GLASS_PROOF='before'
node scripts/verify-sprout-gaze-glass.mjs
$env:SPROUT_GLASS_PROOF='after'
node scripts/verify-sprout-gaze-glass.mjs
npx playwright test tests/e2e/sprout-gaze-glass.spec.ts
npm run build
```
