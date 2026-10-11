import { access } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { Config } from '../config.js';

const execFileAsync = promisify(execFile);

export const nativeAppIds = [
  'browser',
  'chrome',
  'edge',
  'fileExplorer',
  'notepad',
  'calculator',
  'vsCode',
  'excel',
  'powerPoint',
] as const;
export type NativeAppId = (typeof nativeAppIds)[number];

const labels: Record<NativeAppId, string> = {
  browser: 'browser',
  chrome: 'Chrome',
  edge: 'Edge',
  fileExplorer: 'File Explorer',
  notepad: 'Notepad',
  calculator: 'Calculator',
  vsCode: 'VS Code',
  excel: 'Excel',
  powerPoint: 'PowerPoint',
};

function candidates(app: NativeAppId, cfg: Config): string[] {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  const windows = process.env.WINDIR || 'C:\\Windows';
  const office = (name: string) => [
    path.join(programFiles, 'Microsoft Office', 'root', 'Office16', name),
    path.join(programFilesX86, 'Microsoft Office', 'root', 'Office16', name),
  ];
  switch (app) {
    case 'browser':
    case 'chrome':
      return [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ...(localAppData
          ? [path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')]
          : []),
        ...(app === 'browser' ? candidates('edge', cfg) : []),
      ];
    case 'edge':
      return [
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ];
    case 'fileExplorer':
      return [path.join(windows, 'explorer.exe')];
    case 'notepad':
      return [path.join(windows, 'System32', 'notepad.exe'), path.join(windows, 'notepad.exe')];
    case 'calculator':
      return [path.join(windows, 'System32', 'calc.exe')];
    case 'vsCode':
      return [
        cfg.codeBin,
        ...(localAppData
          ? [path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe')]
          : []),
        path.join(programFiles, 'Microsoft VS Code', 'Code.exe'),
      ];
    case 'excel':
      return [cfg.excelBin, ...office('EXCEL.EXE')];
    case 'powerPoint':
      return [cfg.powerpointBin, ...office('POWERPNT.EXE')];
  }
}

const processNames: Record<NativeAppId, string[]> = {
  browser: ['chrome', 'msedge'],
  chrome: ['chrome'],
  edge: ['msedge'],
  fileExplorer: ['explorer'],
  notepad: ['notepad'],
  calculator: ['CalculatorApp', 'calc'],
  vsCode: ['Code'],
  excel: ['EXCEL'],
  powerPoint: ['POWERPNT'],
};

async function focusRunning(app: NativeAppId, signal: AbortSignal) {
  // Names come only from the fixed allowlist above; no spoken text becomes shell code.
  const names = processNames[app].map((name) => `'${name}'`).join(',');
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class InsightWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
}
'@
$names = @(${names})
$window = Get-Process -Name $names -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
${app === 'calculator' ? "$window = if ($null -ne $window) { $window } else { Get-Process -Name 'ApplicationFrameHost' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Calculator' } | Select-Object -First 1 }" : ''}
if ($null -eq $window) { Write-Output 'not-found'; exit 0 }
[InsightWindow]::ShowWindowAsync($window.MainWindowHandle, 9) | Out-Null
if ([InsightWindow]::SetForegroundWindow($window.MainWindowHandle)) { Write-Output 'focused' } else { Write-Output 'not-found' }`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, timeout: 5000, maxBuffer: 1024, signal },
    );
    return stdout.trim() === 'focused';
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(
      `Could not check whether ${labels[app]} is open: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'}`,
    );
  }
}

export async function availableNativeApp(app: NativeAppId, cfg: Config) {
  for (const candidate of candidates(app, cfg)) {
    if (!candidate || !path.isAbsolute(candidate)) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try the next installed location */
    }
  }
  return null;
}

export async function openNativeApp(
  app: NativeAppId,
  cfg: Config,
  signal: AbortSignal,
  folder?: string,
) {
  if (process.platform !== 'win32')
    throw new Error('Opening installed applications currently requires Windows.');
  signal.throwIfAborted();
  if (folder && (app !== 'fileExplorer' || !path.isAbsolute(folder)))
    throw new Error('A folder can only be opened in File Explorer.');
  if (!folder && (await focusRunning(app, signal)))
    return { app, name: labels[app], mode: 'focused' as const };
  const executable = await availableNativeApp(app, cfg);
  if (!executable)
    throw new Error(`${labels[app]} is not installed in a supported location on this computer.`);
  signal.throwIfAborted();
  const childEnv = { ...process.env };
  for (const name of [
    'ELECTRON_RUN_AS_NODE',
    'HF_TOKEN',
    'DATABRICKS_TOKEN',
    'ELEVENLABS_API_KEY',
    'DATABASE_URL',
    'SESSION_PASSPHRASE',
  ])
    delete childEnv[name];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, folder ? [folder] : [], {
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: false,
      env: childEnv,
    });
    child.once('error', () => reject(new Error(`Could not open ${labels[app]}.`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
  signal.throwIfAborted();
  return { app, name: labels[app], mode: 'launched' as const };
}
