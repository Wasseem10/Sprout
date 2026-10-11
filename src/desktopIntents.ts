import type { NativeAppId } from '../shared/computer';

export function spokenDesktopApp(request: string): NativeAppId | null {
  const text = request
    .trim()
    .replace(/^(?:hey\s+)?insight(?:\s+os)?[,.!]?\s+/i, '')
    .replace(/^(?:can you|could you|please)\s+/i, '');
  const match = text.match(
    /^(?:open|launch|start|switch to|focus)\s+(?:the |my )?(chrome|chromes|chroms|google chrome|browser|edge|microsoft edge|file explorer|explorer|notepad|calculator|vs\s?code|visual studio code|excel|power\s?point)(?:\s+app)?[.!?]*$/i,
  );
  if (!match) return null;
  const apps: Record<string, NativeAppId> = {
    chrome: 'chrome',
    chromes: 'chrome',
    chroms: 'chrome',
    googlechrome: 'chrome',
    browser: 'browser',
    edge: 'edge',
    microsoftedge: 'edge',
    fileexplorer: 'fileExplorer',
    explorer: 'fileExplorer',
    notepad: 'notepad',
    calculator: 'calculator',
    vscode: 'vsCode',
    visualstudiocode: 'vsCode',
    excel: 'excel',
    powerpoint: 'powerPoint',
  };
  return apps[match[1].toLowerCase().replace(/\s/g, '')] ?? null;
}
