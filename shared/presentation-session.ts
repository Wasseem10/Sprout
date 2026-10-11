import { z } from 'zod';
import { pictureDeckSchema } from './presentation-project.js';
import { orderedPresentationDeckSchema, toOrderedDeck } from './presentation-deck.js';

export const PRESENTATION_SESSION_VERSION = 1;
export const PRESENTATION_ORDERED_SESSION_VERSION = 2;
export const PRESENTATION_VISUAL_SESSION_VERSION = 3;
export const PRESENTATION_HISTORY_LIMIT = 8;

const filename = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[^/\\:\x00-\x1f]+$/, 'Use a filename, not a path')
  .refine((value) => value !== '.' && value !== '..', 'Use an ordinary filename');
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'Use a SHA-256 source hash');
const revision = z.number().int().min(1).max(1_000_000);

// These are immutable references to source bytes, never the bytes themselves.
export const presentationSourceRefSchema = z
  .object({
    id: z.number().int().min(1).max(6),
    filename: filename.refine((value) => /\.(?:png|jpe?g)$/i.test(value)),
    description: z.string().trim().min(5).max(500),
    sha256,
    width: z.number().int().min(1).max(25_000_000),
    height: z.number().int().min(1).max(25_000_000),
  })
  .strict()
  .refine((source) => source.width * source.height <= 25_000_000, 'Image is too large');
const sources = z
  .array(presentationSourceRefSchema)
  .min(1)
  .max(6)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Duplicate source ID',
  )
  .refine(
    (items) => new Set(items.map((item) => item.filename.toLowerCase())).size === items.length,
    'Duplicate source filename',
  );
const orderedSources = z
  .array(presentationSourceRefSchema)
  .max(6)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Duplicate source ID',
  )
  .refine(
    (items) => new Set(items.map((item) => item.filename.toLowerCase())).size === items.length,
    'Duplicate source filename',
  );
export const presentationBriefRefSchema = z
  .object({
    filename: filename.refine((value) => /^brief\.(?:txt|md)$/i.test(value)),
    sha256,
  })
  .strict();

export const presentationSessionV1Schema = z
  .object({
    schemaVersion: z.literal(PRESENTATION_SESSION_VERSION),
    id: z.string().uuid(),
    revision,
    deck: pictureDeckSchema,
    sources,
    briefRef: presentationBriefRefSchema.optional(),
    history: z
      .array(z.object({ revision, deck: pictureDeckSchema }).strict())
      .max(PRESENTATION_HISTORY_LIMIT),
  })
  .strict()
  .superRefine((session, context) => {
    const known = new Set(session.sources.map((source) => source.id));
    if (
      session.deck.slides.length !== session.sources.length ||
      session.deck.slides.some((slide) => !known.has(slide.imageId))
    )
      context.addIssue({
        code: 'custom',
        path: ['deck', 'slides'],
        message: 'Slide source references do not match',
      });
    let previous = 0;
    for (const [index, item] of session.history.entries()) {
      if (item.revision <= previous || item.revision >= session.revision)
        context.addIssue({
          code: 'custom',
          path: ['history', index, 'revision'],
          message: 'History revisions must be ordered before the current revision',
        });
      if (
        item.deck.slides.length !== session.sources.length ||
        item.deck.slides.some((slide) => !known.has(slide.imageId))
      )
        context.addIssue({
          code: 'custom',
          path: ['history', index, 'deck'],
          message: 'History source references do not match',
        });
      previous = item.revision;
    }
  });

// A projection can have no image slides, or fewer image slots than the ordered deck.
// It remains a compatibility view; only orderedDeck is authoritative for version two.
export const presentationDeckProjectionSchema = pictureDeckSchema.extend({
  slides: z.array(pictureDeckSchema.shape.slides.element).max(6),
});
export const presentationHistoryV2Schema = z
  .object({
    revision,
    deck: presentationDeckProjectionSchema,
    // The ordered schema also validates permanent graph identities and topology.
    // Store graph data, never a cached scene that could disagree with the graph.
    orderedDeck: orderedPresentationDeckSchema,
  })
  .strict();
