# Avatar exploration — Prism character family

Created **2026-10-10**. **Sprout and the Prism palette are selected by the user.** The comparison is retained as provenance; accessories and final panel layout remain open. This pass creates original concept studies only; it changes no runtime, Blender scene or exported model. The current build order is in [PRODUCTION-WORKFLOW.md](PRODUCTION-WORKFLOW.md).

The user asked whether Ripple was really the strongest possible avatar now that it is a cute being, and clarified that even the steel cradle can be interchangeable. Character identity therefore must work independently of its support.

## Side-by-side study

[Original creature comparison](../../../artifacts/prism-avatar-study-v004.png) shows three silhouettes with related Prism materials, navy eyes and soft lighting. The small views are generated concept miniatures, not real 40–44 px application captures.

| Candidate  | Visual identity                                                        | Creative assessment                                                            | Future build consideration                                |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| A — Ripple | Clean single teardrop with one soft peak                               | Most elegant and simple; face is easy to prioritize                            | Lowest form/rig complexity                                |
| B — Sprout | Compact jelly spirit with two unequal blunt buds and subtle base lobes | Our preferred challenger: stronger creature personality even without a support | Keep buds short, face large and deformation region stable |
| C — Drift  | Round aquatic jelly with short lateral fins                            | Gentle, graceful, distinctive creature                                         | Width and fin motion need testing in the collapsed window |

These are original exploratory designs and subjective assessments, not claims that one avatar is universally best. The body, navy eyes, occasional blink and controlled jelly motion should provide identity; optional supports should not carry all recognition.

## Output critique and recommendation

**Sprout is the strongest new mascot candidate.** Its asymmetric crown and small base lobes make it feel more like a creature than a droplet with a face. Ripple remains a good benchmark for elegance and simplicity; Drift offers a calmer aquatic expression.

The generated Sprout buds are longer than the prompt's intended short proportions. In a Blender blockout, compare the pictured silhouette with buds shortened by roughly a quarter to a third, preserving their asymmetry and soft rounded tips. The goal is to keep personality while giving more of the small display to the face. This is a proposed correction, not a measured optimum.

The three miniatures also differ in width and visual area. Do not infer small-scale readability or performance from them. A future actual-size clay comparison must hold the displayed bounds and eye treatment constant, then inspect the real collapsed icon around 40–44 px and the proposed larger pet around 96 px. Remove subtle feet or accessory detail if it becomes clutter.

All three are plausible authored mesh/morph candidates in the existing pipeline. Their concept images do not prove pixel-identical Blender/WebGL materials or completed animation. Final topology, eye placement, color streak and motion need the normal viewed authoring/export gates.

## Interchangeable accessories

Treat these as independent experiments available to any character:

- **Steel sweep:** the sculptural polished metal ribbon, preserving the earlier direction's strongest reflection treatment.
- **Glass pebble:** a low smooth aqua pedestal for a lighter, softer composition.
- **Free float:** no visible support, only a restrained floating pose. A screen-space shadow must not imply a real physical desktop surface.

For Sprout, our current creative preference is free float by default, with steel or glass as optional presentation variants. This is a recommendation for discussion, not an implemented toggle or finalized design.

A later rig should use a stable accessory anchor and preserve character scale/framing independently of accessory bounds. Switching a wide ribbon for a small pebble must not silently shrink or enlarge the character's face. Keep all accessories below/outside the eye band, and simplify or omit them in the smallest view.

The body can use fixed topology and broad authored morphs; buds or fins may add a small number of independent controls. An elaborate skeleton or physical fluid simulation is not necessary for this proposed design. Each animated property still needs one owner so gaze, blink, jelly response and accessories do not overwrite each other.

## Next design gate

