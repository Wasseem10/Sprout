import { it, expect, vi } from 'vitest';
import { spokenSlideTarget } from '../shared/slide-navigation';
import { computerPlan } from '../server/computer/planner';
import { config } from '../server/config';
import { ComputerController } from '../server/computer/controller';

it('resolves natural slide navigation separately from opening the app or reading text', () => {
  for (const request of [
    'Go to slide 2.',
    'Hey, go to slide two',
    'Hey Insight, open the second slide',
    'Can you show me slide number 2?',
    'Go to slide two please.',
  ])
    expect(spokenSlideTarget(request)).toBe(2);
  expect(spokenSlideTarget('Please show the next slide')).toBe('next');
  expect(spokenSlideTarget('Jump to the last slide')).toBe('last');
  expect(spokenSlideTarget('Go to the previous slide')).toBe('previous');
  expect(spokenSlideTarget('Next slide.')).toBe('next');
  expect(spokenSlideTarget('Previous slide please')).toBe('previous');
  expect(spokenSlideTarget('Open PowerPoint')).toBeNull();
  expect(spokenSlideTarget('Read slide two')).toBeNull();
  expect(spokenSlideTarget('Move the image on slide 2')).toBeNull();
});

it('does not spend a model request for a basic navigation command and does not claim completion', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const cfg = { ...config(), hfToken: 'test', cloudUrl: '', host: '127.0.0.1' };
  const state = { folder: null, code: null, browser: null, screen: null };
  const plan = await computerPlan('Open slide two', state, cfg, AbortSignal.timeout(1000));
  expect(plan.action).toEqual({ tool: 'goToSlide', slide: 2 });
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
  const controller = new ComputerController(cfg);
  const result = await controller.request('Go to slide 2.', AbortSignal.timeout(1000));
  expect(result.desktopIntent).toEqual({ kind: 'slide', slide: 2 });
  expect(result.summary).toContain('I’ll select');
  await controller.close();
});

it('rejects a slide outside the current deck before desktop execution', async () => {
  const controller = new ComputerController({ ...config(), host: '127.0.0.1' });
  controller.state.presentation = {
    filename: 'demo.pptx',
    title: 'Demo',
    slideCount: 3,
    slideTitles: ['First', 'Second', 'Third'],
    opened: true,
    sha256: 'a'.repeat(64),
  };
  const result = await controller.request('Go to slide 8', AbortSignal.timeout(1000));
  expect(result.desktopIntent).toBeUndefined();
  expect(result.clarification).toBe(true);
  expect(result.summary).toContain('3 slides');
  await controller.close();
});
