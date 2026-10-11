# Sprout appearance reference and comparison modes

The user's preferred compact Sprout screenshot matches the preserved **Original Blender still**, `public/buddy/sprout-v005.png`. Its soft lavender/blue body and restrained rim are the visual target for a future animated-material pass. The image remains unchanged (SHA256 `1142a9ef44f70e13813e0ee542672852a7c2b5bbf5e87f89eb9c747159af6277`).

## Why two options appeared to produce four looks

Original selects `sprout-v005.glb` with tapered reflection lighting. Daylight selects `sprout-v007.glb` with daylight lighting. Each model also has a Blender-rendered PNG, shown during loading or if WebGL is unavailable. Those PNGs do not match the browser lighting exactly. The screenshot corresponds visually to the Original PNG; inspecting the open review tabs later showed both live models could load successfully. No persistent model-selection race was reproduced.

## Review changes

The standalone panel now separates **Sprout appearance** from **Rendering: Animated 3D / Still reference**. The status line identifies live rendering, loading, fallback or intentional reference viewing. Reference mode loads no 3D model and supports returning to the animated version while retaining the conversation draft. The render adapter also checks the current asset/mode identity before exposing readiness, preventing an old ready flag from being attributed to a newly selected canvas.

Open the [preferred Original reference](http://127.0.0.1:5173/?studio=panel&material=pearl&asset=sprout-v005&render=reference). Pearl remains at 40%; collapse the panel to compare the compact companion. Select Animated 3D to compare its current live counterpart.

This preserves the exact preferred reference; it does **not** claim that the animated material already matches it. A follow-up material/lighting pass should retain v007's current speaking animation and other behavior clips rather than replace the production model with the older v005. Production keeps its animated default. Neither GLB nor PNG assets were modified in this change.

## Verification

All five focused browser checks pass, covering repeated and rapid Original/Daylight selection, draft retention, reference-to-live switching, the reference URL without GLB requests, delayed loading and WebGL context loss. The existing standalone-panel interaction/accessibility test (including 320px layout) and production build also pass. Direct browser captures:

- [Original live 3D](../../../artifacts/sprout-appearance-v001/live-original.png)
- [Original still reference](../../../artifacts/sprout-appearance-v001/reference-original.png)
- [Preferred compact reference with controls](../../../artifacts/sprout-appearance-v001/reference-original-compact.png)

```powershell
npx playwright test tests/e2e/sprout-daylight.spec.ts tests/e2e/buddy-panel-preview.spec.ts
npm run build
```
