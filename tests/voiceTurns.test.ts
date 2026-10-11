import { expect, it } from 'vitest';
import {
  isIncompleteVoiceThought,
  isInterruptionTranscript,
  isOtherAssistantTurn,
  isUrgentVoiceTurn,
  joinVoiceSegments,
  shouldJoinVoiceSegments,
  voiceTurnDelay,
} from '../src/voiceTurns';

it('accepts short spoken corrections immediately, including no', () => {
  for (const text of [
    'no',
    'No!',
    'yes',
    'okay',
    'open',
    'next',
    'wait',
    'Stop.',
    'pause',
    'actually',
    'open the folder',
  ])
    expect(isInterruptionTranscript(text), text).toBe(true);
});

it('ignores empty fragments and turns explicitly addressed to another assistant', () => {
  for (const text of ['', '  ', 'h', 'um', 'Hey ChatGPT help me', 'Gemini, stop'])
    expect(isInterruptionTranscript(text), text).toBe(false);
  expect(isInterruptionTranscript('Hey Insight, stop')).toBe(true);
});

it('ignores questions addressed to another assistant even when they mention Insight', () => {
  for (const text of [
    'Hey ChatGPT, why is Insight not responding?',
    'Codex fix Insight',
    'Okay Gemini, help me with Insight',
  ]) {
    expect(isOtherAssistantTurn(text), text).toBe(true);
    expect(isInterruptionTranscript(text), text).toBe(false);
  }
  expect(isOtherAssistantTurn('Hey Insight, open ChatGPT')).toBe(false);
});

it.each([
  'Can you add, um, an image from my, uh...',
  'Um, can you create for me...',
  'A...',
  'Um...',
  'Create a PowerPoint about',
  'Use the image from my',
  'Add an image using',
])('holds an unfinished spoken thought: %s', (text) => {
  expect(isIncompleteVoiceThought(text)).toBe(true);
  expect(voiceTurnDelay(text)).toBeGreaterThanOrEqual(1500);
});

it.each([
  'Create a presentation about Black History Month',
  'Open the Marketing folder',
  'Dark minimal',
  'Add my image to the last slide',
  'Read slide two',
])('does not impose the unfinished-thought delay on a complete turn: %s', (text) => {
  expect(isIncompleteVoiceThought(text)).toBe(false);
  expect(voiceTurnDelay(text)).toBeLessThan(500);
});

it('joins the exact paused folder/image request without deleting either segment', () => {
  const first = 'Can you add, um, an image from my, uh...';
  const second = 'Marketing folder for Black History Month';
  expect(shouldJoinVoiceSegments(first, second)).toBe(true);
  expect(joinVoiceSegments(first, second)).toBe(
    'Can you add, um, an image from my, uh Marketing folder for Black History Month',
  );
});

it('joins a trailing topic, but treats a fresh imperative as its own instruction', () => {
  expect(shouldJoinVoiceSegments('Create a presentation', 'for Black History Month')).toBe(true);
  expect(shouldJoinVoiceSegments('Open Chrome', 'Read slide two')).toBe(false);
  expect(shouldJoinVoiceSegments('Open Chrome', 'Open Chrome')).toBe(false);
});

it('does not repeat a prefix when a provider final expands an earlier segment', () => {
  expect(
    shouldJoinVoiceSegments('Create a presentation.', 'Create a presentation about hackathons'),
  ).toBe(true);
  expect(joinVoiceSegments('Create a presentation', 'Create a presentation about hackathons')).toBe(
    'Create a presentation about hackathons',
  );
});

it('removes provider punctuation at a conversational join without dropping words', () => {
  expect(joinVoiceSegments('Use the image from my.', 'Marketing folder')).toBe(
    'Use the image from my Marketing folder',
  );
});

it.each(['Stop', 'No!', 'Cancel.', 'Hey Insight, wait', 'Pause'])(
  'never delays or appends an urgent correction: %s',
  (text) => {
    expect(isUrgentVoiceTurn(text)).toBe(true);
    expect(voiceTurnDelay(text)).toBe(0);
    expect(shouldJoinVoiceSegments('Can you create for me...', text)).toBe(false);
  },
);

it.each(["No, don't do that, actually.", 'Do not do that.', 'Never mind.', 'Cancel please.'])(
  'whole-task cancellation supersedes a buffered unfinished request: %s',
  (text) => {
    expect(isUrgentVoiceTurn(text)).toBe(true);
    expect(voiceTurnDelay(text)).toBe(0);
    expect(
      shouldJoinVoiceSegments('Create a PowerPoint about Black History Month in, um...', text),
    ).toBe(false);
  },
);

it.each([
  'No, use dark blue instead.',
  'No, the second slide.',
  'Actually, put it on the first slide.',
])('keeps a correction available to semantic interpretation: %s', (text) => {
  expect(isUrgentVoiceTurn(text)).toBe(false);
  expect(voiceTurnDelay(text)).toBe(350);
});
