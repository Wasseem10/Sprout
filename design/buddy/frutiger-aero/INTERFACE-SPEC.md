# Ripple: expandable Frutiger Aero interface proposal

**Status: design proposal, not an implemented interface.** Researched and inspected on 10 October 2026. Ripple is a working name for the original character proposed in this direction. This document changes no runtime files, native window settings, voice behavior, backend contracts, or financial logic. Dimensions, colors, motion, and new controls below are proposed review targets.

## Experience to build

Ripple is an ocean-blue jelly droplet with two navy oval eyes, white glints, and a tiny relaxed mouth. A polished steel ribbon cradles the lower body. The eyes give the companion an approachable presence; the interface makes its purpose clear through readable language and familiar controls.

The expanded interface should grow from this character into one compact conversation. Supporting details open beside it only when requested. Frutiger Aero comes through in clear blue, watery highlights, cyan light, an occasional lime or warm coral accent, and a softly frosted shell. The conversation remains a calm reading surface with strong typography.

The visual hierarchy is **character → conversation → requested detail**. A person should recognize the face, locate the current response, and find the next action without decoding a dashboard.

## What exists, and what needs to change

These are observations from the inspected source, not claims about the proposed design being shipped.

| Inspected area                                                                                        | Current implementation                                                                                                                                                                            | Proposed direction                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BuddyStudio.tsx](../../../src/BuddyStudio.tsx) and [buddy-studio.css](../../../src/buddy-studio.css) | Full-page charcoal editorial studio, sculptural core launcher, five simulated states, pause motion, expandable sample conversation, local draft field with sending disabled.                      | Keep truthful simulation labels and interactive checks; preview the cute character and glass shell over representative backgrounds. The studio frame is a review environment, not the production desktop dimensions. |
| [DesktopBuddy.tsx](../../../src/DesktopBuddy.tsx)                                                     | Native pill header with face, identity, voice button, stop task when applicable, expand/collapse and hide. Expanded view combines conversation, results, composer, and tools.                     | Let the pet lead the collapsed form. Preserve each existing action and its meaning while arranging the expanded controls around conversation.                                                                        |
| [buddy.css](../../../src/buddy.css)                                                                   | Opaque `#10191e` base beneath a radial tint, despite a `backdrop-filter` declaration. Main messages are 16px; some status and result/reference styles use 9–12px.                                 | Separate the frosted exterior from an opaque reading well. Increase essential status, result labels, and references instead of making metadata miniature.                                                            |
| Results in the native feed                                                                            | Energy, finance, and other result components occupy the narrow conversation stream.                                                                                                               | Show a short, truthful result summary in conversation; offer a named action to open existing details in an optional drawer. Moving content must preserve its data, actions, and reading order.                       |
| [electron/main.cjs](../../../electron/main.cjs)                                                       | Non-standalone window starts at 360 × 86. Resize modes request pill 360 × 86, panel 440 × 580, workspace 1350 × 900, clamped to display work area. The buddy window is frameless and transparent. | A freestanding pet, its focus halo, and an attached drawer need a separately planned native geometry change. CSS cannot fit a 96px pet plus clear margins inside the present 86px height.                            |

Existing keyboard access, motion controls, authored-image fallback, and context recovery are foundations to retain. They do not verify a new face, new glass treatment, or new native bounds. The existing studio has no real microphone or model connection; its simulated Listening/Speaking previews must continue to say so.

## Spatial composition

### 1. Collapsed: a pet within reach

**Proposed visual:** an 88–104px character within a roughly 112px launcher area, including a stable focus halo. Dock about 24px inside the usable display edge. Keep the face forward enough that both eyes are visible at actual desktop size. The ribbon passes below the eye band; it never sweeps across or reflects a bright stripe through the eyes. A short status label, when needed, sits on a solid small backing beside the pet and wraps rather than truncates essential state.

The pet is one semantic button. Clicking, Enter, or Space starts a brief acknowledging squash, then reveals the attached conversation. The acknowledgement should never block operation or require animation to finish. In reduced motion, open immediately and retain a still expression. The button name includes the action and current state, for example **“Open Ripple conversation. Ready.”** When expanded, the action becomes **“Collapse Ripple conversation. Listening.”** Actual listening comes from existing voice state; a visual preview says **“Listening preview”** instead.

