# Sprout floating dock v009

The collapsed companion now shows Sprout and a floating microphone, without the rectangular name/status card or separate hide button. Clicking Sprout opens the existing conversation panel. Its native button semantics, Enter/Space activation, expansion state and focus restoration stay intact. Status remains available to screen readers; the name/status text remains visible in the expanded header. Hide to system tray remains in Tools. Stop is available whenever a task or voice session is active.

The surrounding collapsed header remains a native drag region. Avatar, microphone and Stop are separate no-drag controls. Existing native dimensions, bounds and resize coordination are unchanged. An expansion failure places its retry notice beneath the controls within the small window.

Typing no longer creates a square outline inside the composer. Focus belongs to the rounded outer glass surface. Button focus rings remain, and increased-contrast/forced-colors modes use an explicit outer focus outline.

![Floating companion on a light surface](../../../artifacts/sprout-floating-dock-v009/browser/floating-light.png)

[Focused composer](../../../artifacts/sprout-floating-dock-v009/browser/panel-typing.png) · [Dark background](../../../artifacts/sprout-floating-dock-v009/browser/floating-dark.png) · [Forced-colors focus](../../../artifacts/sprout-floating-dock-v009/browser/panel-forced-colors-focus.png)

Verification: production build and TypeScript pass; nine existing panel-preview/desktop-panel browser cases pass, including keyboard disclosure, native acknowledgment/retry, preserved draft/selection/scroll, Stop availability and narrow reduced-motion layout. The [targeted browser inspection](../../../artifacts/sprout-floating-dock-v009/browser/report.json) checks the two idle controls, mic/pause fixtures, avatar keyboard disclosure, rounded focus, forced colors, and a 320px viewport; no API requests or page errors. The [native Electron check](../../../artifacts/sprout-floating-dock-v009/buddy-panel-native-verification.json) passes bounds/IPC, reversal, workspace return, tilt containment, background captures and 200% zoom. Native drag CSS is inspected; physical dragging and live voice are not claimed by these checks.

The Daylight v006 asset, original v005 asset, animation controller, light panel material, voice ownership and backend contracts are unchanged.
