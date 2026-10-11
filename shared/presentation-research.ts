import { z } from 'zod';
import { pictureDeckSchema } from './presentation-project.js';

export type ResearchSource = {
  id: number;
  title: string;
  url: string;
  text: string;
  accessedAt: string;
};
export const researchDeckSchema = z.object({
  title: z.string().trim().min(3).max(75),
  subtitle: z.string().trim().min(3).max(125),
  slides: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(65),
        points: z
          .array(
            z.object({
              text: z.string().trim().min(5).max(125),
              sourceId: z.number().int().min(1).max(3),
              quote: z.string().trim().min(15).max(240),
            }),
          )
          .min(2)
          .max(3),
      }),
    )
    .length(3),
  diagram: pictureDeckSchema.shape.diagram,
});
export type ResearchDeck = z.infer<typeof researchDeckSchema>;
export type ResearchPresentationView = {
  sources: ResearchSource[];
  deck: ResearchDeck;
};
