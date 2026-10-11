import { isDeepStrictEqual } from 'node:util';
import {
  orderedPresentationDeckSchema,
  type OrderedPresentationDeck,
  type OrderedPresentationSlide,
} from '../../shared/presentation-deck.js';
import {
  assertOrderedDeckFits,
  PresentationRevisionError,
} from './presentation-deck.js';
import { PresentationProjectError } from './presentation-project.js';

export type PresentationCapacityRecoveryCode =
  | 'unavailable_candidate'
  | 'stale_revision'
  | 'unsupported_layout'
  | 'deck_limit'
  | 'invalid_continuation_id'
  | 'invalid_deck'
  | 'no_fitting_split';

/** A failed recovery leaves the caller's deck and saved presentation untouched. */
export class PresentationCapacityRecoveryError extends PresentationProjectError {
  readonly changed = false;
  readonly alternatives = ['smaller_change', 'shorten_text', 'different_slide'] as const;
  constructor(public readonly code: PresentationCapacityRecoveryCode, message: string, cause?: unknown) {
    super(`${message} Your deck is unchanged. You can ask for a smaller change, shorten the existing text, or use a different slide.`, { cause });
    this.name = 'PresentationCapacityRecoveryError';
  }
}

/**
 * Split already-validated copy, never generate or shorten it. The caller owns the new ID,
 * approval, persistence and undo; this function performs no I/O or model requests.
 */
export function splitPresentationRevision(
  deck: OrderedPresentationDeck,
  failure: PresentationRevisionError,
  continuationId: string,
): OrderedPresentationDeck {
  const parsed = orderedPresentationDeckSchema.safeParse(deck);
  if (!parsed.success)
    throw new PresentationCapacityRecoveryError('invalid_deck', 'The current presentation cannot be safely split.', parsed.error);
  const current = parsed.data;
  if (failure.code !== 'layout_capacity' || !failure.validatedCandidate || !failure.recoveryBaseline)
    throw new PresentationCapacityRecoveryError('unavailable_candidate', 'There is no validated extra detail available to split.');
  const index = current.slides.findIndex(slide => slide.id === failure.slideId);
  const original = current.slides[index];
  const candidate = structuredClone(failure.validatedCandidate);
  if (!original || candidate.id !== failure.slideId ||
    !isDeepStrictEqual(original, failure.recoveryBaseline.originalSlide) ||
    current.textScale !== failure.recoveryBaseline.deckTextScale)
    throw new PresentationCapacityRecoveryError('stale_revision', 'That slide changed after the extra detail was prepared. Ask for the edit again.');
  if (original.type !== 'text' || candidate.type !== 'text')
    throw new PresentationCapacityRecoveryError('unsupported_layout', 'Splitting currently supports text and summary slides. This slide’s picture or diagram layout must stay intact.');
  if (candidate.textScale !== original.textScale)
    throw new PresentationCapacityRecoveryError('stale_revision', 'The prepared detail no longer matches the slide’s text size.');
  if (current.slides.length >= 10)
    throw new PresentationCapacityRecoveryError('deck_limit', 'This presentation already has the maximum of ten slides.');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(continuationId) || current.slides.some(slide => slide.id === continuationId))
    throw new PresentationCapacityRecoveryError('invalid_continuation_id', 'The continuation needs its own valid slide identity.');
  try { assertOrderedDeckFits(current); }
  catch (error) { throw new PresentationCapacityRecoveryError('invalid_deck', 'The current presentation needs a readable layout before adding a continuation.', error); }

  const continuedTitle = `${candidate.title} (continued)`;
  const titles = continuedTitle.length <= 100 ? [continuedTitle, candidate.title] : [candidate.title];
  let best: OrderedPresentationDeck | undefined;
  let bestBalance = Infinity;
  // Only whole points may move; their exact wording and order are retained.
  for (let boundary = 1; boundary < candidate.points.length; boundary++) {
    const first: OrderedPresentationSlide = { ...candidate, points: candidate.points.slice(0, boundary) };
    for (const title of titles) {
      const second: OrderedPresentationSlide = {
        ...candidate, id: continuationId, title, points: candidate.points.slice(boundary),
      };
      const attempt = orderedPresentationDeckSchema.safeParse({
        ...current,
        slides: [...current.slides.slice(0, index), first, second, ...current.slides.slice(index + 1)],
      });
      if (!attempt.success) continue;
      try { assertOrderedDeckFits(attempt.data); }
      catch { continue; }
      const balance = Math.abs(first.points.join(' ').length - second.points.join(' ').length);
      if (balance < bestBalance) { best = attempt.data; bestBalance = balance; }
      break; // Prefer a fitting continuation label; never shorten the original title to add it.
    }
  }
  if (!best)
    throw new PresentationCapacityRecoveryError('no_fitting_split', 'The complete points do not fit on two slides at the current text size.');
  return best;
}
