# Sprout: light glass and quiet menus

2026-10-11. The user's review rejected the dark v007 material and repeated glossy menu rows. This revision replaces that appearance. Avatar assets, animation, voice, data, layout coordination and tilt behavior are unchanged.

The panel now uses one light translucent sheet with dark ink, aqua/lavender corner reflections and a thin highlight. Its base alpha varies from 67% to 72%; backdrop content remains visible through a 10px blur. The selected surface is shown on [light](../../../artifacts/glass-clear-v008/after/panel-392-populated-light.png), [dark](../../../artifacts/glass-clear-v008/after/panel-392-populated-dark.png) and [patterned](../../../artifacts/glass-clear-v008/after/panel-392-populated-busy.png) backgrounds. These are actual component captures, not concept renders. Clear glass necessarily picks up the brightness and colour of its backing; the dark studio yields a cooler grey surface.

The dropdown is one light frosted surface with plain rows, a quiet hover/active tint and keyboard focus. Rows have no glass pseudo-elements, bevel, border or individual shadow. The composer no longer creates a backdrop root, so the popup can sample the transcript behind it. The popup is intentionally denser than the main sheet to prevent overlapping transcript text from competing with its labels. See the [actual studio Tools menu](../../../artifacts/glass-clear-v008/studio-tools.png).

Chat messages and the header have no separate fill. The composer uses a very light transparent tint. Mic/Pause, Send and disclosure pills retain restrained aqua/lavender highlights; Stop and Collapse are quiet unboxed icons. This replaces the repeated neon outlines and inset dark centres of v007. All targets remain at least 44px.

The mask/rim mechanism remains adapted from the pinned MIT [Liquid Glass React source](https://github.com/rdev/liquid-glass-react/blob/ac48eab18d1f7f444ae30002d240cae29c863a21/src/index.tsx#L469-L565), with the existing [license notice](LIQUID-GLASS-REFERENCE-LICENSE.txt). The source's full React component and SVG refraction system are not imported. Palette, restraint and surface hierarchy are local design choices.

## Verification

- [Composited readability audit](../../../artifacts/glass-clear-v008/buddy-accessibility-audit.json): sustained reading minimum **8.1679:1** across 320/392px, light/dark/patterned backdrops, normal/Large text. Keyboard, forced colours and immediate Stop checks pass. Error prose separately measures **7.6412:1** in the material board.
- [Material board](../../../artifacts/glass-clear-v008/after/report.json): 20 captures; Mic **14.5196:1**, Pause **14.3134:1**, zero centring error. Reduced-transparency/increased-contrast produce solid light controls and dock. The hover/press audit now reads the actual icon colour instead of assuming white; acceptance thresholds are unchanged.
- [Active-tilt frosting](../../../artifacts/glass-clear-v008/active-tilt/report.json): on both ±1.15102° yaw extremes, measured backdrop edge step falls from 50 to 2.6667 with current blur ownership; fixed input bounds remain unchanged. This confirms webpage background sampling, not OS-wide desktop blur.
- Default/public builds and 12 focused browser cases pass. [Actual Electron checks](../../../artifacts/glass-clear-v008/buddy-panel-native-verification.json) pass native IPC, corner bounds, workspace return, draft/selection/scroll preservation, reversal and 200% zoom. See the [native bright background](../../../artifacts/glass-clear-v008/buddy-panel-native-prism-bright.png). API responses are intercepted local fixtures; this is not a provider rehearsal.

Reproduce with the existing glass, accessibility, tilt and native panel scripts using `--proof-tag=glass-clear-v008`. Use a new tag for later revisions. The 12 focused browser cases use `INSIGHTOS_PROOF_TAG=glass-clear-v008`.

The Electron window remains translucent, but CSS cannot frost other applications behind it. This pass does not claim to resolve the previously documented first-use timing hitch or verify live microphone/provider sessions. The [v005 delivery](../sprout/DELIVERY-v005.md) remains the source for avatar/behavior validation and those limits.
