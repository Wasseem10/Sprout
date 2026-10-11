# InsightOS stack and audio-avatar audit

Prepared **2026-10-10**. This reviews a proposed stack against the existing InsightOS companion. It creates no dependencies, voice changes, assets or runtime tests. The objective is the Sprout/Prism desktop buddy and its readable panel.

## Verified baseline

Compared upstream master **`f1423fd`** with UI HEAD **`a13bd13`**. Both contain exactly the same `src/voice.ts` blob: **`86b3829ac31db2fd02156fa6ac29f2d27da9c7ac`**. Upstream already has React 19, TypeScript, Vite, Electron and ElevenLabs. The UI branch adds direct Three **0.186.1**, an authored Blender Ribbon GLB, fallback artwork and a visual studio; these draft changes are not merged upstream.

The [current package](../../../package.json) has no Next.js, R3F, Drei, GSAP, Motion, Zustand, Rapier or VRM dependency. A technology named in a proposal is therefore not evidence that it is installed or required. Sprout itself is planned; Ribbon v001 is the implemented asset.

## Keep, add or defer

| Stack item                              | Classification                          | Decision for InsightOS                                                                                                                                                         |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React, TypeScript, Vite, Electron       | **Already implemented upstream. Keep.** | Extend the existing floating window, HTML controls and application flow. Preserve backend ownership and Electron security.                                                     |
| ElevenLabs speech and transcription     | **Already implemented upstream. Keep.** | Preserve Scribe, TTS, interruption, fallback recording and provider configuration. An avatar does not need another voice SDK/session.                                          |
| Blender → GLB → direct Three            | **Implemented on UI branch. Keep.**     | Prove the actual Sprout asset through this renderer before replacing its host. Retain Ribbon/fallback until acceptance.                                                        |
| R3F and selected Drei helpers           | **Already planned; not installed.**     | A bounded wrapper can reuse the proven asset/controller. Add only helpers with a concrete purpose; do not duplicate loaders, mixers or render loops.                           |
| Next.js and Vercel                      | **Optional host plan.**                 | Vercel already serves the Vite public preview. Next is a later browser-shell choice, not a prerequisite for desktop animation.                                                 |
| CSS / Web Animations; Motion            | **Panel plan; optional library.**       | Start with the existing CSS/WAAPI coordinator contract. Add Motion only when a demonstrated layout/reversal problem warrants it.                                               |
| GSAP and scroll orchestration           | **Exclude from this slice.**            | A compact floating conversation has no requested scroll-driven hero sequence. Avoid parallel animation owners.                                                                 |
| Zustand                                 | **Defer.**                              | Existing React state/refs suffice for the bounded visual adapter. Add a store only for a demonstrated shared-state problem.                                                    |
| Rapier                                  | **Defer.**                              | First motion uses authored FK/morphs and controlled gaze. A physics runtime adds a separate simulation budget without a required physical interaction.                         |
| Mixamo, VRM, `three-vrm`                | **Exclude for Sprout.**                 | Sprout's original nonhuman rig does not need a humanoid interchange system. Keep its own semantic controls.                                                                    |
| GLSL displacement / custom jelly shader | **Defer until measured need.**          | Prove authored morphs, face stability, normal flow and bounds first. Use ordinary materials initially. A shader cannot silently become another writer of the same deformation. |
| Measured audio envelope                 | **Useful missing capability.**          | Add a narrow read-only input/output meter through the existing voice owner after the phase-driven proof works.                                                                 |

Adobe states that Mixamo's auto-rigger and animation library support **bipedal humanoids**. VRM's humanoid definition requires a human bone structure, including head, hips, spine, arm/hand and leg/foot chains. Those constraints do not match the selected Sprout anatomy. This is a fit decision, not a judgment of those tools. [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html), [VRM humanoid definition](https://vrm.dev/en/vrm1/humanoid/).

## What the voice and avatar actually do

The [voice owner](../../../src/voice.ts) uses `useScribe` at line 35. Partial transcripts at line 95 can stop old playback or pending TTS and immediately return to listening. Automatic fallback recording creates an input analyser around line 288, calculates RMS every **80 ms**, and uses it for silence/interruption decisions. That analyser is internal; the returned API exposes no level.

Speech output creates `Audio` elements from fetched TTS blobs around lines 450 and 499. There is **no output analyser**. The `speaking` phase is set before the fetch completes, so phase does not prove that audible playback has started. Realtime microphone samples are not presently exposed either; do not assume volume getters from another ElevenLabs API apply to Scribe.

[AssistantSignal](../../../src/AssistantSignal.tsx) maps voice/task state to visual phase. Its [renderer](../../../src/buddyRenderer.ts), around line 195, generates a phase-driven sinusoidal pulse. This is decorative state animation, **not measured audio reactivity or lip-sync**. Current HTML status stays meaningful without the canvas.

## Proposed narrow audio contract

The voice owner remains responsible for capture, output, cancellation and lifecycle. The avatar reads phase plus optional meter refs; it never starts a microphone, replaces a provider or infers task state from loudness.

| Read-only field          | Proposed meaning                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`                  | Existing authoritative voice phase, combined with task state through the presentation adapter.                                                                                                 |
| `inputLevel`             | Optional finite normalized 0–1 intensity from the already-owned input path. Unavailable in a mode without an accessible source.                                                                |
| `outputLevel`            | Optional finite normalized 0–1 intensity from the current owned playback; zero during fetch, waiting, pause, end, error or cancellation.                                                       |
| Availability / freshness | Per-source availability, sample time and session/generation identity. Missing, stale or superseded samples render as zero. Silence and an unavailable meter remain distinguishable internally. |

Reuse the fallback analyser where practical without changing its VAD thresholds. Investigate a supported realtime source within the existing Scribe owner; leave that meter unavailable if none exists. Never open a second microphone solely for decoration.

MDN demonstrates waveform sampling through an `AnalyserNode`; a normalized, bounded RMS envelope is sufficient for this design. Its media-element source API can connect the existing TTS element, but **reroutes playback through an AudioContext graph**. Any such change must belong to the voice owner and preserve one audible destination, resume behavior, cancellation and cleanup. Meter failure must preserve speech and degrade to phase-only visuals. [Web Audio visualization guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API), [media-element source documentation](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource).

The renderer samples numeric refs inside its existing frame loop, with elapsed-time attack/release and a bounded maximum. Avoid per-frame React state updates. Start with a subtle light/material response; only later modulate authored body motion through its single compositor. Keep the face calm and readable. Amplitude is not phonemes or visemes; mouth animation remains deferred by the [canonical motion contract](ANIMATION-WORKFLOW.md).

## Acceptance gates for the future change

These are proposed checks, not tests passed by this audit:

- Interrupt old speech during fetch and playback. Phase/status/Stop respond immediately; old samples and callbacks cannot revive its audio or pose.
- Verify silence, unavailable meters, suspended context, pause/end/error, permission refusal and rapid new sessions. Preserve transcription, existing spoken interruption and audible output.
- Keep keyboard focus, draft, text layout, reduced motion, Pause motion, PNG fallback and WebGL recovery working independently of meters.
- Label studio events and envelopes as synthetic. Do not open its microphone. Preserve the public deployment's [microphone-denying policy](../../../vercel.json); full voice validation belongs to the local companion.
- Measure active reaction/panel motion toward the proposed 60 fps target, including audio sampling and decoding. Record device, frame intervals/stalls and memory; current 15/30 fps renderer caps are baseline behavior, not achieved smoothness.

The next step remains the actual four-clip Sprout proof, followed by a small voice-owned meter extension if it adds useful expression. No broad stack migration is needed to begin.