Hover may move the eyes slightly toward the pointer and give one natural blink. Keep the body grounded in its cradle. Keyboard focus receives the same obvious readiness affordance without depending on hover. Do not add hover audio, cursor chasing across the desktop, exaggerated wobble, or an endlessly revolving eye band.

Provide explicit Hide and Move/Dock actions in the expanded menu, accessible from the keyboard. Dragging may remain a convenience, with a keyboard alternative. Restrict native drag regions to intentional handles so button presses and text selection work reliably.

### 2. Expanded: one conversation anchored to Ripple

**Proposed starting size:** a 392px-wide conversation surface, adaptable within roughly 360–440px, about 560px tall, bounded by the usable display height. Reserve real margins for the pet, shadow, and focus ring. These are prototype dimensions, not additions to current Electron resize modes.

Place Ripple at the upper outside corner nearest its dock origin. The shell opens away from the display edge. The face remains fully visible in a deliberate cutout or adjacent space; it does not cover the heading, response, composer, or close control. Align the reading well to one clear vertical edge, with 24px horizontal padding where space permits.

The panel has four functional zones in one continuous composition:

1. **Header:** Ripple's name, plain current status, and a clearly named collapse control. Secondary settings live in one More menu. The existing Stop task action remains directly available while a task is running.
2. **Reading well:** continuous conversation, with a small speaker label and generous message spacing. Give the latest meaningful response typographic priority. Use a restrained solid tint for the user's turn if needed, rather than a glass card around every message.
3. **Current action:** at most one visually dominant next action related to the response. A secondary “View details” link/button can open the drawer. Existing suggestions may remain as a short list when the conversation is empty; they should not become four equal feature tiles.
4. **Composer:** an opaque text field and a visible send control. Keep the existing voice start/pause meaning and handlers, with a 44–48px labelled voice control next to the composer or in a clearly separated header position. Optional attachment/tools stay subordinate. Do not make clicking the pet start the microphone.

Keep the composer visible while the conversation scrolls. At short heights or enlarged text, let the panel body reflow and reduce decorative space; do not shrink essential text or conceal the current keyboard focus behind the composer. Preserve draft, conversation scroll position, and task state on collapse and reopening. Clicking a different desktop app must not unexpectedly discard the conversation.

### 3. Detail: an optional reading drawer

**Proposed desktop layout:** conversation 392px + 12px gap + detail drawer around 336px. Open the drawer away from the dock edge, reversing the physical side when necessary. Preserve a predictable semantic order: conversation first, detail second. Keep the pet anchored instead of recentering the entire composition each time.

The drawer contains a specific requested document, result, source explanation, or existing action surface. It has one heading and one close/back control. It uses an opaque reading surface and a single scroll region, with the same body text rules as conversation. It is not a permanently visible analytics sidebar or a new financial dashboard. Preserve the provenance, calculations, confirmations, and action behavior of any content moved here.

On a 390px preview, or whenever both panes cannot fit comfortably, show the detail as a replacement view inside the same shell with **“Back to conversation”**. Keep draft and scroll position when returning. Do not squeeze two narrow columns together or leave an offscreen interactive drawer. Conversation and controls must also reflow at 320 CSS px. W3C's reflow guidance describes this narrow-width requirement; the single-pane replacement is our proposed way to meet it. [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

## Material and readability

### One glass shell, one dependable reading well

Use translucency on the exterior frame and supporting control band. Put conversation text, composer, result details, and critical status on opaque surfaces. A luminous rim, broad highlight, subtle shadow, and color reflected from Ripple can communicate glass without making long text transparent.

Microsoft recommends Acrylic for transient surfaces, discourages overlapping/adjacent Acrylic panes, and recommends opaque backgrounds for content-sectioning vertical panes. Customized tint and opacity need their own legibility checks; small accent-colored text on Acrylic is discouraged. These support a restrained shell and solid content here. [Microsoft Acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)

