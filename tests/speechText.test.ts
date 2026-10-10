import { describe, expect, it } from 'vitest';
import type { BrowserView, ComputerResult } from '../shared/computer';
import {
  cleanSpeechText,
  spokenComputerReply,
  spokenRequestAcknowledgment,
} from '../src/speechText';

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
  it('speaks the current clarification even if stale state is incorrectly labeled as a code result', () => {
    const result: ComputerResult = {
      summary: 'Hi, I am here. What would you like to do?',
      clarification: true,
      state: {
        folder: null,
        browser: null,
        screen: null,
        code: {
          filename: 'old.py',
          code: 'print(1)',
          provider: 'hugging-face',
          sha256: 'old',
          output: '1',
          exitCode: 0,
          status: 'completed',
          editorOpened: true,
        },
      },
    };
    expect(spokenComputerReply(result, 'runCode')).toBe(result.summary);
  });
  it('omits navigation URLs while naming the current page', () => {
    const speech = spokenComputerReply(
      reply(
        'Browser opened the website. Current page: Software Engineer Jobs in Orlando. https://jobs.example.com/view?jk=85466af3251b42dc0e',
        browser(),
      ),
      'navigate',
    );
    expect(speech).toBe('I opened Software Engineer Jobs in Orlando.');
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
    expect(speech).toContain('First, Library assistant jobs in Orlando');
    expect(speech).toContain('Second, Customer support openings');
    expect(speech).toContain('$25 per hour');
    expect(speech).not.toContain('https://');
    expect(speech).not.toContain('6c8903');
  });

  it('keeps the next spoken step even when search results are verbose', () => {
    const view = browser({
      searchResults: Array.from({ length: 5 }, (_, index) => ({
        title: `A very long job listing title describing multiple positions and benefits number ${index}`,
        url: `https://example.com/jobs/${index}`,
        snippet:
          'A long summary about scheduling, salary, benefits, training, duties, and location.',
      })),
    });
    const speech = spokenComputerReply(reply('Opened Google. Results for jobs:', view), 'search');
    expect(speech).toContain('Say open result one to continue.');
    expect(speech).not.toContain('number 2');
    expect(speech.length).toBeLessThanOrEqual(350);
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
      'I made a 4-slide PowerPoint about George Washington. I opened it in PowerPoint.',
    );
  });

  it('acknowledges likely work without claiming it already happened', () => {
    expect(spokenRequestAcknowledgment('Find me jobs near me')).toBe(
      "I'll look for jobs near you.",
    );
    expect(spokenRequestAcknowledgment('Make a PowerPoint about George Washington')).toBe(
      "I'll make the slides.",
    );
    expect(spokenRequestAcknowledgment('Click Apply')).toBe("I'll check the Apply button.");
    expect(spokenRequestAcknowledgment('Tell me a joke')).toBeNull();
    expect(
      spokenRequestAcknowledgment('Open Calculator', { tool: 'openApp', app: 'calculator' }),
    ).toBe("I'll open the app.");
  });

  it('reports an app as opened or focused based on the actual result', () => {
    const result = reply('Focused Calculator.', null);
    result.state.lastApp = { app: 'calculator', name: 'Calculator', mode: 'focused' };
    expect(spokenComputerReply(result, 'openApp')).toBe('I switched to Calculator.');
  });

  it('gives application next steps without reading the whole form', () => {
    const view = browser({
      title: 'Apply for Library Assistant',
      controls: [
        { id: '1', role: 'textbox', name: 'Name', sensitive: true, blocked: false },
        { id: '2', role: 'textbox', name: 'Email', sensitive: true, blocked: false },
        { id: '3', role: 'textbox', name: 'Phone', sensitive: true, blocked: false },
        { id: '4', role: 'textbox', name: 'Password', sensitive: true, blocked: true },
      ],
    });
    const speech = spokenComputerReply(
      reply(
        'Opened Apply for Library Assistant. I found text fields: Name, Email, Phone. Say “fill Email with your answer” to type in one. This site asks for account access, which you must complete manually. I will not submit the application.',
        view,
      ),
      'click',
    );
    expect(speech).toContain('The application page is open.');
    expect(speech).toContain('Name, Email, Phone');
    expect(speech).toContain('sign in yourself');
    expect(speech).not.toContain('Password');
  });

  it('speaks the completed job-search path rather than random page text', () => {
    const view = browser({
      title: 'Library Assistant Application',
      text: 'Navigation Menu 8bf6c9901d Some random page text that should stay in the transcript.',
      controls: [{ id: '1', role: 'textbox', name: 'Email', sensitive: true, blocked: false }],
    });
    const speech = spokenComputerReply(
      reply(
        'Found Library Assistant in Orlando and opened its application page. Opened Library Assistant Application. I found text fields: Email. I will not submit the application.',
        view,
      ),
      'readPage',
    );
    expect(speech).toContain(
      'I found Library Assistant in Orlando and opened the application page',
    );
    expect(speech).toContain('help fill Email');
    expect(speech).not.toContain('random page text');
  });

  it('summarizes workbook findings without speaking a hashed filename', () => {
    const result = reply(
      'sales-demo-synthetic.xlsx (synthetic sample), sheet Synthetic sales has 6 data rows. Revenue totals 6,200 across 6 numeric cells; average 1,033.33. Highest Region: East with 2,700 Revenue. Opened sales-demo-synthetic.xlsx in Excel.',
      null,
    );
    result.state.spreadsheet = {
      filename: 'sales-demo-synthetic.xlsx',
      sheet: 'Synthetic sales',
      rows: 6,
      summary:
        'sales-demo-synthetic.xlsx (synthetic sample), sheet Synthetic sales has 6 data rows. Revenue totals 6,200 across 6 numeric cells; average 1,033.33. Highest Region: East with 2,700 Revenue.',
      sha256: 'x',
      opened: true,
    };
    const speech = spokenComputerReply(result, 'analyzeSpreadsheet');
    expect(speech).toContain('Revenue totals 6,200');
    expect(speech).toContain('East with 2,700 Revenue is the top region');
    expect(speech).toContain('I opened it in Excel');
    expect(speech).not.toContain('.xlsx');
  });

  it('names Databricks without reading its query reference aloud', () => {
    const result = reply(
      'sales-demo-synthetic.xlsx has 6 data rows. Databricks calculated Revenue: total 6,200 across 6 numeric cells; average 1,033.33. Highest Region: East with 2,700 Revenue.',
      null,
    );
    result.state.spreadsheet = {
      filename: 'sales-demo-synthetic.xlsx',
      sheet: 'Synthetic sales',
      rows: 6,
      summary: result.summary,
      sha256: 'x',
      opened: false,
      provider: 'databricks',
      queryReference: '4f3bd97e-567a-4e0b-8a96-4b9c322d921d',
    };
    const speech = spokenComputerReply(result, 'analyzeSpreadsheet');
    expect(speech).toContain('Databricks calculated revenue of 6,200');
    expect(speech).not.toContain('4f3bd97e');
  });

  it('preserves negative and decimal workbook values', () => {
    const result = reply(
      'returns.xlsx, sheet Returns has 4 data rows. Profit totals -1,234.5 across 4 numeric cells; average -308.63. Highest Region: East with -12.75 Profit.',
      null,
    );
    result.state.spreadsheet = {
      filename: 'returns.xlsx',
      sheet: 'Returns',
      rows: 4,
      summary: result.summary,
      sha256: 'x',
      opened: false,
      provider: 'local',
    };
    const speech = spokenComputerReply(result, 'analyzeSpreadsheet');
    expect(speech).toContain('Profit totals -1,234.5');
    expect(speech).toContain('East with -12.75 Profit is the top region');
    expect(speech).not.toContain('no reliable number');
  });

  it('does not claim Office opened when it failed', () => {
    const result = reply(
      'Created editable PowerPoint george-washington-f6bb920e.pptx in demo. 4 slides. The file is saved, but PowerPoint could not open: unavailable.',
      null,
    );
    result.state.presentation = {
      filename: 'george-washington-f6bb920e.pptx',
      title: 'George Washington',
      slideCount: 4,
      slideTitles: ['Introduction'],
      opened: false,
      sha256: 'x',
    };
    expect(spokenComputerReply(result)).toContain('PowerPoint could not open it');
    expect(spokenComputerReply(result)).not.toContain('I opened it');
  });

  it('speaks only the beginning of a screen description', () => {
    const result = reply(
      'A browser shows job listings. The Apply button is on the right. Below it is a long list of unrelated navigation links and promotional text.',
      null,
    );
    result.state.screen = {
      name: 'Main display',
      image: 'data:image/png;base64,x',
      capturedAt: '2026-10-10T00:00:00.000Z',
      description: result.summary,
    };
    expect(spokenComputerReply(result, 'describeScreen')).toBe(
      'A browser shows job listings. The Apply button is on the right.',
    );
  });

  it('reports a short Python result without its generated filename', () => {
    const result = reply(
      'Created fibonacci-cabbdf8b.py in demo. Executed fibonacci-cabbdf8b.py with Python. Exit code: 0. Output: 55',
      null,
    );
    result.state.code = {
      filename: 'fibonacci-cabbdf8b.py',
      code: 'print(55)',
      provider: 'hugging-face',
      sha256: 'x',
      output: '55',
      exitCode: 0,
      status: 'completed',
      editorOpened: true,
    };
    const speech = spokenComputerReply(result, 'runCode');
    expect(speech).toBe(
      'I wrote and ran the Python program. It is open in VS Code. It printed 55.',
    );
    expect(speech).not.toContain('cabbdf8b');
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