export const presentationSessionV2Schema = z
  .object({
    schemaVersion: z.literal(PRESENTATION_ORDERED_SESSION_VERSION),
    id: z.string().uuid(),
    revision,
    deck: presentationDeckProjectionSchema,
    orderedDeck: orderedPresentationDeckSchema,
    sources: orderedSources,
    briefRef: presentationBriefRefSchema.optional(),
    history: z.array(presentationHistoryV2Schema).max(PRESENTATION_HISTORY_LIMIT),
  })
  .strict()
  .superRefine((session, context) => {
    const known = new Set(session.sources.map((source) => source.id));
    const decks = [
      { deck: session.orderedDeck, path: ['orderedDeck'] as (string | number)[] },
      ...session.history.map((item, index) => ({
        deck: item.orderedDeck,
        path: ['history', index, 'orderedDeck'] as (string | number)[],
      })),
    ];
    for (const { deck, path: prefix } of decks) {
      for (const [index, slide] of deck.slides.entries()) {
        if ('imageId' in slide && slide.imageId !== undefined && !known.has(slide.imageId))
          context.addIssue({
            code: 'custom',
            path: [...prefix, 'slides', index, 'imageId'],
            message: 'Slide source reference does not match a saved source',
          });
      }
    }
    let previous = 0;
    for (const [index, item] of session.history.entries()) {
      if (item.revision <= previous || item.revision >= session.revision)
        context.addIssue({
          code: 'custom',
          path: ['history', index, 'revision'],
          message: 'History revisions must be ordered before the current revision',
        });
      previous = item.revision;
    }
  });