Mica is an opaque, wallpaper-informed foundation for persistent windows. Its contiguous content-layer pattern is useful hierarchy guidance; it is not a synonym for CSS blur. A future full workspace could adopt that logic separately from the transient buddy. [Microsoft Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)

Apple's Liquid Glass guidance reserves glass for a distinct control/navigation layer, advises against glass-on-glass and glass tables, and uses selective tint for emphasis. Its native materials adapt for legibility and accessibility. We borrow the hierarchy and anchored expansion idea; CSS does not inherit those native adaptive optics. [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

Spectrum's background layers distinguish content from selectively elevated floating UI. Its color guidance supports dark text on bright cyan/lime surfaces and text labels alongside color meanings. Use color to organize attention, keeping body text neutral. [Spectrum Background layers](https://spectrum.adobe.com/foundations/color/background-layers), [Spectrum Color](https://spectrum.adobe.com/foundations/color/color)

### Bright, dark, and busy backgrounds

| Environment                            | Proposed shell                                                                                         | Text-bearing surfaces                                                | Separation                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Bright editor or white page            | Cloud-blue frost with an initial tint opacity around 0.80–0.88.                                        | Opaque cloud surface, navy text.                                     | Darker external keyline and soft shadow; a bright highlight alone disappears on white.             |
| Dark terminal or wallpaper             | Deep ocean frost with an initial tint opacity around 0.78–0.88.                                        | Opaque deep-ocean surface, cloud text.                               | Clear restrained rim plus shadow. Use a readable keyline; darkness alone does not define the edge. |
| Busy/colorful wallpaper or application | Same chosen light/dark theme, with a more substantial shell if validated native material is available. | The same opaque reading wells; no uncontrolled scenery beneath text. | Avoid sampling scenery to flip large panels between light and dark while someone reads.            |
| Solid surfaces / higher contrast       | Opaque theme surface; blur, noise, and ornamental refraction removed.                                  | Fully opaque content and controls.                                   | Strong essential boundaries and focus indicators. Keep layout and meaning consistent.              |

The opacity values are initial art-direction experiments, not contrast guarantees. Blur does not guarantee contrast. Measure every text/control pair against its composited background, including headers, hover/pressed states, and transitions. If header/status readability depends on the desktop image, add a local opaque backing. Prefer a subtle texture within the material only; do not place visual grain over glyphs.

Dark floating surfaces may need both borders and stronger shadows to show elevation, as Spectrum's shadow guidance illustrates. Those are supporting depth cues; they do not replace accessible focus or control contrast. [Spectrum Drop shadow](https://spectrum.adobe.com/foundations/styles/object-styles/drop-shadow)

### Honest native and web behavior

The browser studio can show CSS glass over a controlled scene within its own page. It cannot prove blur of applications underneath an Electron window. Electron's transparent-window documentation limits CSS blur to the window's web contents. The current transparent frameless host and CSS filter therefore do not establish desktop Acrylic. [Electron Custom Window Styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)

