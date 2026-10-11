import { describe, expect, it } from 'vitest';
import {
  isIncompleteSpokenCommand,
  hasExplicitImageSlide,
  requestedImageSlide,
  wantsExistingSlideImage,
} from '../shared/presentation-edit-intent';

describe('existing slide image intent', () => {
  it.each([
    'Yes, can you pull the image from my folder and, uh, add it to that slide?',
    'Use the image in my Marketing folder on the last slide.',
    'Add one JPG to slide two.',
    'Put the photo on this slide.',
    'Include this PNG on the current slide.',
    'Replace the picture on slide 3.',
    'Add an image to my existing presentation.',
    'Make this presentation blue and add the image to slide two.',
  ])('recognizes image placement in the existing deck: %s', (request) => {
    expect(wantsExistingSlideImage(request)).toBe(true);
  });

  it.each([
    'Create a PowerPoint using my Marketing pictures, with a diagram on the last slide.',
    'Can you make a new presentation and add this image to the last slide?',
    'I need a PowerPoint using these images.',
    'Add pictures to a new deck.',
    'Create five slides using the images, and add a picture to the last slide.',
    'Make a blue PowerPoint using my images and add the picture to the last slide.',
    'Create a presentation about hackathons.',
    'Read the picture on slide two.',
    'Go to the last slide.',
    'Do not add the image to the last slide.',
    'Use my screen.',
  ])('does not turn a different task into an insertion: %s', (request) => {
    expect(wantsExistingSlideImage(request)).toBe(false);
  });
});

describe('image destination slide', () => {
  it.each([
    ['Add the image to our last slide.', 5],
    ['Use this picture on the final slide.', 5],
    ['Add the PNG to slide two.', 2],
    ['Add the PNG to slide number 2.', 2],
    ['Put the photo on the second slide.', 2],
    ['Use the JPG on the 3rd slide.', 3],
    ['Add the image to slide 1.', 1],
    ['Use it on that slide.', 4],
    ['Place it on the current slide.', 4],
    ['Add it to this slide.', 4],
    ['Use it on slide two, the second slide.', 2],
    ['Nice. Okay. Now, can you add an image, a different image in the second, uh, slide?', 2],
    ['I said the second slide.', 2],
    ['Add it to the, um, first slide.', 1],
    ['Use it on slide, uh, two.', 2],
  ])('resolves %s with explicit destinations taking precedence', (request, expected) => {
    expect(requestedImageSlide(request, 4, 5)).toBe(expected);
  });

  it.each([
    'Add it to slide zero.',
    'Add it to slide 0.',
    'Add it to slide -1.',
    'Add it to slide six.',
    'Add it to slide 20.',
    'Add it to slide two and slide three.',
    'Use this picture.',
  ])('rejects an invalid, ambiguous or unspecified destination: %s', (request) => {
    expect(requestedImageSlide(request, 4, 5)).toBeNull();
  });

  it('does not invent a current selection or trust an invalid deck count', () => {
    expect(requestedImageSlide('Add it to that slide.', null, 5)).toBeNull();
    expect(requestedImageSlide('Add it to that slide.', 6, 5)).toBeNull();
    expect(requestedImageSlide('Add it to the last slide.', 1, 0)).toBeNull();
    expect(requestedImageSlide('Add it to slide 2.', 1, 2.5)).toBeNull();
  });

  it('recognizes an explicit invalid destination through speech fillers', () => {
    expect(hasExplicitImageSlide('Add the picture to slide, uh, 99.')).toBe(true);
    expect(requestedImageSlide('Add the picture to slide, uh, 99.', 1, 4)).toBeNull();
    expect(hasExplicitImageSlide('Use the picture on that slide.')).toBe(false);
  });
});

describe('incomplete speech fragments', () => {
  it.each([
    'Um, can you create for me...',
    'A...',
    'Uh...',
    'Well, um...',
    'Can you...',
    'Could you please create a...',
    'I want you to...',
    'Hey Insight, can you create for me…',
    '',
  ])('waits for a real command rather than repeating an old task: %s', (request) => {
    expect(isIncompleteSpokenCommand(request)).toBe(true);
  });

  it.each([
    'Can you create a PowerPoint?',
    'Um, can you create for me a presentation about hackathons?',
    'Make a marketing plan using my images...',
    'Open Marketing folder.',
    'Add a JPG to the last slide.',
    'A marketing presentation.',
    'No.',
    'Yes.',
    'Dark minimal.',
    'Go to slide two.',
    'Read it.',
  ])('preserves complete commands and short answers: %s', (request) => {
    expect(isIncompleteSpokenCommand(request)).toBe(false);
  });
});
