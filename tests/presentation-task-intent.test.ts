import { expect, it } from 'vitest';
import { startsFreshPresentationTask } from '../shared/presentation-task-intent';

const goal = 'Create a PowerPoint about hackathons using the images in my Marketing folder.';

it.each([
  'Create a Black History Month presentation.',
  'Make me a Black History Month PowerPoint.',
  'Make me a presentation for Black History Month.',
  'Could you please create a presentation about Black History Month?',
  'Create a climate change presentation.',
  'Create another presentation.',
  'Make a new PowerPoint about hackathons.',
  'I want a PowerPoint about Black History Month.',
  'I need a Black History Month presentation.',
  'I need help creating a PowerPoint about Black History Month.',
  'I need help with making a presentation for Black History Month.',
  'I want you to create a Black History Month deck.',
  'I need to make a presentation about Black History Month.',
  'I’d like a PowerPoint about Black History Month.',
])('starts a new presentation task for %s', (request) => {
  expect(startsFreshPresentationTask(request, goal)).toBe(true);
});

it.each([
  'How many slides will you make?',
  'Which model helps you create my slides?',
  'Would you recommend a dark theme for my presentation?',
  'Can you make my PowerPoint using the folder images?',
  'Please create the presentation with these pictures.',
  'Make my PowerPoint about hackathons using these images.',
  'Make my presentation clean blue.',
  'Make it a clean blue presentation.',
  'Change my presentation title to Black History Month.',
  'For Black History Month?',
  'Can you create for me a PowerPoint using folder images?',
  'Can you create a PowerPoint for me using folder images?',
  'I need a PowerPoint using the folder images.',
  'I want a PowerPoint about hackathons.',
  'I need help creating a presentation about hackathons.',
  'I need help using PowerPoint.',
  'I want to open PowerPoint.',
  'Do I need a PowerPoint about Black History Month?',
  'What do I need to make a PowerPoint about Black History Month?',
  'Make my existing PowerPoint using these images.',
])('preserves the current task for %s', (request) => {
  expect(startsFreshPresentationTask(request, goal)).toBe(false);
});

it('allows an initial generic creation request without an earlier topic', () => {
  expect(startsFreshPresentationTask('Can you make a PowerPoint?', null)).toBe(true);
  expect(startsFreshPresentationTask('How many slides will you make?', null)).toBe(false);
});