The user has selected Sprout and asked to focus on the production workflow. Next prove its actual-size clay silhouette and exported animation using [ANIMATION-WORKFLOW.md](ANIMATION-WORKFLOW.md). Then review the compact/expanded layout with meaningful conversation content, readable text and Prism materials. The user subsequently requested the [consolidated implementation prompt](MASTER-PROMPT.md); it includes a portrait starting layout and its prototype review gate. Earlier Ripple/cradle specifications remain working history.

## Exact submitted concept prompt

Create a high-end original CHARACTER EXPLORATION board for InsightOS. Use the attached Prism palette study as a material, navy-eye style, friendly expression, ocean-blue jelly and broad softbox reflection reference. Only B · Prism is the palette reference: blue/aqua dominant with a graceful violet-to-coral inner color sweep. Do not reproduce the three color alternatives or their UI samples. We are comparing genuinely distinct ORIGINAL CREATURE SILHOUETTES, not palettes. The character can exist without a steel cradle; supports are interchangeable accessories.

One clean landscape board with three equal main columns, pale cloud-white/sky background, identical bright softbox lighting, orthographic near-front three-quarter view, similar body visual area, all facing the viewer. One large creature per column plus a SMALL front-view silhouette or miniature of that SAME creature below it. Each face has two high-contrast deep navy oval eyes with tiny white glints and a relaxed tiny smile. Face stays mainly blue, eyes never obscured. Broad controlled highlights, luminous blue/aqua translucent jelly, restrained violet and coral colored depth along outer side/lower edge. No rainbow face, no emission blowout. Each creature floats just above a soft shadow, with NO CRADLE in the main comparison. Keep the original shapes simple and realistically reproducible in Blender with one continuous body mesh and a few controlled appendages.

Labels ONLY: A · Ripple, B · Sprout, C · Drift.

A · Ripple: the reference's very cute ocean jelly teardrop, one smooth rounded compressed body with a single soft crown peak. No arms, ears or legs. Keep its clean friendly face and original glass/jelly character feel.

B · Sprout: a distinctly creature-like tiny jelly spirit, compact softly pear-shaped round body, two SHORT thick rounded asymmetric soft jelly antennae/buds growing smoothly out of its crown. One bud curves slightly forward, the other leans outward, each around 12–18 percent of body height. They are NOT tall rabbit ears, NOT pointy cat ears, NOT leaves. Two very small rounded base lobes suggest little feet as part of the body rather than shoes. The body has gentle cheeks and a tiny hint of shoulders, with an alert gentle expression. No separate human head/torso, no neck, no clothes, no fur, no existing recognizable mascot. It should have more creature personality than A, but remain a polished tactile water spirit with a clear large face and minimal geometry. Soft, asymmetric, endearing, distinctive, not overly infantile. This is an original character design.

C · Drift: an adorable compact aquatic jelly spirit with a rounded central body and two SHORT soft lateral fin flaps like a very simplified friendly manta. The central face occupies most of its visible width; the fins project only about 20 percent beyond either side and angle gently down. No long trailing tail, realistic animal markings, gills or thin razor edges. Cute wide-eyed navy face on the round central blue body. Slightly wider and more graceful than A/B, but still fits a small desktop pet. It is a stylized original creature, not a literal manta model.

At the VERY BOTTOM, a small separated accessory row labeled ONLY: Steel sweep, Glass pebble, Free float. Render three optional SUPPORTS as separate small objects, without a character: the beautiful rounded polished-steel open ribbon cradle from the reference; a low smooth clear aqua glass pebble pedestal; an empty subtle soft floating shadow. Make clear these are interchangeable support ideas for ANY creature, not required body parts. Keep this row secondary and leave spacious separation from main character studies.

A sophisticated design studio comparison with consistent scale, pose and palette, crisp material details, soft joyful atmosphere, high-quality physical 3D renders. Rich blue colored jelly with organic volume and editable broad shapes. No UI, no slogans, no dense text, no metallic robot, no particles, no elaborate wings, no additional characters, no popular cartoon/IP resemblance. Small miniatures should help assess face and silhouette at reduced size, but not be claimed to be actual application renders.
