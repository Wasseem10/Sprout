import { z } from 'zod';
import type { ResearchSource } from './presentation-research.js';
import type { OrderedPresentationDeck } from './presentation-deck.js';

export const pictureDeckSchema = z.object({
  title: z.string().trim().min(3).max(75),
  subtitle: z.string().trim().min(3).max(125),
  theme: z.enum(['blue', 'light', 'dark']).optional(),
  slides: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(65),
        imageId: z.number().int().min(1).max(6),
        points: z.array(z.string().trim().min(3).max(125)).min(2).max(3),
      }),
    )
    .min(1)
    .max(6)
    .refine(
      (slides) => new Set(slides.map((s) => s.imageId)).size === slides.length,
      'Use each source image exactly once',
    ),
  diagram: z.object({
    title: z.string().trim().min(3).max(65),
    stages: z
      .array(
        z.object({
          label: z.string().trim().min(2).max(32),
          detail: z.string().trim().min(3).max(95),
        }),
      )
      .min(3)
      .max(5),
  }),
});
export type PictureDeck = z.infer<typeof pictureDeckSchema>;
export type PresentationProjectView = {
  revision: number;
  folder: string;
  basis: string;
  assets: { id: number; filename: string; description: string }[];
  deck: PictureDeck;
  /** Authoritative ordered slides for version-two projects; deck is a legacy projection. */
  orderedDeck?: OrderedPresentationDeck;
  researchSources?: ResearchSource[];
  canUndo?: boolean;
  saved?: {
    id: string;
    provider: 'neon' | 'local';
    savedAt: string;
    revision: number;
    warning?: string;
    verified?: boolean;
  };
};
