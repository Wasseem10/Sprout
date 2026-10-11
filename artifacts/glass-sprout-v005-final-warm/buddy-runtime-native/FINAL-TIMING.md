# Final native timing scope

The final compiled UI **passes the separately labelled warmed-interaction and full lifecycle run**. Its first-use glass/tilt interaction still **fails** the unchanged zero-over-50 ms gate. Both results are retained; warmed acceptance does not erase the first-use tail.

| Retained run                                                                                            |  Feedback p95 |       Maximum | Above 20 / 50 ms | Result and scope                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------: | ------------: | ---------------: | ------------------------------------------------------------------------------------------------- |
| [Historical v004](../../glass-sprout-v004/buddy-runtime-native/report.json)                             |     16.781 ms |     16.916 ms |            0 / 0 | Passed earlier UI/asset/harness; historical baseline, without the new explicit plane-tilt sweep   |
| [Prior v005 candidate, first tilt](../../glass-sprout-v005/buddy-runtime-native/report.json)            |     16.779 ms |     99.951 ms |            3 / 1 | Failed full-window timing; lifecycle was not reached                                              |
| [Prior candidate, explicit tilt warm-up](../../glass-sprout-v005-warm/buddy-runtime-native/report.json) |     16.772 ms |     33.306 ms |            2 / 0 | Timing passed; overall report failed the stale five-versus-seven model-texture deletion assertion |
| [Final UI, first tilt](../../glass-sprout-v005-final/buddy-runtime-native/report.json)                  |     16.775 ms |     83.340 ms |            2 / 1 | Failed full-window timing; lifecycle was not reached                                              |
| [Final UI, explicit tilt warm-up](report.json)                                                          | **16.759 ms** | **33.286 ms** |        **1 / 0** | **Passed timing and full lifecycle**, 480 feedback intervals                                      |

These separate runs are not an isolated causal A/B benchmark: the v004 asset, UI and harness differ. None is a cold avatar-load measurement; the initial avatar and local thinking phase were already exercised. The final warm run additionally uses real pointer tilt in both directions before START (document clock 2025.8–3143.1 ms). Its interval filter and performance gate remain unchanged, and the complete timed window is retained. No post-hoc removal of first frames is used for acceptance.

Final identity: served `/buddy/sprout-v005.glb`, 1,445,476 bytes, SHA256 `5090645ccbc11f1f577ca22373234a2f3f1d4409ba30876fdecc3af5041faeb2`; renderer chunk `buddyRenderer-Ztm8NTJW.js`. Final `dist/index.html` SHA256 is `998d575c8ea38075ddcda18569fe34a094189d104943f7c7e0111386256b78e9`; its compiled index JS is `index-lf-oYFd9.js`, SHA256 `23cb3fd825f99c2c86167c76a574cf8c49b1729dda264a3917cc146ff06ba0b3`.

## Final first-use trace diagnosis

The worst feedback interval is **651027991683–651028075023** (83.340 ms). START is 651027865929 and first timed open is 651027916058; the gap begins about 75.6 ms after opening, during the first tilt sweep.

| Overlapping event                                                   | Process/thread           |        Start | Wall duration | Thread CPU |
| ------------------------------------------------------------------- | ------------------------ | -----------: | ------------: | ---------: |
| `RendererRasterWorker` / raster flush                               | GPU 95388 / 60340        | 651027981938 |     17.789 ms |   5.619 ms |
| `SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass`                 | GPU 95388 / 60340        | 651027999819 | **74.935 ms** |   9.225 ms |
| Largest overlapping renderer-main task, `ProxyMain::BeginMainFrame` | Renderer 112740 / 141084 | 651027992084 |      4.041 ms |   3.712 ms |

One shader-cache store occurs in the preceding raster flush and eight occur during the long Skia paint pass. Each `GrShaderCache::store` takes only 0.028–0.071 ms. The surrounding GPU-process paint/flush operations contain the delay; their wall duration substantially exceeds recorded thread CPU. This remains consistent with first-use Skia shader/pipeline creation and driver waits for the transformed glass path. The captured categories do not expose individual driver compilation calls or identify the exact CSS shader, so that detailed cause remains an inference. No long avatar callback, asset parse or PMREM event explains this interval.

The final glass fix places `backdrop-filter: blur(14px) saturate(112%)` on the animated `.buddy-panel-glass` owner ([CSS](../../../src/buddy.css#L332)); the pointer plane uses perspective rotation ([hook](../../../src/useBuddyTilt.ts#L101)). The warm-up exercises that real rendering path rather than replacing the filter, pose or product renderer. The first-use latency is still an unresolved performance limitation if acceptance requires the first interaction to remain below 50 ms.

First-use trace: `.local/glass-sprout-v005-final/buddy-runtime-native/chromium-trace.json`, 45,617,453 bytes, SHA256 `ce90dd8207acc6637623fc61f97d7f76f36af77b5839c74d385c273ec3fe3ec8`. Warm trace SHA256 is `ea542365f4a7cb6f832c0077be97a556da20b12fb8bc2440cf1b147e50768c17` (45,328,958 bytes). The earlier 99.951 ms diagnosis remains in [FIRST-USE-TIMING.md](../../glass-sprout-v005/buddy-runtime-native/FIRST-USE-TIMING.md).

## Accepted lifecycle and limits

The final warmed run passes five panel cycles, draft/reversal continuity, zero settled decorative callbacks, actual offscreen/native hide/minimize suspension and restoration, and disposed-owner no-restart checks. Both eye morph textures are explicitly deleted; the exact six pinned Three internal texture handles remain the permitted residual profile. Geometry/buffer/program/shader/VAO counts reach zero, the disposed context is lost, and its callbacks/draws remain zero. The earlier resource failure was an obsolete explicit-delete count, not an observed eye leak ([resource diagnosis](../../glass-sprout-v005-warm/buddy-runtime-native/RESOURCE-NOTES.md)).

The timing values are Chromium presentation-feedback intervals, not verified hardware scanout or causal input-to-first-pixel latency. Hardware clock/completion flags are absent. Tracing and WebGL/rAF wrappers add overhead; no screenshot, recording or memory dump runs inside timing. These are bounded local native UI/fixture results, with no live microphone/provider/backend verification or total-VRAM/GC claim. A 33.286 ms warmed maximum also means this run does not prove every frame met a 16.7 ms budget.
