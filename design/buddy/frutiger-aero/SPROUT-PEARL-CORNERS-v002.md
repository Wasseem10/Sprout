# Sprout pearl: 40% and clean lower corners

The user confirmed **40%, the slider maximum**, as the preferred texture strength. The opt-in [Pearl preview](http://127.0.0.1:5173/?studio=panel&material=pearl) now starts there. A normal panel preview and the production desktop companion keep their existing appearance.

The generated image's baked white rim doubled the live glass edge at the lower corners. Two intersecting radial alpha masks now soften only the texture in those two 58px corner regions. The PNG, 108% overscan, white center, readable lens, controls and avatar are unchanged. This is a compositing correction, not a regenerated image or redesigned panel.

## Visual evidence

- [Before at 40%](../../../artifacts/sprout-pearl-corners-v002/before-40.png)
- [Selected 58px correction at 40%](../../../artifacts/sprout-pearl-corners-v002/candidate-58.png)
- [Broader 82px candidate, rejected](../../../artifacts/sprout-pearl-corners-v002/candidate-82.png)
- [Pixel comparison](../../../artifacts/sprout-pearl-corners-v002/corner-delta.json)

These are direct browser captures. Adding the mask introduces minor raster rounding differences, including a maximum two-channel-value difference in the sampled center; unchanged source and center styling do not imply pixel-identical compositing.

## Verification

The [report](../../../artifacts/sprout-pearl-corners-v002-verification/report.json) passes all fifteen comparisons: Current and Pearl at 18%, 26%, 34% and 40%, on light, dark and busy backgrounds. At the accepted 40% strength:

| Background | Minimum sampled reading contrast | Capture                                                                                     |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| Light      | 15.59:1                          | [Panel](../../../artifacts/sprout-pearl-corners-v002-verification/light-pearl-40-panel.png) |
| Dark       | 10.68:1                          | [Panel](../../../artifacts/sprout-pearl-corners-v002-verification/dark-pearl-40-panel.png)  |
| Busy       | 12.12:1                          | [Panel](../../../artifacts/sprout-pearl-corners-v002-verification/busy-pearl-40-panel.png)  |

The run also verifies the 40% initial strength, Current without opt-in, retained draft and mounted input, keyboard focus/menu dismissal, 320px layout, large text, 200% CSS zoom, stationary content during decorative tilt and accessibility overrides. There were no API/external requests, microphone attempts or page errors. The production build and formatting checks passed. Visual inspection confirmed the smaller corner correction preserves the preferred material and center.

The served PNG remains 1,724,447 bytes, SHA256 `4b3fcc8ed1c8c429b175dee3c4046d8d677da8f9bf2d08eb1c924d774a5d6db1`.

Reproduce with the existing local UI server running:

```powershell
node scripts/verify-generated-glass-preview.mjs
npm run build
```

Contrast measurements apply to the captured content and owned backgrounds. CSS zoom is not native Electron zoom; this pass does not claim native desktop acceptance or a performance benchmark. Production adoption remains a separate decision.
