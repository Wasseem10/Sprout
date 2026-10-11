import type { OrderedPresentationDeck } from './presentation-deck.js';
import { z } from 'zod';

export const presentationSlideChangeSchema = z.strictObject({
  slideId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  beforeIndex: z.number().int().min(1).max(10).optional(),
  afterIndex: z.number().int().min(1).max(10).optional(),
  title: z.string().trim().min(1).max(100),
  changes: z.array(z.enum(['added', 'removed', 'moved', 'content', 'image', 'style'])).min(1).max(6),
}).superRefine((change, context) => {
  if (new Set(change.changes).size !== change.changes.length ||
      (!change.beforeIndex && !change.afterIndex) ||
      (change.changes.includes('added') && (change.beforeIndex !== undefined || change.afterIndex === undefined)) ||
      (change.changes.includes('removed') && (change.beforeIndex === undefined || change.afterIndex !== undefined)) ||
      (change.changes.includes('moved') && (change.beforeIndex === undefined || change.afterIndex === undefined || change.beforeIndex === change.afterIndex)) ||
      (change.changes.some(kind => ['content', 'image', 'style'].includes(kind)) && (!change.beforeIndex || !change.afterIndex)))
    context.addIssue({ code: 'custom', message: 'Slide change types must match their before and after positions.' });
});
export type PresentationSlideChange = z.infer<typeof presentationSlideChangeSchema>;
export type PresentationChangeReceipt = {
  operationId: string;
  projectId: string;
  baseRevision: number;
  committedRevision: number;
  outputSha256: string;
  changes: PresentationSlideChange[];
  summary: string;
  local: 'saved';
  native: { status: 'not_requested' | 'verified' | 'not_verified'; slide?: number; message?: string };
  cloud: { status: 'not_saved' | 'verified' | 'not_verified'; provider?: 'neon' | 'local'; savedAt?: string; message?: string };
};
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableValue(nested)]));
  return value;
}
const styleKeys = new Set(['textScale', 'titleScale', 'layout', 'imageSide']);
function slideParts(slide: OrderedPresentationDeck['slides'][number]) {
  return {
    style: Object.fromEntries(Object.entries(slide).filter(([key]) => styleKeys.has(key))),
    content: Object.fromEntries(Object.entries(slide).filter(([key]) => !styleKeys.has(key))),
  };
}

/** Facts derived from the two actual states, never model-authored completion claims. */
export function presentationDifferences(before: OrderedPresentationDeck | undefined, after: OrderedPresentationDeck): PresentationSlideChange[] {
  const changed: PresentationSlideChange[] = [];
  for (const [index, slide] of after.slides.entries()) {
    const oldIndex = before?.slides.findIndex(old => old.id === slide.id) ?? -1;
    const old = before?.slides[oldIndex];
    const changes: PresentationSlideChange['changes'] = [];
    if (!old) changes.push('added');
    else {
      if (oldIndex !== index) changes.push('moved');
      const oldParts = slideParts(old), nextParts = slideParts(slide);
      if (JSON.stringify(stableValue(oldParts.content)) !== JSON.stringify(stableValue(nextParts.content))) changes.push('content');
      if (('imageId' in old ? old.imageId : undefined) !== ('imageId' in slide ? slide.imageId : undefined)) changes.push('image');
      if (JSON.stringify(stableValue(oldParts.style)) !== JSON.stringify(stableValue(nextParts.style)) || before?.theme !== after.theme || before?.textScale !== after.textScale) changes.push('style');
    }
    if (changes.length) changed.push({ slideId: slide.id, ...(old ? { beforeIndex: oldIndex + 1 } : {}), afterIndex: index + 1, title: slide.title, changes });
  }
  before?.slides.forEach((slide, index) => {
    if (!after.slides.some(next => next.id === slide.id)) changed.push({ slideId: slide.id, beforeIndex: index + 1, title: slide.title, changes: ['removed'] });
  });
  return changed;
}
