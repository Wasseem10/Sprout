import { describe, expect, it } from 'vitest';
import { validatePresentationWordConstraints } from '../server/computer/presentation-word-constraints';
import { mergePresentationDraft, presentationTurnIntentSchema, type PresentationIntentContext, type PresentationOperation, type PresentationTaskDraft, type PresentationTurnIntent } from '../shared/presentation-intent';

const context: PresentationIntentContext = { draft: null, conversation: [], lastVerifiedResult: null };
const operation = (values: Partial<Extract<PresentationOperation, { type: 'revise_slide' }>> = {}): Extract<PresentationOperation, { type: 'revise_slide' }> => ({ type: 'revise_slide', target: 2, detailChange: 'shorten', instruction: 'Shorten the target body.', ...values });
const intent = (op = operation()): PresentationTurnIntent => ({ kind: 'request', domain: 'presentation', startsNewTask: false, awaitingContinuation: false, fields: {}, operations: [op] });
describe('explicit shortening contract grounding', () => {
  it.each(['Tighten slide two.', 'Make it shorter.', 'Use less text.', 'Make the wording more concise.'])('does not introduce a hidden cap for %s', request => {
    expect(() => validatePresentationWordConstraints(intent(), request, context)).not.toThrow();
    expect(() => validatePresentationWordConstraints(intent(operation({ reductionPercent: 20, lengthConstraintQuote: request })), request, context)).toThrow('quoted length constraint');
  });
  it.each(['Shorten the third slide.', 'Tighten the Third Quarter Report slide.', 'Shorten the half-year report.', 'Reduce wording on Quarter Results.'])('does not mistake a target or title for a fractional limit: %s', request => {
    expect(() => validatePresentationWordConstraints(intent(), request, context)).not.toThrow();
  });
  it.each([
    ['at most 40 words', 40], ['under forty words', 39], ['fewer than twenty-five words', 24],
    ['no more than one hundred and ten words', 110], ['not more than 50 words', 50], ['up to 500 words', 500],
  ])('grounds the upper bound %s', (quote, maximumWords) => {
    expect(() => validatePresentationWordConstraints(intent(operation({ maximumWords, lengthConstraintQuote: quote })), `Shorten slide two to ${quote}.`, context)).not.toThrow();
  });
  it.each(['shorten by 25 percent', 'reduce the body text by twenty-five percent', '25% shorter'])('grounds a percentage from %s', quote => {
    expect(() => validatePresentationWordConstraints(intent(operation({ reductionPercent: 25, lengthConstraintQuote: quote })), `Make slide two shorter ${quote}.`, context)).not.toThrow();
  });
  it('carries both bounds without supplying a model-estimated starting word count', () => {
    const quote = 'at most 40 words and shorten by 25 percent';
    expect(() => validatePresentationWordConstraints(intent(operation({ maximumWords: 40, reductionPercent: 25, lengthConstraintQuote: quote })), `Shorten ${quote}.`, context)).not.toThrow();
  });
  it.each([undefined, 'by 25 percent', '25 percent'])('recovers omitted/abbreviated quote %s from complete current quantitative evidence', lengthConstraintQuote => {
    const op = operation({ reductionPercent: 25, lengthConstraintQuote });
    const request = 'Reduce the body text on slide three by 25 percent.';
    expect(() => validatePresentationWordConstraints(intent(op), request, context)).not.toThrow();
    expect(op.lengthConstraintQuote).toBe(request);
  });
  it.each(['exactly 40 words', 'between 30 and 40 words', 'under -4 words', 'at most 40.5 words', 'at most 501 words', 'by 100 percent', 'by 20.5 percent', 'by half', 'to 25 percent', 'at least 50 words and under 40 words'])('requires clarification for %s', request => {
    expect(() => validatePresentationWordConstraints(intent(), `Shorten slide two ${request}.`, context)).toThrow('unsupported');
  });
  it('rejects omitted, invented, mistranslated and direction-conflicting limits', () => {
    expect(() => validatePresentationWordConstraints(intent(), 'Shorten slide two to under 40 words.', context)).toThrow('omitted');
    expect(() => validatePresentationWordConstraints(intent(operation({ maximumWords: 40, lengthConstraintQuote: 'under 40 words' })), 'Shorten to under 40 words.', context)).toThrow('do not equal');
    expect(() => validatePresentationWordConstraints(intent(operation({ maximumWords: 40, lengthConstraintQuote: 'at most 40 words' })), 'Tighten it.', context)).toThrow('not supplied');
    expect(() => validatePresentationWordConstraints(intent(operation({ detailChange: 'expand', maximumWords: 40, lengthConstraintQuote: 'at most 40 words' })), 'Expand to at most 40 words.', context)).toThrow('detailChange=shorten');
    expect(() => validatePresentationWordConstraints(intent(operation({ reductionPercent: 20, lengthConstraintQuote: 'by 20 percent' })), 'Shorten slide two but keep the fact that revenue rose by 20 percent.', context)).toThrow();
    expect(() => validatePresentationWordConstraints(intent(), 'Shorten slide two but keep the fact that revenue rose by 20 percent.', context)).not.toThrow();
    expect(() => validatePresentationWordConstraints(intent(operation({ maximumWords: 40, lengthConstraintQuote: 'at most 40 words' })), 'Shorten to at most 40 words, not counting the title.', context)).not.toThrow();
  });
  it('retains exact pending constraints for a target-only correction, without leaking them into a replacement edit', () => {
    const op = operation({ maximumWords: 40, lengthConstraintQuote: 'at most 40 words' });
    const draft: PresentationTaskDraft = { id: 'pending', generation: 1, workflow: 'edit', fields: {}, transcripts: ['Shorten to at most 40 words.'], operations: [op], pendingQuestion: { field: 'imageDestination', question: 'Which slide?' }, lastSuccessfulArtifact: null };
    expect(() => validatePresentationWordConstraints(intent({ ...op, target: 3 }), 'Slide three.', { ...context, draft })).not.toThrow();
    const targetOnly = mergePresentationDraft(draft, { ...intent(), kind: 'correction', fields: { imageDestination: 3 }, operations: [] }, 'Slide three.', { id: 'next', generation: 2 });
    expect(targetOnly?.operations[0]).toMatchObject({ target: 3, maximumWords: 40 });
    const replacement = mergePresentationDraft(draft, { ...intent(operation({ instruction: 'Just shorten naturally.' })), kind: 'correction' }, 'Just shorten naturally.', { id: 'next', generation: 2 });
    expect(replacement?.operations[0]).not.toHaveProperty('maximumWords');
    expect(replacement?.operations[0]).not.toHaveProperty('lengthConstraintQuote');
  });
  it.each([{ maximumWords: 0 }, { maximumWords: 501 }, { maximumWords: 2.5 }, { reductionPercent: 100 }, { reductionPercent: 1.5 }])('validates transport bounds %j', limits => {
    expect(() => presentationTurnIntentSchema.parse(intent(operation(limits)))).toThrow();
  });
});