Electron documents a separate Windows `setBackgroundMaterial` API, including Acrylic and Mica, supported on Windows 11 22H2 and later. Any native-material experiment must first verify the installed Electron/OS behavior, transparent/frameless compatibility, window shape, inactive state, and solid fallback. It is a future UI-host implementation item, not implemented or verified by this specification. [Electron BaseWindow: background material](https://www.electronjs.org/docs/latest/api/base-window#winsetbackgroundmaterialmaterial-windows)

## Proposed tokens

### Color

Keep colorful accents concentrated in Ripple, reflected edge light, and the current primary control. Avoid a rainbow of equally prominent buttons. Coral is a small warm accent, not an automatic error meaning; errors still require a label and icon. Lime must not be the sole indication of a successful task.

| Token             | Proposed value | Role                                                                         |
| ----------------- | -------------- | ---------------------------------------------------------------------------- |
| `cloud`           | `#f5fbff`      | Opaque light reading surface / dark-theme primary text.                      |
| `navy-ink`        | `#10283b`      | Primary text on light surfaces and bright accent fills.                      |
| `navy-secondary`  | `#3a5669`      | Secondary light-theme text.                                                  |
| `ocean-depth`     | `#0b2030`      | Opaque dark reading surface.                                                 |
| `cloud-secondary` | `#b9d0dc`      | Secondary dark-theme text.                                                   |
| `ocean-action`    | `#0067d6`      | Solid primary action with white label.                                       |
| `jelly-blue`      | `#36b9ef`      | Initial character body midtone; highlights/deeper ocean shading give volume. |
| `eye-navy`        | `#0b2140`      | Oval eyes and tiny mouth, with white glints.                                 |
| `aqua-light`      | `#48d9e9`      | Decorative light / occasional accent fill with navy text.                    |
| `lime-light`      | `#b9ed64`      | Restrained supportive accent fill with navy text.                            |
| `coral-light`     | `#ff9c85`      | Small warm detail with navy text if labelled.                                |
| `edge-light`      | `#607a8d`      | Essential boundary on opaque cloud surfaces.                                 |
| `edge-dark`       | `#7b9cad`      | Essential boundary on opaque ocean-depth surfaces.                           |

Calculated sRGB contrast for these **flat opaque pairs**, rounded here for reporting: navy/cloud **14.49:1**; light secondary/cloud **7.41:1**; cloud/ocean-depth **15.93:1**; dark secondary/ocean-depth **10.38:1**; white/ocean-action **5.37:1**. Navy text on aqua/lime/coral is respectively **8.91:1 / 11.06:1 / 7.45:1**. Essential edge colors against their matching reading surfaces are **4.31:1 / 5.70:1**. These calculations are not tests of a lit 3D eye, translucent shell, or final rendered state.

Normal-size text must meet at least 4.5:1; the 18px body remains normal-size text. Meaningful control/state graphics need 3:1 against adjacent colors. Our proposed low-vision target is at least 7:1 for sustained body reading, with a larger, strongly contrasted primary control. The 7:1 target is a product decision above the AA text minimum. [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

### Typography, spacing, and geometry

| Area                                | Proposed starting token                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Name / panel heading                | Self-hosted Space Grotesk, 24–28px equivalent, weight 500–600, line-height 1.2.                            |
| Conversation / details              | Self-hosted Inter, 18px equivalent, weight 400–500, line-height 1.6–1.7.                                   |
| Essential control and status labels | Inter 16px equivalent, weight 500; wrap rather than cut off meaning.                                       |
| Speaker / supporting metadata       | Inter 14–15px equivalent, good contrast; no essential 9–10px references.                                   |
| Large-text mode                     | Conversation 22–24px equivalent, controls scale/reflow, panel scrolls.                                     |
| Number presentation                 | Tabular numerals for any supplied numeric data; preserve values and units.                                 |
| Spacing scale                       | 4, 8, 12, 16, 24, 32px equivalents, expressed with relative tokens where appropriate.                      |
| Reading padding                     | 24px desktop; 16–20px in the narrow preview.                                                               |
| Message rhythm                      | 8px label-to-text; 24px between turns; paragraph spacing distinct from turn spacing.                       |
| Corners                             | Outer shell about 24px, reading well 18px, controls 10–12px; concentric where nested.                      |
| Controls                            | At least 44 × 44px hit areas, 8px separation; primary voice control 48px.                                  |
| Focus                               | Visible 3px outline with offset, plus a contrasting local backing where the pet sits over unknown scenery. |

Use actual DOM text rather than rendered text in a texture or concept image. Keep headings concise; uppercase tracking may mark optional studio annotations but should not dominate a conversation. Text enlargement to 200% must preserve functionality. The 44px target proposal exceeds WCAG 2.2 AA's 24px minimum with its exceptions. [W3C Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

## State and interaction language

| State           | Proposed character expression                                              | Plain-language feedback                                                                                                 |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ready / idle    | Open relaxed eyes, small mouth, nearly still body.                         | “Ready.” Opening the panel remains the primary pet action.                                                              |
| Listening       | Eyes gently attend; calm body and restrained light. Avoid frantic pulsing. | “Listening” only while actual voice capture is active; visible pause/stop affordance remains.                           |
| Thinking        | Small eye shift and slow, contained body movement. Keep eyes visible.      | “Working…” or the existing truthful task status; no fabricated percentage or completion time.                           |
| Speaking        | Soft mouth/eye response, restrained light or motion.                       | “Speaking”; preserve existing interruption and spoken-reply controls.                                                   |
| Done            | Brief settled expression, then return to calm.                             | A labelled completed step; color and celebration do not carry the entire meaning.                                       |
| Error / offline | Keep the face calm, with a legible labelled explanation.                   | State the actual failure and expose the existing useful action. Do not imply success through the pet's idle appearance. |

Idle motion, hover gaze, blink, squash, and interface expansion need distinct scopes. The pet may be organic; text and focus rings should remain stable. Avoid movement behind a paragraph, repeated autofocus when a state changes, or announcements for every blink. A slow optional idle loop must have a persistent pause control. Motion preference overrides decorative loops and rubbery expansion; status and facial expression remain understandable in still frames. W3C's animation-from-interactions guidance supports disabling nonessential interaction animation. [W3C Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## Keyboard, screen reader, and low-vision behavior

- Use a real `<button>` for the pet, with `aria-expanded`, a valid controlled-region relationship, and a name describing its action. Enter and Space toggle it. This follows the APG disclosure pattern. The visual character is decorative within that button, with status provided as real text. [W3C APG Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- Keep the conversation nonmodal. It should not trap focus or claim `aria-modal` while the desktop remains usable. On intentional opening, move focus to a predictable panel control/heading; on collapse, return it to the pet. In-panel Escape closes the drawer first, then the conversation. Do not intercept Escape belonging to an existing modal or focused menu. If an actual modal is used for a separate confirmation, follow the modal dialog pattern only while its background is inert. [W3C APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Preserve log semantics and announce meaningful new conversation/task updates politely. Keep visual state labels separate from decorative 3D frames. Do not announce hover gaze, a blink, or the same status every animation tick.
- Label composer and icon controls explicitly. Placeholder text supplements the label. Keep existing Enter/Shift+Enter behavior discoverable. Focus stays visible while scrolling and never disappears under a sticky header/composer. [W3C Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- Offer a persistent **Solid surfaces** setting and **Pause motion** setting, with direct text labels. Honor supported system reduced-transparency/reduced-motion preferences, and test the installed Chromium behavior rather than assuming every preference is exposed. CSS Media Queries Level 5 specifies those preferences; a local setting remains useful when platform detection is unavailable. [W3C Media Queries Level 5](https://drafts.csswg.org/mediaqueries-5/#prefers-reduced-transparency)
- In forced colors, use opaque `Canvas`/`Field` surfaces, appropriate system text/button colors, visible borders, and system focus colors. Remove decorative gradients, blur, noise, and glows. Do not blanket-opt out with `forced-color-adjust: none`. A shadow cannot be the only essential boundary because forced-colors mode suppresses it. Keep Ripple's button and status usable even if the character art is suppressed. [W3C CSS Color Adjustment](https://drafts.csswg.org/css-color-adjust-1/#forced-colors-mode)
- Keep an authored face-containing static fallback when WebGL is unavailable or its context is lost. Pause/resume, drawer navigation, typing, collapse, and actual voice controls must not depend on successful 3D rendering. A returned context should not steal focus or clear the draft.

## Concrete reference implementations

[Microsoft's WinUI Gallery Acrylic sample](https://github.com/microsoft/WinUI-Gallery/blob/main/WinUIGallery/Samples/Acrylic/AcrylicPage.xaml) shows actual themed brush resources with separate tint opacity and fallback color, and places contrasting shapes behind the material for inspection. It is native XAML, not a dependency or implementation recipe to paste into React. Its useful lesson is to inspect the material over difficult backgrounds and give fallback appearance explicit treatment.

[Microsoft's desktop system-backdrop examples](https://learn.microsoft.com/en-us/windows/apps/develop/ui/system-backdrops) distinguish native window backdrop APIs from in-app brushes. Any future Electron experiment needs its own supported API path and desktop proof. The APG disclosure reference above provides the relevant small web interaction pattern for the pet button.

The following is an **original illustrative CSS proposal**, not added to the application. It expresses the key separation between decorative shell and readable content; it does not promise native desktop blur:

```css
.ripple-shell {
  --reading-surface: #f5fbff;
  --reading-ink: #10283b;
  background: rgb(229 247 255 / 0.84);
  backdrop-filter: blur(24px) saturate(1.2);
  border-radius: 1.5rem;
}

.ripple-reading-well,
.ripple-composer {
  background: var(--reading-surface);
  color: var(--reading-ink);
}

[data-solid-surfaces='true'] .ripple-shell {
  background: var(--reading-surface);
  backdrop-filter: none;
}

@media (forced-colors: active) {
  .ripple-shell,
  .ripple-reading-well,
  .ripple-composer {
    background: Canvas;
    color: CanvasText;
    backdrop-filter: none;
    border: 1px solid CanvasText;
    box-shadow: none;
  }
}
```

Dark-theme tokens, native materials, preference handling, focus styles, and layout behavior need deliberate implementation and verification beyond this abbreviated example.

## Review gates before implementation is considered finished

### Character and composition

- [ ] Ripple's two eyes and mouth read at actual collapsed size, not only in a large render. White glints do not merge the eyes into highlight patches.
- [ ] The eye band stays clear through idle, listening, squash, and fallback frames. The steel cradle supports the character without visually imprisoning it or covering its face.
- [ ] Expansion has one clear origin at the pet. The face, title, text, and close control never overlap.
- [ ] Conversation dominates the expanded form. There is one current primary action; details are opt-in. No default KPI grid, equal-size feature-card deck, ornamental timeline, or analytics dashboard is introduced.
- [ ] Hierarchy comes from size, weight, spacing, and alignment. Not every line receives a pill, border, gradient, glass surface, or icon.
- [ ] Color feels aquatic and optimistic while the text remains steady. The pet and its material relationship give the interface a specific identity beyond a generic chat card.

### Readability and real desktop proof

- [ ] Inspect collapsed, conversation, and detail views over a white editor, a dark terminal, a colorful wallpaper, and a high-frequency/busy background, in both proposed themes.
- [ ] Measure actual composited contrast for text, state labels, input hints, buttons, selected/hover/pressed states, and focus. The flat token calculations alone are insufficient.
- [ ] Verify 390px and 320px layouts, 200% text enlargement, the proposed large-text mode, short-height windows, and every display-edge docking position. Long filenames, long status text, and existing numeric data remain readable.
- [ ] Native geometry stays within the display work area including pet, halo, and controls. The taskbar and display scaling do not crop focus or the composer.
- [ ] If a native material is implemented, verify actual blur on the supported desktop, inactive behavior, platform settings, and fallback. Label browser-only background previews accurately.

### Accessibility, truthfulness, and regression

- [ ] Complete the sequence with keyboard and a screen reader: open, navigate conversation, type a draft, open details, return, collapse, reopen. Draft and reading position survive.
- [ ] Verify forced colors, Solid surfaces, system reduced motion, and local Pause motion. Still states remain understandable without visual animation or color.
- [ ] Test unavailable/lost/restored WebGL with the new face-containing authored fallback; controls and focus remain unaffected.
- [ ] Studio state buttons are explicitly simulated. Production Listening/Speaking/Done labels reflect existing runtime facts; no microphone activity or generated result is fabricated.
- [ ] Existing interruption, stop task, send, voice, attachments, source explanations, confirmations, file actions, and supported result controls keep their current meaning and contracts.
- [ ] Run focused accessibility and interaction regressions after implementation. Previous studio tests are a foundation, not a passing result for this unimplemented design.

## Suggested implementation order

1. Review character scale, the open eye band, and one expanded composition before producing more variants.
2. Prototype light/dark/solid shell and reading-well tokens in the visual studio, with controlled bright/dark/busy background switches and honest simulated labels.
3. Verify type, focus, reflow, state stills, and draft preservation; refine the compact layout before adding a detail drawer.
4. Plan native pet/window bounds and material compatibility separately. Preserve current runtime handlers and data while adapting presentation.
5. Add the optional drawer around existing detail content, then verify the same interaction on the actual desktop host.

The design is ready to implement only after its proposed geometry and material behavior have been made concrete in a reviewable prototype. This specification itself supplies research and acceptance criteria; it does not claim that those changes exist yet.
