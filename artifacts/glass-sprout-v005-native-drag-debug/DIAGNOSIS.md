# Bounded native title-drag diagnostic

2026-10-11. No product source changes. This failed diagnostic is separate from the accepted functional/native evidence and is not a physical-drag pass.

The isolated run used the actual compiled UI, Electron main/preload and the v005 asset. Its [report](native-behaviors/report.json) records start **07:48:05 UTC**, GLB SHA-256 `5090645ccbc11f1f577ca22373234a2f3f1d4409ba30876fdecc3af5041faeb2` and compiled index SHA-256 `3c6413b4e08468a79cf0a44f458ebf8d173bd8d40f87f7e66397c492df3211e0`. These hashes identify this diagnostic build, not a later rebuild. Recording was disabled. Historical accepted outputs were not overwritten.

Flags: `--asset=sprout-v005.glb --canonical=sprout-prism-v005.glb --proof-tag=glass-sprout-v005-native-drag-debug --physical-drag --no-record`, with `ELECTRON_DEBUG_DRAGGABLE_REGIONS=1` and `ELECTRON_ENABLE_LOGGING=1`.

## Observed result

Electron's native debug overlay visibly covered the Sprout identity/title card and reported region update 14. The title region was present while the panel's perspective plane was active. One Sky drag, derived from the current target-window screenshot, attempted **(158,58) → (43,50)** inside that visible region. The refreshed screenshot showed no visible change in window placement.

The script timed out after its bounded 60-second physical begin/end predicate at `verify-sprout-behaviors-native.mjs:552`. It did not reach the physical native-bounds assertion. The failure report does not retain the raw physical event array, so it establishes **no completed begin/end pair**, rather than proving that neither individual event ever occurred. Actual physical dragging and physical freeze/recovery remain **unverified**. The cause may involve input injection or native hit testing; this run does not distinguish them conclusively. The isolated window/process closed and the GPU slot was released.

Before that wait, the labelled fixture invoked the actual registered Windows hooks and verified the real IPC/consumer freeze, neutral settle, unchanged native bounds and hook retention through close/hide/show. Those are **simulated native-message callback checks**, not a physical pointer drag.

## Primary-source interpretation

Installed Electron is **44.7.0**; its [pinned DEPS](https://github.com/electron/electron/blob/v44.7.0/DEPS) selects Chromium **152.0.7977.130**. Chromium's [LayoutObject region collection](https://github.com/chromium/chromium/blob/152.0.7977.130/third_party/blink/renderer/core/layout/layout_object.cc) maps border-box coordinates through the transformed quad to an absolute bounding rectangle. There is no blanket transform/isolation rejection in that path. Electron's [region combiner](https://github.com/electron/electron/blob/v44.7.0/shell/browser/ui/drag_util.cc) applies ordered drag/no-drag rectangles; later overlapping rectangles win. The [debug overlay implementation](https://github.com/electron/electron/blob/v44.7.0/shell/browser/ui/draggable_region_debugger.cc) sets `accept_events=false`, so the diagnostic overlay is intentionally non-interactive.

Chromium main now explicitly refreshes transform changes without layout; that differs from the pinned 152 collector and suggests a stale-rectangle risk during transform-only updates. It does not explain this failed drag conclusively, particularly because the current native overlay visibly contained the attempted title point. Do not infer unsupported 3D drag regions from the timeout.

No fixed drag overlay or layout redesign is justified by this evidence. If a later controlled comparison proves projected-region failure, a minimal remedy would be an untransformed, non-focusable transparent sibling over only the title's neutral layout slot, retaining the visual identity inside the tilted plane and excluding all action controls. That remains a proposal, not an implemented fix.

Debug captures are diagnostic only; they are excluded from public deliverables. This run made no live provider/microphone request and makes no physical assistive-technology claim.
