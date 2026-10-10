import { describe, expect, it } from 'vitest';
import type { BrowserView, ComputerResult } from '../shared/computer';
import { cleanSpeechText, spokenComputerReply } from '../src/speechText';

function browser(overrides: Partial<BrowserView> = {}): BrowserView {
  return {
    id: 'page-one',
    url: 'https://jobs.example.com/view?jk=85466af3251b42dc0e',
    title: 'Software Engineer Jobs in Orlando',
    text: '',
    controls: [],
    searchResults: [],
    image: '',
    capturedAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  };
}
function reply(summary: string, view: BrowserView | null): ComputerResult {
  return { summary, state: { folder: null, code: null, browser: view, screen: null } };
}

describe('spoken computer replies', () => {
  it('omits navigation URLs while naming the current page', () => {
    const speech = spokenComputerReply(
      reply(
        'Browser opened the website. Current page: Software Engineer Jobs in Orlando. https://jobs.example.com/view?jk=85466af3251b42dc0e',
        browser(),
      ),
      'navigate',
    );
    expect(speech).toBe('Opened the website. Current page: Software Engineer Jobs in Orlando.');
    expect(speech).not.toContain('85466');
  });

  it('speaks numbered search titles and useful snippets, not tracking codes', () => {
    const view = browser({
      searchResults: [
        {
          title: 'Library assistant jobs in Orlando',
          url: 'https://example.com/?id=abc123',
          snippet:
            'Apply to part-time library assistant roles near Orlando. Job ID 6c8903fb0a181af05dd7.',
        },
        {
          title: 'Customer support openings',
          url: 'https://example.com/jobs',
          snippet: 'Remote and local jobs paying $25 per hour.',
        },
      ],
    });
    const speech = spokenComputerReply(
      reply('Opened Google. Results for jobs near me:\n...', view),
      'search',
    );
    expect(speech).toContain('1: Library assistant jobs in Orlando');
    expect(speech).toContain('2: Customer support openings');
    expect(speech).toContain('$25 per hour');
    expect(speech).not.toContain('https://');
    expect(speech).not.toContain('6c8903');
  });

  it('skips noisy navigation and reads meaningful job details', () => {
    const view = browser({
      text: 'Skip to main content\nSign in\n123ABC-90818\nPrivacy Policy and Cookies\nThis Orlando library is hiring a part-time assistant to help visitors find books and use computers.\nThe role pays $25 per hour and includes evening shifts at the downtown location.',
    });
    const speech = spokenComputerReply(reply(`${view.title}. ${view.text}`, view), 'readPage');
    expect(speech).toContain('part-time assistant');
    expect(speech).toContain('$25 per hour');
    expect(speech).not.toContain('Skip to main content');
    expect(speech).not.toContain('123ABC');
  });

  it('summarizes a created deck without reading its generated filename hash', () => {
    const result = reply(
      'Created editable PowerPoint george-washington-f6bb920e.pptx in demo. 4 slides.',
      null,
    );
    result.state.presentation = {
      filename: 'george-washington-f6bb920e.pptx',
      title: 'George Washington',
      slideCount: 4,
      slideTitles: ['Introduction'],
      opened: true,
      sha256: 'x',
    };
    expect(spokenComputerReply(result)).toBe(
      'Created a 4-slide PowerPoint about George Washington. Opened it in PowerPoint.',
    );
  });

  it('preserves intentional contact read-back and meaningful numbers', () => {
    expect(
      spokenComputerReply(
        reply('I heard “jane@example.com” for Email. Say “confirm fill” to type it.', browser()),
      ),
    ).toContain('jane@example.com');
    expect(
      cleanSpeechText(
        'The pay is $25 per hour. Reference 【123】 https://example.com/?id=abc and 6c8903fb0a181af05dd7.',
      ),
    ).toBe('The pay is $25 per hour.');
  });
});
