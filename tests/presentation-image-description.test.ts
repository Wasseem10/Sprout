import { describe, expect, it } from 'vitest';
import { hasSuppliedImageDescription } from '../server/computer/presentation-image-description';
import type { PresentationIntentContext, PresentationOperation } from '../shared/presentation-intent';
const context: PresentationIntentContext = { draft: null, lastVerifiedResult: null, conversation: [] };
const op: Extract<PresentationOperation, { type: 'edit_image_description' }> = { type: 'edit_image_description', target: 2, description: 'A blue banner with a white heading.' };
describe('replacement-role grounding for picture descriptions', () => {
  it.each([
    'Set the picture description on slide two to “A blue banner with a white heading.”.',
    'Set the picture description to A blue banner with a white heading.',
    'Describe it as A blue banner with a white heading.',
    'It should say A blue banner with a white heading.',
    'The description should read A blue banner with a white heading.',
    'Picture description: A blue banner with a white heading.',
  ])('accepts a supplied replacement span: %s', request => {
    expect(hasSuppliedImageDescription(request, op, context)).toBe(true);
  });
  it.each(['Fix the picture description on slide two.', 'What is the picture description?', 'A blue banner with a white heading.'])('rejects bare or command-only text without a retained target/question: %s', request => {
    expect(hasSuppliedImageDescription(request, { ...op, description: request }, context)).toBe(false);
  });
  it('accepts bare text only when a description question retains a target', () => {
    const pending: PresentationIntentContext = { ...context, draft: { id: 'pending', generation: 1, workflow: 'edit', fields: {}, transcripts: [], lastSuccessfulArtifact: null, pendingQuestion: { field: 'clarification', question: 'What exact description should I use?' }, operations: [{ ...op, description: 'Earlier proposed wording.' }] } };
    expect(hasSuppliedImageDescription(op.description, op, pending)).toBe(true);
    pending.draft!.pendingQuestion!.question = 'What folder?';
    expect(hasSuppliedImageDescription(op.description, op, pending)).toBe(false);
  });
  it('cannot switch a bare answer to another slide, including when the same wording is already retained', () => {
    const pending: PresentationIntentContext = { ...context, activePresentation: { projectId: 'p', filename: 'fixture.pptx', title: 'Fixture', slideCount: 7, reviewedSlide: 2, slides: [{ id: 'picture', index: 3, title: 'Moved picture' }] }, draft: { id: 'pending', generation: 1, workflow: 'edit', fields: {}, transcripts: [], lastSuccessfulArtifact: null, pendingQuestion: { field: 'clarification', question: 'What exact description should I use?' }, operations: [op] } };
    expect(hasSuppliedImageDescription(op.description, { ...op, target: 7 }, pending)).toBe(false);
    expect(hasSuppliedImageDescription(op.description, { ...op, target: undefined }, pending)).toBe(true);
    pending.draft!.operations[0].binding = { projectId: 'p', targetSlideId: 'picture', boundRevision: 1 };
    expect(hasSuppliedImageDescription(op.description, { ...op, target: 2 }, pending)).toBe(false);
    expect(hasSuppliedImageDescription(op.description, { ...op, target: 3 }, pending)).toBe(true);
    expect(hasSuppliedImageDescription(op.description, { ...op, target: undefined }, pending)).toBe(true);
  });
});
