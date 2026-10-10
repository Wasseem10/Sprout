import type { BrowserView, ComputerAction, ComputerResult } from '../shared/computer';

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
    .replace(/\b(?=[0-9a-f]{10,}\b)(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]+\b/gi, ' ')
    .replace(/\b(?:[0-9a-f]{16,}|(?=[\w]{20,}\b)(?=[\w]*\d)(?=[\w]*[a-z])[\w]+)\b/gi, ' ')
    .replace(/\b[\w.-]+\.pptx\b/gi, 'PowerPoint file')
    .replace(/\b[\w.-]+\.xlsx\b/gi, 'Excel workbook')
    .replace(/\b[\w.-]+\.py\b/gi, 'Python file')
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

// Acknowledgment describes intent, never success. The caller speaks it while work is pending.
export function spokenRequestAcknowledgment(
  request: string,
  action?: ComputerAction,
): string | null {
  switch (action?.tool) {
    case 'createCode':
      return "I'll write the program.";
    case 'runCode':
      return "I'll run the program.";
    case 'openEditor':
      return "I'll open it in VS Code.";
    case 'createPresentation':
      return "I'll make the slides.";
    case 'openPresentation':
      return "I'll open the PowerPoint.";
    case 'analyzeSpreadsheet':
      return "I'll check the workbook.";
    case 'openSpreadsheet':
      return "I'll open the workbook in Excel.";
    case 'search':
      return /\b(?:jobs?|employment|openings?|hiring)\b/i.test(action.query)
        ? "I'll look for job openings."
        : "I'll search for that.";
    case 'navigate':
      return "I'll open that page.";
    case 'openSearchResult':
      return "I'll open that result.";
    case 'readPage':
      return "I'll read the page.";
    case 'goBack':
      return "I'll go back.";
    case 'click':
      return "I'll check that button.";
    case 'fill':
    case 'confirmFill':
      return "I'll check that field.";
    case 'describeScreen':
      return "I'll describe the screen.";
    case 'openApp':
      return "I'll open the app.";
    case 'pursueBrowserGoal':
      return action.kind === 'job' ? "I'll look for jobs." : "I'll look for options.";
    case 'locateScreenTarget':
      return "I'll look for that button.";
  }
  const text = request.trim();
  if (/\b(?:find|search|look for|show me)\b.*\b(?:jobs?|employment|openings?|hiring)\b/i.test(text))
    return /\bnear me\b/i.test(text)
      ? "I'll look for jobs near you."
      : "I'll look for job openings.";
  if (
    /\b(?:create|make|build|prepare|put together)\b.*\b(?:powerpoint|presentation|slides?)\b/i.test(
      text,
    )
  )
    return "I'll make the slides.";
  if (/\b(?:analy[sz]e|check|summari[sz]e)\b.*\b(?:excel|spreadsheet|workbook)\b/i.test(text))
    return "I'll check the workbook.";
  if (/\b(?:describe|read|what(?:'s| is))\b.*\b(?:screen|display)\b/i.test(text))
    return "I'll describe the screen.";
  if (/\b(?:click|open|select|press)\b.*\bapply\b/i.test(text))
    return "I'll check the Apply button.";
  if (
    /\b(?:open|launch|start|switch to)\b.*\b(?:calculator|browser|chrome|edge|file explorer|notepad|vs code|excel|powerpoint)\b/i.test(
      text,
    )
  )
    return "I'll open the app.";
  if (/\b(?:click|press|tap|select)\b.*\b(?:screen|display|desktop|window|app)\b/i.test(text))
    return "I'll look for that button.";
  if (/\bscroll\s+(?:up|down)\b/i.test(text)) return "I'll scroll the screen.";
  if (/\b(?:write|create|make|build|code)\b.*\b(?:python|program|script|code)\b/i.test(text))
    return "I'll write the program.";
  return null;
}

function briefText(value: string, maxSentences = 2, limit = 320): string {
  const cleaned = cleanSpeechText(value, 1000).replace(/\s*\n\s*/g, ' ');
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let brief = '';
  for (const sentence of sentences.slice(0, maxSentences)) {
    if (brief && `${brief} ${sentence}`.length > limit) break;
    brief = brief ? `${brief} ${sentence}` : sentence;
  }
  return cleanSpeechText(brief || cleaned, limit);
}

function usefulLines(body: string): string[] {
  const lines = body
    .split(/\n+/)
    .map((line) =>
      cleanSpeechText(line, 190)
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
  return [...new Set(lines)].slice(0, 2);
}

function browserSpeech(browser: BrowserView, summary: string, tool?: string): string | null {
  const title = cleanSpeechText(browser.title, 100) || 'the page';
  if (/^Found .+ and opened its application page\./s.test(summary)) {
    const job = summary.match(/^Found (.+?) and opened its application page\./s)?.[1];
    const fields = browser.controls
      .filter((control) => control.role === 'textbox' && !control.blocked)
      .map((control) => cleanSpeechText(control.name, 35))
      .filter(Boolean)
      .slice(0, 3);
    const next = fields.length
      ? `I can help fill ${fields.join(', ')}.`
      : 'I can read the page for the next step.';
    return cleanSpeechText(
      `I found ${cleanSpeechText(job || 'the job', 95)} and opened the application page. ${next} You review and submit it.`,
      300,
    );
  }
  if (/^I heard “.+” for .+\. Say “confirm fill”/i.test(summary)) {
    const matched = summary.match(/^I heard (“.+?”) for ([^.]+)\./i);
    if (matched)
      return cleanSpeechText(
        `I heard ${matched[1]} for ${matched[2]}. Say confirm fill to type it. The site may save it as you type.`,
        280,
      );
  }
  if (/^Stopped for review\./i.test(summary))
    return 'I stopped for review. Please handle account access, payment, or sending yourself.';
  if (/^Opened .+\. .*I will not submit the application\./s.test(summary)) {
    const fields = browser.controls
      .filter((control) => control.role === 'textbox' && !control.blocked)
      .map((control) => cleanSpeechText(control.name, 40))
      .filter(Boolean)
      .slice(0, 3);
    const account = /This site asks for account access/i.test(summary);
    const verification = /This site asks for human verification/i.test(summary);
    const next = fields.length
      ? `I found fields for ${fields.join(', ')}. Tell me what to fill.`
      : "I don't see an application field yet. I can read the page for the next step.";
    const caution = account
      ? 'You will need to sign in yourself.'
      : verification
        ? 'You will need to complete verification yourself.'
        : '';
    return cleanSpeechText(`The application page is open. ${next} ${caution}`, 330);
  }
  if (
    (/^Opened Google\.|^Google asked for verification|^.*Results for /i.test(summary) ||
      (tool === 'readPage' && browser.searchResults.length > 0)) &&
    browser.searchResults.length > 0
  ) {
    const results = browser.searchResults.slice(0, 2).map((item, index) => {
      const name = cleanSpeechText(item.title, 65) || 'a result';
      const snippet = briefText(item.snippet, 1, 65);
      const detail =
        snippet && !snippet.toLowerCase().startsWith(name.toLowerCase()) ? ` ${snippet}` : '';
      return `${index === 0 ? 'First' : 'Second'}, ${name}.${detail}`;
    });
    return cleanSpeechText(
      `I found ${browser.searchResults.length} results. ${results.join(' ')} Say open result one to continue.`,
      350,
    );
  }
  if (/^Browser (?:typed|clicked|went back|opened the website)/.test(summary)) {
    if (summary.startsWith('Browser typed')) return 'I filled the field.';
    if (summary.startsWith('Browser went back')) return `I went back to ${title}.`;
    const apply = browser.controls.some(
      (control) =>
        !control.blocked &&
        !control.sensitive &&
        (control.role === 'link' || control.role === 'button') &&
        /^apply(?: now| for this job)?$/i.test(control.name.trim()),
    );
    return cleanSpeechText(
      `${summary.startsWith('Browser clicked') ? 'I clicked it.' : 'I opened'} ${title}.${apply ? ' I see an Apply button.' : ''}`,
      200,
    );
  }
  if (tool === 'readPage' || summary.startsWith(`${browser.title}.`)) {
    const lines = usefulLines(browser.text);
    return cleanSpeechText(
      lines.length
        ? `On ${title}: ${lines.join(' ')}`
        : `I opened ${title}, but could not find clear text to read aloud.`,
      390,
    );
  }
  return null;
}

export function spokenComputerReply(result: ComputerResult, tool?: string): string {
  const { summary, state } = result;
  // Keep the budget question and application readback intact; generic shortening
  // can cut off the next question and strand a voice-only user.
  if (result.tool === 'energyHelp' || tool === 'energyHelp')
    return cleanSpeechText(result.spokenSummary ?? summary, 1000);
  // Conversation replies must never be replaced by a result from an older task.
  if (result.clarification) return cleanSpeechText(summary, 360);
  if (tool === 'openApp' && state.lastApp)
    return state.lastApp.mode === 'focused'
      ? `I switched to ${state.lastApp.name}.`
      : `I opened ${state.lastApp.name}.`;
  if (/^Created editable PowerPoint/.test(summary) && state.presentation) {
    const deck = state.presentation;
    const opened = deck.opened
      ? 'I opened it in PowerPoint.'
      : /PowerPoint could not open/i.test(summary)
        ? 'The file is saved, but PowerPoint could not open it.'
        : 'It is ready to open.';
    return cleanSpeechText(
      `I made a ${deck.slideCount}-slide PowerPoint about ${deck.title}. ${opened}`,
      240,
    );
  }
  if (/^Opened .+\.pptx in PowerPoint\./.test(summary)) return 'I opened the PowerPoint.';
  if (state.spreadsheet && (/\bdata rows\b/i.test(summary) || tool === 'analyzeSpreadsheet')) {
    const report = state.spreadsheet.summary;
    const total =
      report.match(/Databricks calculated ([\w ]+): total (-?[\d,]+(?:\.\d+)?)/i) ??
      report.match(/([\w ]+?) totals (-?[\d,]+(?:\.\d+)?) across \d+ numeric cells/i);
    const highest = report.match(/Highest ([\w ]+): (.+?) with (-?[\d,]+(?:\.\d+)?) ([\w ]+)\./i);
    const insight = total
      ? `${state.spreadsheet.provider === 'databricks' ? `Databricks calculated ${total[1].trim().toLowerCase()} of ${total[2]}.` : `${total[1].trim()} totals ${total[2]}.`}${highest ? ` ${highest[2].trim()} with ${highest[3]} ${highest[4].trim()} is the top ${highest[1].trim().toLowerCase()}.` : ''}`
      : `I found ${state.spreadsheet.rows} rows, but no reliable number to total.`;
    const opened = state.spreadsheet.opened
      ? 'I opened it in Excel.'
      : /Excel could not open/i.test(summary)
        ? 'Excel could not open it.'
        : '';
    return cleanSpeechText(`${insight} ${opened}`, 280);
  }
  if (/^Opened .+\.xlsx in Excel\./.test(summary)) return 'I opened the workbook in Excel.';
  if (state.code && (/^Created .+\.py\b/.test(summary) || tool === 'runCode')) {
    const code = state.code;
    const runningExisting = tool === 'runCode' && !/^Created .+\.py\b/.test(summary);
    const status =
      code.status === 'completed'
        ? runningExisting
          ? 'I ran the Python program.'
          : 'I wrote and ran the Python program.'
        : code.status === 'failed'
          ? runningExisting
            ? 'The Python program did not run successfully.'
            : 'I wrote the Python program, but it did not run successfully.'
          : 'I wrote the Python program.';
    const opened = code.editorOpened
      ? 'It is open in VS Code.'
      : /VS Code could not open/i.test(summary)
        ? 'VS Code could not open it.'
        : '';
    const output = code.status === 'completed' ? cleanSpeechText(code.output.trim(), 90) : '';
    const printed =
      output && output.length <= 90 && !output.includes('\n') ? `It printed ${output}.` : '';
    return cleanSpeechText(`${status} ${opened} ${printed}`, 240);
  }
  if (/^Launched VS Code with .+\.py\./.test(summary)) return 'I opened the program in VS Code.';
  if (state.browser) {
    const speech = browserSpeech(state.browser, summary, tool);
    if (speech) return speech;
  }
  if (tool === 'describeScreen' && state.screen?.description)
    return briefText(state.screen.description, 2, 360);
  return result.clarification ? cleanSpeechText(summary, 360) : briefText(summary, 2, 300);
}
