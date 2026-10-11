import { describe, expect, it } from 'vitest';
import { migratePresentationSessionV3, presentationSessionSchema, presentationSessionV3Schema } from '../shared/presentation-session';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../shared/presentation-deck';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const legacy = {
  title: 'Campaign review', subtitle: 'Proposed campaign workflow', theme: 'blue' as const,
  slides: [1, 2].map(imageId => ({ imageId, title: `Picture ${imageId}`, points: ['Describe the supplied picture.', 'Review the proposed campaign.'] })),
  diagram: { title: 'Review process', stages: [
    { label: 'Prepare', detail: 'Prepare a proposed campaign draft.' },
    { label: 'Review', detail: 'Review its content and accessibility.' },
    { label: 'Publish', detail: 'Publish after the review is complete.' },
  ] },
};
const sources = [1, 2].map(imageId => ({ id: imageId, filename: `image${imageId}.png`, description: 'Supplied campaign picture.', sha256: String(imageId).repeat(64), width: 200, height: 100 }));
const ordered: OrderedPresentationDeck = {
  schemaVersion: 2, title: legacy.title, theme: 'blue', textScale: 1, allowImageReuse: false,
  slides: [
    { id: 'keep-cover-id', type: 'cover', title: legacy.title, subtitle: legacy.subtitle },
    { id: 'keep-image-id', type: 'image', title: 'Campaign picture', points: ['Review the supplied campaign picture and its context.'], caption: 'Supplied picture', layout: 'split', imageId: 1, imageSide: 'left', titleScale: 1.1 },
    { id: 'keep-text-id', type: 'text', title: 'Review', layout: 'two-column', points: ['Review the actual message before sharing the proposed campaign.', 'Check that everyone can understand its purpose and next step.'] },
  ],
};

describe('version-three visual presentation sessions', () => {
  it('migrates V2 and every undo snapshot verbatim without mutating content or IDs', () => {
    const before = { schemaVersion: 2 as const, id, revision: 2, deck: legacyDeckProjection(ordered), orderedDeck: ordered, sources: [sources[0]],
      history: [{ revision: 1, deck: legacyDeckProjection(ordered), orderedDeck: { ...ordered, theme: 'dark' as const } }] };
    const original = structuredClone(before);
    const migrated = migratePresentationSessionV3(before);
    expect(migrated).toEqual({ ...original, schemaVersion: 3 });
    expect(before).toEqual(original);
    expect(migratePresentationSessionV3(migrated)).toEqual(migrated);
    expect(presentationSessionSchema.parse(migrated)).toEqual(migrated);
  });

  it('migrates V1 reordered history using project and image identities, not positions', () => {
    const old = { schemaVersion: 1 as const, id, revision: 2, deck: legacy, sources,
      history: [{ revision: 1, deck: { ...legacy, slides: [...legacy.slides].reverse() } }] };
    const migrated = migratePresentationSessionV3(old);
    const current = migrated.orderedDeck.slides.filter(slide => slide.type === 'image');
    const history = migrated.history[0].orderedDeck.slides.filter(slide => slide.type === 'image');
    expect(current.map(slide => slide.id)).toEqual(history.map(slide => slide.id).reverse());
    expect(current[0].id).toBe(`p-${id}-source-1`);
    expect(migrated.orderedDeck.slides[0].id).toBe(migrated.history[0].orderedDeck.slides[0].id);
    expect(old.history[0].deck.slides[0].imageId).toBe(2);
  });

  it('refuses ambiguous repeated legacy source identities rather than inventing slide identity', () => {
    expect(() => migratePresentationSessionV3({ schemaVersion: 1, id, revision: 1,
      deck: { ...legacy, slides: [legacy.slides[0], legacy.slides[0]] }, sources, history: [] }))
      .toThrow('Use each source image exactly once');
  });

  it('enforces source and ordered history invariants for V3', () => {
    const session = migratePresentationSessionV3({ schemaVersion: 2, id, revision: 2,
      deck: legacyDeckProjection(ordered), orderedDeck: ordered, sources: [sources[0]], history: [] });
    expect(presentationSessionV3Schema.safeParse({ ...session, sources: [] }).success).toBe(false);
    expect(presentationSessionV3Schema.safeParse({ ...session,
      history: [{ revision: 2, deck: session.deck, orderedDeck: session.orderedDeck }] }).success).toBe(false);
    expect(presentationSessionV3Schema.safeParse({ ...session,
      orderedDeck: { ...ordered, slides: [...ordered.slides, ordered.slides[0]] } }).success).toBe(false);
  });
});
