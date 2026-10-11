# First-use native glass/tilt timing

The retained full interaction **failed** its zero-over-50 ms gate: Chromium presentation-feedback p95 **16.779 ms**, maximum **99.951 ms**, three intervals above 20 ms and one above 50 ms. This diagnosis does not change the gate or convert the failed run into accepted evidence.

Evidence: [original report](report.json), [presentation intervals](presentation-feedback.csv), and `.local/glass-sprout-v005/buddy-runtime-native/chromium-trace.json` (46,137,542 bytes; SHA256 `1f41fc8a691746e63818cb6959ec925e0c1fb9c57757bd5e49432f9a0e79b07d`). Actual served v005 GLB SHA256 is `5090645ccbc11f1f577ca22373234a2f3f1d4409ba30876fdecc3af5041faeb2`.

## Observed stall

Trace timestamps are monotonic microseconds. The worst feedback interval is **650217222500–650217322451**. START is 650217113968, first timed open is 650217163465, and a real MouseMove is processed at 650217206128. The stall therefore begins about 59 ms after opening and during the first perspective-tilt sweep.

| Event                                                               | Process/thread         |        Start | Wall duration | Thread CPU |
| ------------------------------------------------------------------- | ---------------------- | -----------: | ------------: | ---------: |
| `RendererRasterWorker` / raster command-buffer flush                | GPU 120848 / 45432     | 650217213210 |     27.386 ms |   5.959 ms |
| `SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass`                 | GPU 120848 / 45432     | 650217241966 |     64.687 ms |   7.370 ms |
| `ProxyMain::BeginMainFrame`, largest overlapping renderer-main task | Renderer 16644 / 71440 | 650217307462 |      6.086 ms |   4.099 ms |
| Nearby `WebGL` command-buffer flush                                 | GPU 120848 / 45432     | 650217212382 |      0.801 ms |   0.643 ms |

Ten `GrShaderCache::load`/`store` pairs appear between START+100.144 and +192.360 ms. Two stores fall inside the raster flush; eight fall inside the long Skia paint pass. Each store itself lasts only 0.024–0.063 ms. The expensive time is inside the surrounding raster/paint operation, with substantial wall time beyond recorded thread CPU, rather than the small cache write calls. This is consistent with first-use Skia shader/pipeline creation and driver waits; the captured categories do **not** expose the individual driver compilation calls or identify the exact CSS shader.

No long avatar JavaScript, GLB parse, PMREM setup or WebGL shader compilation is visible in this interval. The longest renderer-main complete event in the entire timed trace is 10.408 ms. The report's avatar callback CPU maximum is 2.6 ms. This places the dominant observed stall in Chromium's GPU-process HTML raster/compositor path.

## Source correlation and next measurement

The warm-up in [`verify-buddy-runtime.mjs`](../../../scripts/verify-buddy-runtime.mjs#L464) opens the panel and exercises thinking, then closes it. It does not exercise the pointer-driven perspective plane before START. The first real sweep occurs inside the timed interaction at line 517. [`useBuddyTilt.ts`](../../../src/useBuddyTilt.ts#L101) changes the plane from `none` to `perspective(1800px) rotateX(...) rotateY(...)`; that plane contains the glass with [`blur(14px) saturate(112%)`](../../../src/buddy.css#L371). First use of this transformed glass path is the strongest source-level explanation, but remains an inference rather than an isolated A/B result.

Preserve the full failed report/CSV/trace hash as **first-use interaction** evidence. A separately tagged warmed-interaction run can explicitly exercise real pointer tilt in both directions, settle, and exercise editing before START, while retaining the same full-window interval filter and strict gate. Report both scopes: a warmed pass would establish warmed behavior only and would not satisfy or erase the first-use tail. This run already warmed the avatar; it is not a fresh-process cold avatar-load measurement.

As diagnostic context only, the 473 retained intervals after the first burst have maximum 33.352 ms, two above 20 ms and zero above 50 ms. That post-hoc split is **not** a replacement acceptance calculation. Any product optimization intended to improve first-use latency needs its own first-use proof; no filter downgrade or speculative renderer change is justified by this trace.

## Resource and presentation limits

Five panel cycles preserve all live WebGL handle counts: textures 13, framebuffers 6, renderbuffers 4, buffers 28, programs 7, shaders 0 and vertex arrays 13. Texture/FBO/RBO creation and deletion increase together by exactly 11/22/33, matching the previously classified transmission-target resize signature. Every other cumulative count is unchanged. This trace provides no evidence of a growing avatar resource leak. Disposal assertions were not reached after the performance gate failed, so these cycle counts do not independently prove final disposal or driver memory reclamation.

`AnimationFrame::Presentation` timestamps are Chromium presentation feedback. The trace lacks hardware-clock/completion flags and causal first-response pixel attribution; verified physical scanout remains unclaimed. Test-only tracing and WebGL/rAF wrappers add overhead. No screenshots, recording or memory dumps ran inside this timed window.
