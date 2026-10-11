import { expect, it } from 'vitest';
import { presentationDifferences } from '../shared/presentation-change';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';

const deck: OrderedPresentationDeck = { schemaVersion: 2, title: 'Campaign', theme: 'blue', textScale: 1, allowImageReuse: false, slides: [
  { id: 'a', type: 'cover', title: 'Campaign', subtitle: 'Proposed review process' },
  { id: 'b', type: 'text', title: 'Review', points: ['Review the message and ask for feedback before publishing it.'] },
  { id: 'c', type: 'image', title: 'Picture', imageId: 1, caption: 'Source picture', layout: 'split', points: ['Use this picture to explain the proposed campaign clearly.'] },
] };
it('reports layout and title size as style without inventing a wording change', () => {
  const next = structuredClone(deck);
  if (next.slides[1].type !== 'text' || next.slides[2].type !== 'image') throw new Error('fixture');
  next.slides[1].layout = 'two-column'; next.slides[1].titleScale = 1.1;
  next.slides[2].imageSide = 'left';
  expect(presentationDifferences(deck, next).map(change => [change.slideId, change.changes]))
    .toEqual([['b', ['style']], ['c', ['style']]]);
});
it('retains distinct content and style changes in a combined edit', () => {
  const next = structuredClone(deck);
  if (next.slides[1].type !== 'text') throw new Error('fixture');
  next.slides[1].layout = 'two-column'; next.slides[1].points.push('Record the feedback before approving the proposed campaign.');
  expect(presentationDifferences(deck, next)[0].changes).toEqual(['content', 'style']);
});