// V3 explicitly identifies sessions that can contain branching graphs, measured
// layout choices and frozen verified chart evidence. Semantic orderedDeck IDs
// and its existing version remain unchanged; this is the persistence envelope.
export const presentationSessionV3Schema = z.strictObject({
  ...presentationSessionV2Schema.shape,
  schemaVersion: z.literal(PRESENTATION_VISUAL_SESSION_VERSION),
}).superRefine((session, context) => {
  const compatible = presentationSessionV2Schema.safeParse({ ...session, schemaVersion: 2 });
  if (!compatible.success) for (const issue of compatible.error.issues)
    context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
export const presentationSessionSchema = z.union([
  presentationSessionV1Schema,
  presentationSessionV2Schema,
  presentationSessionV3Schema,
]);
export type PresentationSourceRef = z.infer<typeof presentationSourceRefSchema>;
export type PresentationSession = z.infer<typeof presentationSessionSchema>;
export type PresentationSessionV2 = z.infer<typeof presentationSessionV2Schema>;
export type PresentationSessionV3 = z.infer<typeof presentationSessionV3Schema>;

/** Upgrade supported legacy content and its undo history without inference or new source files. */
export function migratePresentationSession(input: PresentationSession): PresentationSessionV2 | PresentationSessionV3 {
  const session = presentationSessionSchema.parse(input);
  if (session.schemaVersion !== 1) return session;
  return presentationSessionV2Schema.parse({
    ...session,
    schemaVersion: PRESENTATION_ORDERED_SESSION_VERSION,
    orderedDeck: toOrderedDeck(session.deck),
    history: session.history.map((item) => ({ ...item, orderedDeck: toOrderedDeck(item.deck) })),
  });
}

/** Current migration: identity follows original image source, never its position. */
export function migratePresentationSessionV3(input: PresentationSession): PresentationSessionV3 {
  const session = presentationSessionSchema.parse(input);
  if (session.schemaVersion === 3) return session;
  if (session.schemaVersion === 2) return presentationSessionV3Schema.parse({ ...session, schemaVersion: 3 });
  const convert = (deck: z.infer<typeof pictureDeckSchema>) => {
    const images = deck.slides.map(slide => slide.imageId);
    if (new Set(images).size !== images.length)
      throw new Error('This legacy presentation repeats source identities. Its slide history cannot be migrated safely.');
    const ordered = toOrderedDeck(deck);
    ordered.slides = ordered.slides.map(slide => ({ ...slide,
      id: `p-${session.id}-${slide.type === 'image' ? `source-${slide.imageId}` : slide.type === 'cover' ? 'cover' : 'process'}`,
    }));
    return ordered;
  };
  return presentationSessionV3Schema.parse({ ...session, schemaVersion: 3,
    orderedDeck: convert(session.deck),
    history: session.history.map(item => ({ ...item, orderedDeck: convert(item.deck) })),
  });
}

const research = z
  .object({
    id: z.number().int().min(1).max(3),
    title: z.string().trim().min(1).max(500),
    url: z
      .string()
      .max(2048)
      .url()
      .refine((value) => {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
      }),
    text: z.string().max(24_000),
    accessedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

// Kept on this laptop only. A manifest is not permission to trust changed files:
// the controller must re-authorize the folder and verify every hash on restore.
export const presentationLocalManifestSchema = z
  .object({
    schemaVersion: z.union([
      z.literal(PRESENTATION_SESSION_VERSION),
      z.literal(PRESENTATION_ORDERED_SESSION_VERSION),
      z.literal(PRESENTATION_VISUAL_SESSION_VERSION),
    ]),
    projectId: z.string().uuid(),
    root: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => !/[\x00-\x1f]/.test(value), 'Invalid source folder')
      .refine(
        (value) => /^(?:[a-z]:[\\/]|\/|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(value),
        'Source folder must be absolute',
      ),
    // Source staging can move while the user's working presentation keeps its path.
    outputRoot: z.string().min(1).max(4096).refine((value) => !/[\x00-\x1f]/.test(value) && /^(?:[a-z]:[\\/]|\/|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(value), 'Output folder must be absolute').optional(),
    sources: orderedSources,
    // Optional original-file bindings are private to this laptop, never in a cloud session.
    // The restore executor verifies these bytes against the matching source hash.
    sourceBindings: z
      .array(
        z
          .object({
            id: z.number().int().min(1).max(6),
            path: z
              .string()
              .min(1)
              .max(4096)
              .refine((value) => !/[\x00-\x1f]/.test(value), 'Invalid original source path')
              .refine(
                (value) => /^(?:[a-z]:[\\/]|\/|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(value),
                'Original source path must be absolute',
              ),
          })
          .strict(),
      )
      .max(6)
      .optional(),
    originalBriefBinding: z
      .object({
        path: z.string().min(1).max(4096)
          .refine((value) => !/[\x00-\x1f]/.test(value), 'Invalid original brief path')
          .refine((value) => /^(?:[a-z]:[\\/]|\/|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(value), 'Original brief path must be absolute'),
        sha256,
      })
      .strict()
      .optional(),
    briefRef: presentationBriefRefSchema.optional(),
    output: z
      .object({
        filename: filename.refine((value) => /\.pptx$/i.test(value)),
        sha256,
      })
      .strict()
      .optional(),
    originalRequest: z.string().max(8000).optional(),
    research: z.array(research).max(3).optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.schemaVersion === 1 && (!manifest.sources.length || manifest.sourceBindings || manifest.originalBriefBinding))
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message:
          'Version-one manifests require source images and do not contain original-file bindings',
      });
    if (manifest.originalBriefBinding && manifest.originalBriefBinding.sha256 !== manifest.briefRef?.sha256)
      context.addIssue({
        code: 'custom',
        path: ['originalBriefBinding'],
        message: 'Original brief binding must match the saved brief hash',
      });
    const known = new Set(manifest.sources.map((source) => source.id));
    const seen = new Set<number>();
    for (const [index, binding] of (manifest.sourceBindings ?? []).entries()) {
      if (!known.has(binding.id) || seen.has(binding.id))
        context.addIssue({
          code: 'custom',
          path: ['sourceBindings', index, 'id'],
          message: 'Original-file binding must identify a unique saved source',
        });
      seen.add(binding.id);
    }
  });
export type PresentationLocalManifest = z.infer<typeof presentationLocalManifestSchema>;

export const savedPresentationSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    revision,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type SavedPresentationSummary = z.infer<typeof savedPresentationSummarySchema>;
