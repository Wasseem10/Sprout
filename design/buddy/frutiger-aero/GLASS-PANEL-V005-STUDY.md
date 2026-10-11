# Glass interior study, v005

Recorded 2026-10-11; implementation and browser evidence, independent of the forthcoming character animation version. This change owns `src/buddy.css`, the decorative rim child in `src/DesktopBuddy.tsx`, and the two focused `scripts/verify-buddy-glass.mjs` / `scripts/verify-buddy-voice-button.mjs` proofs. Shared phase/behaviour props, the studio button reset, native materials and character animation remain lead/other-worker changes.

## Observed problem and selected treatment

The previous inner base used alpha 245/255, beneath further white/Prism overlays. Its decorative parent also filled the whole frame at alpha 153/255 before additional overlays. Those two bases alone combine to about 98.4% opacity. In matched empty-panel samples, the same central point changed only from RGB(223,230,243) on light to RGB(221,228,242) on dark. A declared blur therefore did not establish visibly translucent material.

The existing border, 31px outer radius, thickness, gradient colours and highlight/shadow constants remain. Its original full-box paint is now confined to the rim by an excluded-content mask. The masked child stays inside the opaque 1px border. The inner layer has a 14–25% base, static directional highlights and quieter cyan/lavender/coral reflections, with a 20px CSS backdrop blur over owned webpage pixels. The corresponding recorded centre now changes from RGB(223,234,247) on light to RGB(79,91,112) on dark. Busy stripes visibly influence the frosted interior.

Text never enters a filter or displacement layer. Individual occupied message/task/result regions receive restrained readable backing; empty reading space stays glass. The identity backing fits its text instead of filling the spare header column and feathers outside the glyph bounds. The composer retains its inset treatment. Tools deliberately stays dense and opaque to prevent conversation glyphs showing through. There is no new panel loop, pointer sampler, canvas, dependency or copied DOM texture.

Mic and Pause now share zero padding on every side and centred block SVGs. The obsolete playing-only left reset is removed. Styling consumes the lead's authoritative `data-phase`; it creates no voice state. Start/Pause names, pressed state and active Pause availability during work are unchanged. Reduced-transparency/increased-contrast preferences use solid surfaces; forced colours use system text/button colours and remove decorative glass; reduced motion preserves the existing static coordinator.

## Primary source study and attribution

Both sources were inspected at pinned revisions; neither package was installed and no substantial source implementation was copied.

- [rdev/liquid-glass-react, ac48eab](https://github.com/rdev/liquid-glass-react/blob/ac48eab18d1f7f444ae30002d240cae29c863a21/src/index.tsx), [MIT, MAX ROVENSKY](https://github.com/rdev/liquid-glass-react/blob/ac48eab18d1f7f444ae30002d240cae29c863a21/LICENSE). Its warped backdrop and sharp content are separate. Edge masking constrains chromatic displacement; separately masked directional rims supply thickness. This informed the bounded decorative rim and untouched content layer. Its displacement maps, shader generation, mouse deformation and RGB graph were not transplanted.
- [aberhamm/liquid-glass-react, 0e8da46](https://github.com/aberhamm/liquid-glass-react/blob/0e8da46da1da35055d60a027faea8e4cfae91088/src/liquid-glass.tsx), [MIT, Matthew Aberham and contributors](https://github.com/aberhamm/liquid-glass-react/blob/0e8da46da1da35055d60a027faea8e4cfae91088/LICENSE). Its default is frosted; Chromium refraction is an opt-in surface enhancement, with content kept separate. Its SVG path puts blur inside the filter because trailing CSS filter operations may be dropped. This reinforced progressive enhancement and restrained static layers. Copied-content refraction, adaptive sampling and library lifecycle machinery were not reused.

A test-only original SVG turbulence/displacement graph was tried in a 12px inner-edge mask on the first candidate. Its stills are under `artifacts/glass-panel-v005/lens`; this was before the final 1px rim-boundary correction. It added no useful visible depth beside the CSS frost and introduced another filter, so it was rejected. The shipped component contains no SVG refraction filter.

## Recorded evidence

- `artifacts/glass-panel-v005/before` and `after`: matched actual `DesktopBuddy`, local empty/populated props, fixed authored character PNG, 392×656 frame and 320CSSpx reflow, controlled light/dark/busy scenes. Final after run: **06:22:08 UTC**; 15 stills including Large/Tools/Stop and an error.
- `artifacts/glass-panel-v005-a11y/buddy-accessibility-audit.json`: final run **06:22:21 UTC**. Paired rendered-background/glyph-hidden PNG measurement: minimum recorded transcript **11.9587:1**, composer placeholder **7.7652:1**, blue OS **7.2329:1**, status **8.2072:1**. Overall sustained minimum **7.0807:1** includes unchanged compact financial content. Dark Large error prose independently measures **7.9207:1**.
- Computed SVG centre error **0px/0px** for Mic/Pause, with **0px** padding on all sides. Enabled icon contrast **8.6137:1** Mic and **11.3850:1** Pause. Active Pause remains enabled with processing/busy fixture props. No fixture API or microphone calls.
- `artifacts/glass-panel-v005/voice-hosts/report.json`: **06:27:36 UTC**, actual standalone panel and embedded studio. All 18 Idle/Listening/Speaking × normal/hover/focus cases have 44×44 controls, zero padding, exactly centred SVGs, correct Start/Pause names/pressed state and enabled icon contrast at least **8.6137:1**. No API/microphone calls. Two host screenshots are retained.
- Four existing desktop regressions passed: workspace draft/selection/manual scroll restoration; reduced-motion narrow panel; Ideas/Tools/modal focus; immediate Stop and busy permissions. Selection 5–15 backward and scrollTop160 were preserved. Typecheck passed.

Reproduce on the existing Vite server with `node scripts/verify-buddy-glass.mjs --proof-tag=glass-panel-v005 --stage=after` and the accessibility audit using its existing `--asset`, `--canonical` and `--proof-tag` options. Preserve the before directory as historical evidence; it cannot be recreated from the new CSS without restoring the original source.

## Native and verification limits

Integrated v004 followup: [delivery record](../sprout/DELIVERY-v004.md) links the accepted native bright/dark/busy captures, fixture-pixel validation, 200% zoom, authored behaviour recording and compiled performance/lifecycle checks. The final task caption also uses distinct block lines and a 5px gap when its duplicate message is omitted. This spacing-only fix does not change the measured colour tokens or reading-surface opacity.

[Electron documents](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations) that webpage CSS blur cannot sample underlying applications. The browser proof establishes filtering of owned webpage scenes, not OS refraction. The lead owns any isolated native Acrylic feasibility test and real 200% zoom/compositor evidence. Local text backing remains readable without native blur; no desktop capture is used at runtime.

The screenshots use honest local fixture messages, not AI responses. The no-WebGL authored PNG keeps character pixels fixed; it does not certify the new GLB/material/animations. Browser AX-tree/keyboard evidence is separate from a human screen-reader session. Recorded normal, Large, narrow and forced-colour cases are scoped checks, not blanket accessibility certification. Final acceptance of the native appearance and new character follows the lead's integrated proofs.
