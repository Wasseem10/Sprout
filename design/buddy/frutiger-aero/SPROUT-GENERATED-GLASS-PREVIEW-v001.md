# Sprout pearl material preview

An opt-in study applies the refined generated material behind the actual conversation panel. The production desktop companion keeps its current appearance. The study uses the existing `DesktopBuddy` with local sample messages, live avatar rendering and simulated controls; it owns no microphone, AI session or computer actions.

## Review

Open [Pearl study](http://127.0.0.1:5173/?studio=panel&material=pearl). **Glass material → Current / Pearl study** switches the surface without remounting the panel. **Texture strength** starts at 26% and adjusts from 12–40%. The existing light/dark/busy backgrounds and large-text switch remain available. A normal `?studio=panel` visit starts with Current. The embedded character Studio does not implicitly opt into this texture.

The generated sheet adds blue/aqua highlights, lavender and restrained coral reflections to the current pale lens. The center stays quiet for dark conversation text. On a dark backdrop, it reads as pale frosted glass rather than a completely clear sheet; the existing readable lens remains responsible for contrast.

## Implementation

- `src/BuddyPanelPreview.tsx` owns the preview selection and strength. There is no new production preference or persistence.
- `src/buddy-panel-preview.css` places the raster on `.buddy-panel-glass::before` inside the existing decorative tilt plane. It remains below Sprout, conversation text and all interactive controls. The real backdrop filter and pointer lighting continue to work independently.
- The texture is centered at 108% × 108% of the surface. This crops the generated outer alpha fringe and reduces the baked rim. The existing CSS radius defines the clean panel boundary; pixels in the source PNG are unchanged.
- Reduced transparency, increased contrast and forced colors hide the decorative image. Reduced motion retains the still material while the existing tilt/motion rules apply.
- The current CSS lens remains available if the image fails to load. Material changes retain draft, selection and scroll ownership.

The runtime texture is `public/buddy/sprout-glass-material-v002.png` (1,724,447 bytes). It is the same PNG as the [refined concept](image-concepts/sprout-glass-material-v002.png). [Initial study](image-concepts/sprout-glass-material-v001.png) and [exact generation/refinement prompts](SPROUT-GENERATED-GLASS-PROMPTS-v001.txt) record its provenance. Generation happened during asset creation; loading the preview makes no image-generation request.

## Evidence

The [verification report](../../../artifacts/sprout-generated-glass-v001-verification/report.json) records twelve matched comparisons: Current and Pearl at 18%, 26% and 34%, each on light, dark and busy backgrounds. All pass the sampled reading-text target of 7:1 and label target of 4.5:1. At the proposed **26%** starting strength:

| Background | Minimum sampled reading contrast | Actual capture                                                                                                                                                                                 |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light      | 16.05:1                          | [Current](../../../artifacts/sprout-generated-glass-v001-verification/light-current-panel.png) / [Pearl](../../../artifacts/sprout-generated-glass-v001-verification/light-pearl-26-panel.png) |
| Dark       | 9.96:1                           | [Current](../../../artifacts/sprout-generated-glass-v001-verification/dark-current-panel.png) / [Pearl](../../../artifacts/sprout-generated-glass-v001-verification/dark-pearl-26-panel.png)   |
| Busy       | 11.44:1                          | [Current](../../../artifacts/sprout-generated-glass-v001-verification/busy-current-panel.png) / [Pearl](../../../artifacts/sprout-generated-glass-v001-verification/busy-pearl-26-panel.png)   |

The minimum sampled label contrast across all twelve cases is 5.62:1. Paired unedited screenshots, with text shown and then hidden, locate glyphs and measure their computed foreground against the actual composited background. These results describe this captured content and these owned backgrounds; they are not a universal accessibility certification or physical-display measurement.

The same run verifies the default Current selection, exact served asset hash, retained draft and mounted input across texture changes, keyboard focus/menu dismissal, a 320px viewport, large text, 200% CSS zoom and fixed content bounds during both tilt directions. Reduced transparency, increased contrast and forced colors remove the texture; reduced motion neutralizes tilt. There were zero API/external requests, microphone attempts or page errors. The existing panel-preview interaction/Axe regression, TypeScript, production build, formatting and whitespace checks also pass.

Visual review of the light/dark/busy, narrow and enlarged captures finds clean CSS boundaries without the source image's ragged outer alpha edge. The texture adds visible depth without an internal card or text cutout. It remains visibly frosted over dark content, and the busy background is still visible through the live lens. **26% is the review starting point; adoption into the production default remains pending visual preference.**

The images are direct browser captures of the actual component, not generated mockups of text or controls. The source PNG contains a decorative material only. Source/runtime texture SHA256: `4b3fcc8ed1c8c429b175dee3c4046d8d677da8f9bf2d08eb1c924d774a5d6db1`.

Reproduce with the existing local UI server running:

```powershell
node scripts/verify-generated-glass-preview.mjs
npx playwright test tests/e2e/buddy-panel-preview.spec.ts
npm run build
```

This study is not native Electron acceptance or a performance benchmark. It does not change voice, task states, Blender assets or backend contracts. Any adoption into the production panel should follow review of the composited result, particularly its appearance on dark/busy backgrounds and the desired balance between gloss and transparency.
