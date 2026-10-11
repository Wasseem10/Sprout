import { expect, it } from 'vitest';
import type { ComputerState } from '../shared/computer';
import { groundedPresentationReply, presentationNavigationFailure } from '../shared/presentation-feedback';

const state: ComputerState = {
  folder: null,
  code: null,
  browser: null,
  screen: null,
  presentation: {
    filename: 'current.pptx',
    title: 'Current deck',
    slideCount: 4,
    slideTitles: ['Cover', 'Second', 'Third', 'Last'],
    sha256: 'a'.repeat(64),
    opened: true,
    imageEdits: [{ slide: 1, filename: 'old-picture.jpg', altText: 'Previously inserted picture' }],
    desktopNavigation: { status: 'failed', requestedSlide: 2, message: 'Verification unavailable.' },
  },
};

it('recovers the current navigation target without reporting an unrelated historical picture as a new edit', () => {
  const response = presentationNavigationFailure(state);
  expect(response).toContain('go to slide 2');
  expect(response).not.toMatch(/slide 1|picture|saved/);
  expect(groundedPresentationReply('I have selected slide 2.', state)).toBe(response);
  expect(state.presentation?.selectedSlide).toBeUndefined();
});

it('retains an explicitly supplied current write separately from the failed view', () => {
  const response = presentationNavigationFailure(state, {
    savedEditSummary: 'I shortened slide two and saved the new revision.',
  });
  expect(response).toMatch(/^I shortened slide two and saved the new revision\./);
  expect(response).toContain('I couldn’t confirm');
  expect(response).toContain('go to slide 2');
  expect(response).not.toMatch(/slide 1|picture/);
});

it('does not blindly repeat relative navigation after an unverified movement', () => {
  const relative = structuredClone(state);
  relative.presentation!.desktopNavigation!.requestedSlide = 'next';
  const response = presentationNavigationFailure(relative);
  expect(response).toContain('trying to select the next slide');
  expect(response).toContain('Tell me a slide number');
  expect(response).not.toContain('go to the next slide');
});
