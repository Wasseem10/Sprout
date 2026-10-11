# Sprout Prism glass: material correction

Historical material. The subsequent [light glass and quiet-menu revision](SPROUT-CLEAR-GLASS-v008.md) supersedes this appearance after the user's visual review.

2026-10-11. This revision responds to the user's review of the pale panel and controls. Earlier glass studies remain historical records; their screenshots do not represent this material.

## Material and hierarchy

The expanded panel is one continuous cool navy glass surface with visible aqua and lavender reflections, light text, and a quiet perimeter. The white backing behind the Sprout identity is removed. Assistant replies and the welcome state have no separate card fill; user replies retain only a faint tint and fine outline. The composer is a translucent dark well. These changes remove the pale cutouts that fragmented the previous panel while preserving readable HTML.

Mic/Pause, Send, Ideas and Tools now share clear dark centres, cyan lower-edge caustics, lavender upper reflections and fine bright glints. Their colour comes from the material layers themselves, so the effect remains visible over a quiet background. The panel reflections are broader and calmer than the controls. Keyboard focus remains a separate, explicit outline; it is not part of the glass rim.

The sheet owns `blur(22px) saturate(160%)` directly. Keeping the filter on the animated sheet preserves webpage frosting during the coordinator's retained opacity animation and pointer tilt. Controls use their own `blur(12px) saturate(170%)`; text and icons remain sharp.

## Source reuse

The paired masked rims, screen/overlay composition, inset lighting and reflection treatment are directly adapted from [Liquid Glass React, pinned ac48eab, `src/index.tsx` lines 469–565](https://github.com/rdev/liquid-glass-react/blob/ac48eab18d1f7f444ae30002d240cae29c863a21/src/index.tsx#L469-L565). The existing [MIT notice, copyright 2025 MAX ROVENSKY](LIQUID-GLASS-REFERENCE-LICENSE.txt) is retained; the [upstream license](https://github.com/rdev/liquid-glass-react/blob/ac48eab18d1f7f444ae30002d240cae29c863a21/LICENSE) permits this adaptation.

Sprout's palette, caustic gradients, dimensions and state styling are authored locally. Existing semantic buttons and interaction owners are retained. No dependency, upstream mouse-state loop, elastic transform or SVG refraction component was added. The supplied reference is a raster image with no identified implementation; this delivery does not claim to copy that image's exact source code.

## Evidence

- [Actual-component material captures](../../../artifacts/glass-prism-v007/after/report.json) include light, dark and busy backgrounds, empty and populated conversations, 320/392-pixel layouts, Large text, Tools/Stop, and normal/hover/focus/pressed/disabled controls. See the [dark panel](../../../artifacts/glass-prism-v007/after/panel-392-populated-dark.png) and [control board](../../../artifacts/glass-prism-v007/after/buttons-normal.png).
- The [HTML accessibility audit](../../../artifacts/glass-prism-v007/buddy-accessibility-audit.json) records minimum sustained-reading contrast of **7.2444348901:1** against actual composited backgrounds. Its glyph-location mask measures backgrounds beneath painted text rather than unrelated corners of a whole text rectangle. This is an HTML/pixel audit, not a physical screen-reader session.
- The [active-tilt optical comparison](../../../artifacts/glass-prism-v007/active-tilt/report.json) passes at **−1.15102° and +1.15102° yaw**. In the same empty reading-well strip, the maximum adjacent RGB step falls from **26.333 to 2**, or **7.59%** of the unsoftened value. The matched “before” temporarily recreates the failed descendant-filter ownership; “after” uses current product CSS. This demonstrates actual webpage frosting during tilt, not merely a declared blur property. It is not timing evidence.

- [Actual WebGL studio capture](../../../artifacts/glass-prism-v007/studio-speaking.png) shows the same speaking state as the user's review. The [ready state](../../../artifacts/glass-prism-v007/studio-ready.png) includes enabled Mic and Send. [Capture scope](../../../artifacts/glass-prism-v007/studio-report.json): actual embedded component, no CSS overrides, paused motion for stills, simulated voice state, zero API requests/errors.
- The final material board measures Mic at **10.2092:1**, active Pause at **10.6673:1**, and the lowest checked enabled hover/press/focus icon at **7.7820:1**. Mic/Pause centres have zero offset and controls retain 44px targets. Both reduced-transparency and increased-contrast preferences are tested with held Pause, active voice, expanded Collapse and the collapsed dock: all use opaque surfaces without glass filters or rims. The normal board explicitly clears prior keyboard focus; focused captures retain the separate accessible outline.
- [Native window verification](../../../artifacts/glass-prism-v007/buddy-panel-native-verification.json) passes actual Electron IPC, corner bounds, workspace return/topmost, draft/selection/scroll preservation, reversal and 200% zoom. See the [bright native backing](../../../artifacts/glass-prism-v007/buddy-panel-native-prism-bright.png) and [200% native view](../../../artifacts/glass-prism-v007/buddy-panel-native-200-percent.png). Data and voice responses are local fixtures. These captures precede only the final preference-fallback correction; default material is unchanged.
- [Compiled native performance and lifecycle](../../../artifacts/glass-prism-v007/buddy-runtime-native/report.json) passes after an explicit tilt warm-up. The 7.803-second interaction records Chromium presentation-feedback intervals of **p95 16.763 ms, maximum 33.390 ms, zero over 50 ms**. This is similar to the previous warmed v005 result (16.759 / 33.286 ms). Avatar callback intervals are p95 16.8 ms, max 17 ms; resource/lifecycle cleanup passes. This does not retest first use or erase the earlier recorded 83.340 ms first-use hitch, and is not hardware-scanout certification.
- Default/public builds pass with the existing large-chunk advisory. Twelve focused browser cases pass across panel preview, tilt and native-acknowledgement behavior. The final material, preference, composited-contrast and active-tilt scripts pass; no voice/backend owner or behavior code changed.

## Reproduce

```powershell
node scripts/verify-buddy-glass.mjs --proof-tag=glass-prism-v007 --stage=after
node scripts/audit-buddy-accessibility.mjs --proof-tag=glass-prism-v007
node scripts/verify-buddy-tilt-frost.mjs --proof-tag=glass-prism-v007
$env:INSIGHTOS_PROOF_TAG='glass-prism-v007'
npx playwright test tests/e2e/buddy-tilt.spec.ts tests/e2e/buddy-panel-preview.spec.ts tests/e2e/desktop-panel.spec.ts
node scripts/smoke-buddy-panel.mjs --controlled-backgrounds --zoom-review --proof-tag=glass-prism-v007
npm run build:public
npm run build
node scripts/verify-buddy-runtime.mjs --warm-tilt --proof-tag=glass-prism-v007
```

Run GPU/browser/native checks sequentially against the existing local services. Future changes should choose a new proof tag to preserve this evidence.

## Scope and limits

The v005 Blender avatar, eye asset and animation system are unchanged. Data, voice ownership, panel coordination and the pointer-tilt controller are unchanged. Reduced-transparency, increased-contrast and forced-colour preferences retain readable fallback surfaces.

CSS backdrop filtering in the transparent Electron window can blur owned webpage content; it cannot frost other desktop applications. The native material therefore uses its continuous tint and authored reflections without any runtime desktop capture. Browser optical evidence should not be described as OS desktop blur.
