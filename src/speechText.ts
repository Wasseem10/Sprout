import type { BrowserView, ComputerResult } from '../shared/computer';

// The transcript remains complete; speech should be a concise description of the result.
// In particular, browser URLs and tracking IDs are useful to inspect, but not to hear.
export function cleanSpeechText(value: string, limit = 680): string {
  let text = value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(
      /\b(?:job\s*id|tracking\s*id|session\s*id|reference|ref|sku)\s*[:#]?\s*(?:【[^】]{1,80}】|\[\d+(?:,\s*\d+)*\]|[a-z0-9_-]{8,})/gi,
      ' ',
    )
    .replace(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi, ' ')
    .replace(/【[^】]{1,80}】|\[(?:source|citation|ref)?\s*\d+(?:,\s*\d+)*\]/gi, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b(?:[0-9a-f]{16,}|(?=[\w]{20,}\b)(?=[\w]*\d)(?=[\w]*[a-z])[\w]+)\b/gi, ' ')
    .replace(/\b[\w.-]+\.pptx\b/gi, 'PowerPoint file')
    .replace(/\b[\w.-]+\.xlsx\b/gi, 'Excel workbook')
    .replace(/[ \t]+/g, ' ')
    .replace(/\b(?:and|or)\s*(?=[.!?])/gi, '')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([.!?])(?:\s*[.!?])+/g, '$1')
    .replace(/\n\s+/g, '\n')
    .trim();
  if (text.length > limit) {
    const cut = text.slice(0, limit + 1);
    text = cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 60)).trimEnd() + '…';
  }
  return text;
}

function usefulLines(body: string): string[] {
  const lines = body
    .split(/\n+/)
    .map((line) =>
      cleanSpeechText(line, 240)
        .replace(/\.\.\.$/, '')
        .trim(),
    )
    .filter((line) => {
      if (line.length < 38 || /^(skip to|sign in|log in|menu|navigation|advertisement)/i.test(line))
        return false;
      if (/\b(cookies?|privacy policy|terms of service|accept all)\b/i.test(line)) return false;
      const letters = (line.match(/\p{L}/gu) ?? []).length;
      const words = (line.match(/\p{L}{2,}/gu) ?? []).length;
      return words >= 6 && letters / line.length >= 0.48;
    });
  return [...new Set(lines)].slice(0, 3);
}

function browserSpeech(browser: BrowserView, summary: string, tool?: string): string | null {
  const title = cleanSpeechText(browser.title, 130) || 'the page';
  if (
    (/^Opened Google\.|^Google asked for verification|^.*Results for /i.test(summary) ||
      (tool === 'readPage' && browser.searchResults.length > 0)) &&
    browser.searchResults.length > 0
  ) {
    const results = browser.searchResults.slice(0, 3).map((item, index) => {
      const name = cleanSpeechText(item.title, 105);
      const snippet = cleanSpeechText(item.snippet, 115);
      const detail =
        snippet && !snippet.toLowerCase().startsWith(name.toLowerCase()) ? ` ${snippet}` : '';
      return `${index + 1}: ${name}.${detail}`;
    });
    return cleanSpeechText(
      `I found ${browser.searchResults.length} results. ${results.join(' ')} Say open result one to continue.`,
    );
  }
  if (/^Browser (?:typed|clicked|went back|opened the website)/.test(summary)) {
    const action = summary.startsWith('Browser typed')
      ? 'Filled the selected field.'
      : summary.startsWith('Browser clicked')
        ? 'Clicked the selected control.'
        : summary.startsWith('Browser went back')
          ? 'Went back.'
          : 'Opened the website.';
    return cleanSpeechText(`${action} Current page: ${title}.`);
  }
  if (tool === 'readPage' || summary.startsWith(`${browser.title}.`)) {
    const lines = usefulLines(browser.text);
    return cleanSpeechText(
      lines.length
        ? `This page is ${title}. ${lines.join(' ')}`
        : `This page is ${title}. I could not find clear text to read aloud.`,
    );
  }
  return null;
}

export function spokenComputerReply(result: ComputerResult, tool?: string): string {
  const { summary, state } = result;
  if (/^Created editable PowerPoint/.test(summary) && state.presentation) {
    const deck = state.presentation;
    return cleanSpeechText(
      `Created a ${deck.slideCount}-slide PowerPoint about ${deck.title}. ${deck.opened ? 'Opened it in PowerPoint.' : 'It is ready to open.'}`,
    );
  }
  if (state.browser) {
    const speech = browserSpeech(state.browser, summary, tool);
    if (speech) return speech;
  }
  return cleanSpeechText(summary);
}
