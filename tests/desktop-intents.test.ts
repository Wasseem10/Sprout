import { expect, it } from 'vitest';
import { spokenDesktopApp } from '../src/desktopIntents';
import { screenNavigationGoal, wantsCurrentScreen } from '../src/screenNavigation';
import { isOtherAssistantTurn } from '../src/voiceTurns';

it('separates automatic screen access from a navigation goal and a presentation edit', () => {
  for (const text of [
    'And use my screen.',
    'Hey Insight, look at my desktop',
    'take control of my computer',
    'Can you see my screen?',
  ]) {
    expect(wantsCurrentScreen(text)).toBe(true);
    expect(screenNavigationGoal(text)).toBeNull();
  }
  expect(
    screenNavigationGoal('Hey Insight, use my screen to click Marketing then open Sources'),
  ).toBe('click Marketing then open Sources');
  expect(spokenDesktopApp('Can you use that JPG in PowerPoint?')).toBeNull();
  expect(spokenDesktopApp('Hey Insight, open chroms')).toBe('chrome');
  expect(spokenDesktopApp('Please switch to Excel')).toBe('excel');
  expect(isOtherAssistantTurn('Hey ChatGPT, help me with this')).toBe(true);
  expect(isOtherAssistantTurn('Hey Insight, stop')).toBe(false);
});
