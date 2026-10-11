import { describe, expect, it } from 'vitest';
import {
  PresentationReferenceError,
  validatePresentationReferences,
} from '../shared/presentation-reference';
import type {
  PresentationIntentContext,
  PresentationOperation,
  PresentationTurnIntent,
} from '../shared/presentation-intent';

const context: PresentationIntentContext = {
  draft: null,
  conversation: [],
  lastVerifiedResult: null,
  activePresentation: {
    projectId: 'pets',
    filename: 'pets.pptx',
    title: 'Understanding Pet Behavior',
    revision: 4,
    slideCount: 7,
    reviewedSlide: 2,
    verifiedSelectedSlide: 2,
    slides: [
      { id: 'intro', index: 1, title: 'Understanding Pet Behavior' },
      { id: 'dog', index: 2, title: 'Dog Communication Signals' },
      { id: 'cat', index: 3, title: 'Cat Body Language' },
      { id: 'interactions', index: 4, title: 'Interactions Between Pets' },
      { id: 'conflicts', index: 5, title: 'Handling Pet Conflicts' },
      { id: 'signals', index: 6, title: 'Reading Pet Signals' },
      { id: 'summary', index: 7, title: 'Pet Behavior Summary' },
    ],
  },
};
const plan = (operations: PresentationOperation[]): PresentationTurnIntent => ({
  kind: 'request',
  domain: 'presentation',
  startsNewTask: false,
  awaitingContinuation: false,
  fields: {},
  operations,
});
const revise = (target: number, targetReference?: string): PresentationOperation => ({
  type: 'revise_slide',
  target,
  targetReference,
  detailChange: 'expand',
  instruction: 'Explain the content in more detail.',
});
describe('presentation reference validation independent of action routing', () => {
  it('grounds a verbatim contextual quote in agreeing reviewed/requested evidence without inventing an ordinal', () => {
    const ctx = structuredClone(context);
    ctx.activePresentation!.reviewedSlide = 3;
    delete ctx.activePresentation!.verifiedSelectedSlide;
    ctx.lastRequestedTarget = { projectId: 'pets', slideId: 'cat', revision: 4, index: 3, title: 'Cat Body Language', operationType: 'read_slide' };
    const operation = revise(3, 'slide you just read');
    expect(validatePresentationReferences(plan([operation]), 'Develop the explanation on the slide you just read.', ctx).operations).toEqual([operation]);
    expect(() => validatePresentationReferences(plan([revise(2, 'slide you just read')]), 'Develop the explanation on the slide you just read.', ctx)).toThrow(PresentationReferenceError);
    ctx.activePresentation!.verifiedSelectedSlide = 2;
    expect(() => validatePresentationReferences(plan([operation]), 'Develop the explanation on the slide you just read.', ctx)).toThrow(PresentationReferenceError);
  });
  it('does not use contextual quote fallback to override a spoken explicit target or invented quote', () => {
    expect(() => validatePresentationReferences(plan([revise(2, 'that one')]), 'Expand slide seven, not that one.', context)).toThrow(PresentationReferenceError);
    expect(() => validatePresentationReferences(plan([revise(2, 'third slide')]), 'Expand the slide you just read.', context)).toThrow(PresentationReferenceError);
  });
  it.each([
    'Expand slide seven.',
    'Expand the seventh slide.',
    'Expand slide 7.',
    'Expand the 7th slide.',
    'Expand slide, uh, seven.',
  ])('binds the unique spoken number instead of an in-range model guess: %s', (request) => {
    const original = plan([revise(2)]);
    const result = validatePresentationReferences(original, request, context);
    expect(result.operations[0]).toMatchObject({ type: 'revise_slide', target: 7 });
    expect(original.operations[0]).toMatchObject({ target: 2 });
  });
  it('requires the model target and exact quoted reference to agree', () => {
    expect(() =>
      validatePresentationReferences(
        plan([revise(2, 'slide seven')]),
        'Expand slide seven.',
        context,
      ),
    ).toThrow(PresentationReferenceError);
  });
  it('preserves separate operation targets when several references are grounded', () => {
    const original = plan([
      { type: 'read_slide', target: 2, targetReference: 'slide two' },
      revise(7, 'slide seven'),
    ]);
    expect(
      validatePresentationReferences(original, 'Read slide two, then expand slide seven.', context)
        .operations,
    ).toEqual(original.operations);
    expect(() =>
      validatePresentationReferences(
        plan([{ type: 'read_slide', target: 2 }, revise(7)]),
        'Read slide two, then expand slide seven.',
        context,
      ),
    ).toThrow('Multiple');
    expect(() =>
      validatePresentationReferences(
        plan([
          { type: 'read_slide', target: 7, targetReference: 'slide two' },
          revise(2, 'slide seven'),
        ]),
        'Read slide two, then expand slide seven.',
        context,
      ),
    ).toThrow('contradicts');
  });
  it('checks move source and destination independently', () => {
    const request = 'Move slide two before slide four.';
    const valid = plan([
      {
        type: 'move_slide',
        target: 2,
        targetReference: 'slide two',
        before: 4,
        beforeReference: 'slide four',
      },
    ]);
    expect(validatePresentationReferences(valid, request, context).operations).toEqual(
      valid.operations,
    );
    expect(() =>
      validatePresentationReferences(
        plan([
          {
            type: 'move_slide',
            target: 2,
            targetReference: 'slide two',
            before: 2,
            beforeReference: 'slide four',
          },
        ]),
        request,
        context,
      ),
    ).toThrow('contradicts');
    expect(() =>
      validatePresentationReferences(
        plan([{ type: 'move_slide', target: 2, before: 4 }]),
        request,
        context,
      ),
    ).toThrow('two reference roles');
  });
  it('does not reuse one move reference for both source and destination', () => {
    expect(() =>
      validatePresentationReferences(
        plan([{ type: 'move_slide', target: 2, before: 4 }]),
        'Put it before slide four.',
        context,
      ),
    ).toThrow();
    const valid = plan([
      { type: 'move_slide', target: 'current', before: 4, beforeReference: 'slide four' },
    ]);
    expect(
      validatePresentationReferences(valid, 'Put it before slide four.', context).operations,
    ).toEqual(valid.operations);
  });
  it('resolves an exact existing title or unique title fragment', () => {
    expect(
      validatePresentationReferences(
        plan([revise(3, 'Cat Body Language')]),
        'Expand Cat Body Language.',
        context,
      ).operations[0],
    ).toMatchObject({ target: 3 });
  });
  it('uses the unique title when the model omitted reference metadata', () => {
    expect(
      validatePresentationReferences(plan([revise(2)]), 'Expand Cat Body Language.', context)
        .operations[0],
    ).toMatchObject({ target: 3 });
    expect(() =>
      validatePresentationReferences(plan([revise(2)]), 'More detail for the summary.', context),
    ).toThrow(PresentationReferenceError);
  });
  it('rejects a duplicate or missing title instead of falling back to native selection', () => {
    const duplicate = structuredClone(context);
    duplicate.activePresentation!.slides![4].title = 'Conflict Summary';
    expect(() =>
      validatePresentationReferences(
        plan([revise(7, 'summary')]),
        'Expand the summary.',
        duplicate,
      ),
    ).toThrow(PresentationReferenceError);
    expect(() =>
      validatePresentationReferences(
        plan([revise(2, 'Quarterly Outlook')]),
        'Expand Quarterly Outlook.',
        context,
      ),
    ).toThrow('one existing slide');
    expect(() =>
      validatePresentationReferences(
        plan([revise(2, 'Cat Body Language')]),
        'Expand the summary.',
        context,
      ),
    ).toThrow('not spoken');
  });
  it('requires a full title or two meaningful title words without an existing failed binding', () => {
    const campaign = structuredClone(context);
    campaign.activePresentation!.slides![0].title = 'Community Garden Campaign';
    for (const targetReference of [undefined, 'community'])
      expect(() =>
        validatePresentationReferences(
          plan([revise(5, targetReference)]),
          'Make the section about the community shorter.',
          campaign,
        ),
      ).toThrow(PresentationReferenceError);
    expect(
      validatePresentationReferences(
        plan([revise(1, 'Community Garden')]),
        'Expand Community Garden.',
        campaign,
      ).operations[0],
    ).toMatchObject({ target: 1 });
    campaign.activePresentation!.slides![6].title = 'Summary';
    expect(
      validatePresentationReferences(plan([revise(7, 'Summary')]), 'Expand Summary.', campaign)
        .operations[0],
    ).toMatchObject({ target: 7 });
  });
  it('retains a short title fragment only when it confirms the current failed stable binding', () => {
    const failed = structuredClone(context);
    failed.lastFailedTask = {
      fields: {},
      transcript: 'Expand slide seven.',
      error: 'The expansion did not fit.',
      artifact: { projectId: 'pets', filename: 'pets.pptx', revision: 4 },
      operations: [
        {
          ...revise(7),
          binding: { projectId: 'pets', targetSlideId: 'summary', boundRevision: 4 },
        },
      ],
    };
    expect(
      validatePresentationReferences(plan([revise(7, 'summary')]), 'For the summary.', failed)
        .operations[0],
    ).toMatchObject({ target: 7 });
    failed.activePresentation!.revision = 5;
    expect(() =>
      validatePresentationReferences(plan([revise(7, 'summary')]), 'For the summary.', failed),
    ).toThrow(PresentationReferenceError);
  });
  it('checks positive references separately from negated alternatives', () => {
    const request = 'Expand slide seven, not slide two.';
    expect(
      validatePresentationReferences(plan([revise(7, 'slide seven')]), request, context)
        .operations[0],
    ).toMatchObject({ target: 7 });
    expect(() =>
      validatePresentationReferences(plan([revise(2, 'slide two')]), request, context),
    ).toThrow('negated');
    expect(
      validatePresentationReferences(plan([revise(2)]), request, context).operations[0],
    ).toMatchObject({ target: 7 });
    expect(
      validatePresentationReferences(
        plan([revise(7, 'slide seven')]),
        "Don't change slide two; expand slide seven instead.",
        context,
      ).operations[0],
    ).toMatchObject({ target: 7 });
  });
  it('accepts quote normalization across spoken fillers without accepting invented references', () => {
    expect(
      validatePresentationReferences(
        plan([revise(7, 'slide seven')]),
        'Expand slide, uh, seven.',
        context,
      ).operations[0],
    ).toMatchObject({ target: 7 });
  });
  it('retains contextual references for the executor to bind when no fresh explicit reference exists', () => {
    const contextual = plan([
      {
        type: 'revise_slide',
        target: 'current',
        instruction: 'Explain it.',
        detailChange: 'expand',
      },
    ]);
    expect(validatePresentationReferences(contextual, 'Explain it more clearly.', context)).toEqual(
      contextual,
    );
    const failed = {
      ...context,
      lastRequestedTarget: {
        projectId: 'pets',
        slideId: 'summary',
        index: 7,
        title: 'Pet Behavior Summary',
        revision: 4,
        operationType: 'revise_slide' as const,
      },
    };
    expect(
      validatePresentationReferences(plan([revise(7)]), 'Try that change again.', failed)
        .operations[0],
    ).toMatchObject({ target: 7 });
  });
  it('distinguishes an explicit target number from an unrelated content number or slide count', () => {
    expect(() =>
      validatePresentationReferences(
        plan([revise(7, 'seven')]),
        'Explain seven examples.',
        context,
      ),
    ).toThrow('not a slide reference');
    expect(
      validatePresentationReferences(plan([revise(7, 'seven')]), 'Explain slide seven.', context)
        .operations[0],
    ).toMatchObject({ target: 7 });
    expect(
      validatePresentationReferences(plan([revise(2)]), 'seven', context).operations[0],
    ).toMatchObject({ target: 7 });
  });
  it('requires individual references in a coordinated slide list', () => {
    expect(() =>
      validatePresentationReferences(
        plan([
          { type: 'read_slide', target: 2 },
          { type: 'read_slide', target: 7 },
        ]),
        'Read slides two and seven.',
        context,
      ),
    ).toThrow('Multiple');
    expect(
      validatePresentationReferences(
        plan([
          { type: 'read_slide', target: 2, targetReference: 'two' },
          { type: 'read_slide', target: 7, targetReference: 'seven' },
        ]),
        'Read slides two and seven.',
        context,
      ).operations,
    ).toMatchObject([{ target: 2 }, { target: 7 }]);
  });
  it('validates image destination against a new creation count, not the old deck', () => {
    const original = plan([
      { type: 'create', topic: 'Trees', totalSlides: 10 },
      { type: 'insert_image', target: 10, targetReference: 'tenth slide' },
    ]);
    original.startsNewTask = true;
    const result = validatePresentationReferences(
      original,
      'Create ten slides about Trees with my image on the tenth slide.',
      context,
    );
    expect(result.operations[1]).toMatchObject({ target: 10 });
    expect(result.fields.imageDestination).toBe(10);
    original.operations[0] = { type: 'create', topic: 'Trees', totalSlides: 6 };
    expect(() =>
      validatePresentationReferences(
        original,
        'Create six slides about Trees with my image on the tenth slide.',
        context,
      ),
    ).toThrow('new');
  });
  it('does not scan old deck titles as references in a newly requested topic', () => {
    const original = plan([
      { type: 'create', topic: 'Cat Body Language', totalSlides: 6 },
      { type: 'insert_image', target: 1 },
    ]);
    original.startsNewTask = true;
    expect(
      validatePresentationReferences(
        original,
        'Create six slides about Cat Body Language with my picture on the first slide.',
        context,
      ).operations[1],
    ).toMatchObject({ target: 1 });
  });
});
