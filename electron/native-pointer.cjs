const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const execFileAsync = promisify(execFile);
const forbidden =
  /\b(submit|send|publish|delete|remove|pay|purchase|buy|checkout|place order|confirm|sign in|log in|register|subscribe|upload|attach|password|credit card|bank|transfer)\b/i;
const contexts = new Set(['listing', 'form', 'checkout', 'desktop', 'other']);
// Taskbar accessibility labels can be app names, window titles, or grouped
// counts. These expressions still name only a fixed supported application.
const taskbarPatterns = Object.freeze({
  browser: '(?:^(?:\\d+\\s+)?| - )(Google Chrome|Microsoft Edge|Chrome|Edge)(?:$|[ ,\\-])',
  chrome: '(?:^(?:\\d+\\s+)?| - )(Google Chrome|Chrome)(?:$|[ ,\\-])',
  edge: '(?:^(?:\\d+\\s+)?| - )(Microsoft Edge|Edge)(?:$|[ ,\\-])',
  fileExplorer: '(?:^(?:\\d+\\s+)?| - )(File Explorer|Windows Explorer)(?:$|[ ,\\-])',
  notepad: '(?:^(?:\\d+\\s+)?| - )Notepad(?:$|[ ,\\-])',
  calculator: '^(?:\\d+\\s+)?Calculator(?:$|[ ,\\-])',
  vsCode: '(?:^(?:\\d+\\s+)?| - )(Visual Studio Code|VS Code)(?:$|[ ,\\-])',
  excel: '(?:^(?:\\d+\\s+)?| - )(Microsoft Excel|Excel)(?:$|[ ,\\-])',
  powerPoint: '(?:^(?:\\d+\\s+)?| - )(Microsoft PowerPoint|PowerPoint)(?:$|[ ,\\-])',
});
const appProcesses = Object.freeze({
  browser: ['chrome', 'msedge'],
  chrome: ['chrome'],
  edge: ['msedge'],
  fileExplorer: ['explorer'],
  notepad: ['notepad'],
  calculator: ['CalculatorApp', 'calc'],
  vsCode: ['Code'],
  excel: ['EXCEL'],
  powerPoint: ['POWERPNT'],
});

function taskbarAppPattern(app) {
  return typeof app === 'string' && Object.hasOwn(taskbarPatterns, app)
    ? taskbarPatterns[app]
    : null;
}

async function locateAppActivation(app, signal, dependencies = {}) {
  signal?.throwIfAborted();
  if (!taskbarAppPattern(app)) return null;
  const taskbar = dependencies.taskbar || locateTaskbarApp;
  const caption = dependencies.caption || locateRunningAppCaption;
  const wait =
    dependencies.wait || ((ms, currentSignal) => delay(ms, undefined, { signal: currentSignal }));
  // App launch resolves when the process starts, before its window necessarily
  // exists. Fresh bounded lookups allow that window to appear without adding a
  // delay to already-open apps or issuing repeated clicks.
  for (const settling of [0, 250, 500]) {
    if (settling) await wait(settling, signal);
    signal?.throwIfAborted();
    // A taskbar click can minimize an already-focused app or toggle its group
    // preview. Prefer a verified non-client title bar for a running app.
    const running = await caption(app, signal);
    signal?.throwIfAborted();
    if (running) return { target: running, method: 'titlebar' };
    const pinned = await taskbar(app, signal);
    signal?.throwIfAborted();
    if (pinned) return { target: pinned, method: 'taskbar' };
  }
  return null;
}

function validatePointerRequest(capture, input, now = Date.now()) {
  if (!capture || typeof input.captureId !== 'string' || input.captureId !== capture.id)
    throw new Error('The screen capture changed. Try the click again.');
  if (now - capture.createdAt > 75_000 || now < capture.createdAt)
    throw new Error('The screen capture is too old. Try the click again.');
  if (
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.y) ||
    input.x < 0.015 ||
    input.x > 0.985 ||
    input.y < 0.015 ||
    input.y > 0.985
  )
    throw new Error('The target is outside the safe part of the display.');
  if (
    typeof input.target !== 'string' ||
    !input.target.trim() ||
    input.target.length > 120 ||
    typeof input.observedText !== 'string' ||
    !input.observedText.trim() ||
    input.observedText.length > 120 ||
    !contexts.has(input.context)
  )
    throw new Error('The target description is invalid.');
  if (forbidden.test(`${input.target} ${input.observedText}`))
    throw new Error('I cannot click submission, account, payment, or destructive controls.');
  if (input.context === 'form' || input.context === 'checkout')
    throw new Error('I cannot click controls in a form or checkout using screen coordinates.');
  if (/\bapply\b/i.test(`${input.target} ${input.observedText}`) && input.context !== 'listing')
    throw new Error('Apply can be clicked only on a job listing, before the form opens.');
  const words = input.target
    .toLowerCase()
    .replace(/\b(the|a|an|button|link|tab|icon|on|my|screen|please|click|press|select)\b/g, ' ')
    .match(/[a-z0-9]{2,}/g);
  const visible = input.observedText.toLowerCase();
  if (!words?.some((word) => visible.includes(word)))
    throw new Error('The observed control does not match the requested target.');
  return input;
}

function verifyPointerAuthorization(capture, input, authorization, secret, used, now = Date.now()) {
  if (
    !capture?.imageHash ||
    typeof secret !== 'string' ||
    secret.length < 20 ||
    !authorization ||
    typeof authorization.nonce !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorization.nonce) ||
    !Number.isSafeInteger(authorization.expiresAt) ||
    authorization.expiresAt < now ||
    authorization.expiresAt > now + 60_000 ||
    typeof authorization.proof !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(authorization.proof) ||
    used.has(authorization.nonce)
  )
    throw new Error('That screen-click authorization is missing, expired, or already used.');
  const message = JSON.stringify([
    capture.imageHash,
    input.x,
    input.y,
    input.target,
    input.observedText,
    input.context,
    authorization.nonce,
    authorization.expiresAt,
  ]);
  const expected = Buffer.from(createHmac('sha256', secret).update(message).digest('hex'), 'hex');
  const actual = Buffer.from(authorization.proof, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error('That screen-click authorization does not match the model result.');
  used.set(authorization.nonce, authorization.expiresAt);
}

// Compare a small area around the requested control before moving the pointer.
// This catches a page switch or a vanished button after a slow vision response.
function targetRegionChanged(previous, current, x, y, width, height) {
  if (
    !Buffer.isBuffer(previous) ||
    !Buffer.isBuffer(current) ||
    previous.length !== current.length ||
    previous.length !== width * height * 4
  )
    return true;
  const cx = Math.round(x * width);
  const cy = Math.round(y * height);
  const radiusX = Math.max(14, Math.min(64, Math.floor(width * 0.04)));
  const radiusY = Math.max(10, Math.min(40, Math.floor(height * 0.04)));
  let changed = 0,
    seen = 0;
  for (let row = Math.max(0, cy - radiusY); row < Math.min(height, cy + radiusY); row += 3) {
    for (let col = Math.max(0, cx - radiusX); col < Math.min(width, cx + radiusX); col += 3) {
      const offset = (row * width + col) * 4;
      const difference =
        (Math.abs(previous[offset] - current[offset]) +
          Math.abs(previous[offset + 1] - current[offset + 1]) +
          Math.abs(previous[offset + 2] - current[offset + 2])) /
        3;
      if (difference > 45) changed++;
      seen++;
    }
  }
  return seen === 0 || changed / seen > 0.16;
}

function pointerScript(command, x, y) {
  // Only validated numeric coordinates and a fixed command are interpolated.
  const type = `using System; using System.Runtime.InteropServices;
public static class InsightPointer {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
}`;
  const prefix = `$ErrorActionPreference = 'Stop'\nAdd-Type -TypeDefinition @'\n${type}\n'@\ntry { if (-not [InsightPointer]::SetProcessDpiAwarenessContext([IntPtr](-4))) { [InsightPointer]::SetProcessDPIAware() | Out-Null } } catch { [InsightPointer]::SetProcessDPIAware() | Out-Null }\n`;
  if (command === 'move')
    return `${prefix}if (-not [InsightPointer]::SetCursorPos(${x}, ${y})) { throw 'Could not move mouse' }`;
  if (command === 'click' || command === 'double-click')
    return `${prefix}$origin = New-Object InsightPointer+Point\n[InsightPointer]::GetCursorPos([ref]$origin) | Out-Null\nfor ($step = 1; $step -le 24; $step++) {\n  $t = $step / 24.0\n  $ease = $t * $t * (3 - 2 * $t)\n  $px = [int][Math]::Round($origin.X + (${x} - $origin.X) * $ease)\n  $py = [int][Math]::Round($origin.Y + (${y} - $origin.Y) * $ease)\n  if (-not [InsightPointer]::SetCursorPos($px, $py)) { throw 'Could not move mouse' }\n  Start-Sleep -Milliseconds 18\n}\n[InsightPointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)\n[InsightPointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)${command === 'double-click' ? '\nStart-Sleep -Milliseconds 80\n[InsightPointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)\n[InsightPointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)' : ''}`;
  if (command === 'scroll-up' || command === 'scroll-down') {
    const amount = command === 'scroll-up' ? 360 : -360;
    return `${prefix}if (-not [InsightPointer]::SetCursorPos(${x}, ${y})) { throw 'Could not move mouse' }\nStart-Sleep -Milliseconds 100\n[InsightPointer]::mouse_event(2048, 0, 0, ${amount}, [UIntPtr]::Zero)`;
  }
  throw new Error('Unknown pointer command.');
}

async function runPointerCommand(command, x, y, signal) {
  if (process.platform !== 'win32') throw new Error('Native pointer control requires Windows.');
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y))
    throw new Error('Invalid physical screen position.');
  const encoded = Buffer.from(pointerScript(command, x, y), 'utf16le').toString('base64');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        signal,
        timeout: 8000,
        maxBuffer: 16 * 1024,
      },
    );
  } catch (error) {
    throw new Error(
      `Windows could not ${command.startsWith('scroll') ? 'scroll' : command === 'move' ? 'move the pointer' : 'click'} the target: ${error instanceof Error ? error.message.slice(0, 250) : 'unknown error'}`,
    );
  }
}

// Fast, fixed app activation: hit-test an actual visible taskbar button. This
// does not accept arbitrary target text, coordinates, executable paths or commands.
async function locateTaskbarApp(app, signal) {
  signal?.throwIfAborted();
  const selectedPattern = taskbarAppPattern(app);
  if (process.platform !== 'win32' || !selectedPattern) return null;
  const pattern = Buffer.from(selectedPattern, 'utf8').toString('base64');
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
$pattern = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${pattern}'))
$root = [System.Windows.Automation.AutomationElement]::RootElement
$taskbars = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd'))
$found = @()
foreach ($bar in $taskbars) {
  $buttons = $bar.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
  foreach ($button in $buttons) { try {
    $info = $button.Current; $rect = $info.BoundingRectangle
    if ($info.Name -match $pattern -and -not $info.IsOffscreen -and $info.IsEnabled -and $rect.Width -ge 8 -and $rect.Height -ge 8) {
      $x = [int][Math]::Round($rect.X + $rect.Width/2); $y = [int][Math]::Round($rect.Y + $rect.Height/2)
      $hit = [System.Windows.Automation.AutomationElement]::FromPoint([System.Windows.Point]::new($x,$y))
      for ($depth=0; $depth -lt 5 -and $null -ne $hit; $depth++) {
        if ($hit.Current.Name -eq $info.Name) { $found += @{ x=$x; y=$y; name=$info.Name }; break }
        $hit = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($hit)
      }
    }
  } catch {} }
}
if ($found.Count -eq 1) { $found[0] | ConvertTo-Json -Compress } else { '{}' }`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, timeout: 8000, maxBuffer: 4096, signal },
    );
    const result = JSON.parse(stdout.trim());
    return Number.isSafeInteger(result.x) &&
      Number.isSafeInteger(result.y) &&
      typeof result.name === 'string'
      ? result
      : null;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

// If an app is not pinned, click its actual non-client title bar after it has
// opened. HTCAPTION excludes document contents, tabs, and window-close buttons.
// No spoken executable path, label, or coordinate enters this fixed tool.
async function locateRunningAppCaption(app, signal) {
  signal?.throwIfAborted();
  if (process.platform !== 'win32' || !Object.hasOwn(appProcesses, app)) return null;
  const encoded = Buffer.from(
    JSON.stringify({ names: appProcesses[app], calculator: app === 'calculator' }),
    'utf8',
  ).toString('base64');
  const script = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class InsightAppCaption {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@
try { [InsightAppCaption]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
$windows=@(Get-Process -Name $data.names -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if ($data.calculator) { $windows += @(Get-Process -Name 'ApplicationFrameHost' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Calculator' }) }
if ($windows.Count -eq 0) { '{}'; exit }
$window=$windows[0]; $hwnd=[IntPtr]$window.MainWindowHandle
[InsightAppCaption]::ShowWindowAsync($hwnd,9) | Out-Null
[InsightAppCaption]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 150
$rect=New-Object InsightAppCaption+Rect
if (-not [InsightAppCaption]::GetWindowRect($hwnd,[ref]$rect)) { '{}'; exit }
$found=$null
foreach ($offsetY in @(16,24,10,32)) { foreach ($fractionX in @(0.5,0.4,0.6,0.7)) {
 $point=New-Object InsightAppCaption+Point
 $point.X=[int][Math]::Round($rect.Left+($rect.Right-$rect.Left)*$fractionX); $point.Y=$rect.Top+$offsetY
 if ([InsightAppCaption]::WindowFromPoint($point) -ne $hwnd) { continue }
 $packed=([long]($point.Y -band 65535) -shl 16) -bor [long]($point.X -band 65535)
 if ([InsightAppCaption]::SendMessage($hwnd,132,[IntPtr]::Zero,[IntPtr]$packed).ToInt64() -eq 2) { $found=@{x=$point.X;y=$point.Y;name=$window.MainWindowTitle}; break }
} if ($found) { break } }
if ($found) { $found | ConvertTo-Json -Compress } else { '{}' }`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, timeout: 8000, maxBuffer: 4096, signal },
    );
    const result = JSON.parse(stdout.trim());
    return Number.isSafeInteger(result.x) &&
      Number.isSafeInteger(result.y) &&
      typeof result.name === 'string'
      ? result
      : null;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

async function locateAccessibleTarget(name, folderPath, signal) {
  signal?.throwIfAborted();
  if (process.platform !== 'win32') return null;
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || forbidden.test(name))
    return null;
  if (folderPath) {
    const desktopItem = await locateDesktopFolder(name, folderPath, signal);
    if (desktopItem) return desktopItem;
  }
  const encodedName = Buffer.from(name.trim(), 'utf8').toString('base64');
  const encodedPath = Buffer.from(
    typeof folderPath === 'string' ? folderPath : '',
    'utf8',
  ).toString('base64');
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
$name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedName}'))
$expectedPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name, [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase)
$matches = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
$found = @()
for ($i = 0; $i -lt $matches.Count; $i++) {
  try {
    $element = $matches.Item($i)
    $info = $element.Current
    $rect = $info.BoundingRectangle
    $type = $info.ControlType.ProgrammaticName
    $folder = $false
    $folderItemPath = $null
    if ($type -in @('ControlType.ListItem','ControlType.TreeItem') -and (Get-Process -Id $info.ProcessId -ErrorAction Stop).ProcessName -eq 'explorer') {
      # Windows 11 often leaves ItemType empty. Verify the item against the
      # actual Explorer window's Shell folder, not a model's guessed label.
      $ancestor = $element
      $handles = @()
      for ($depth=0; $depth -lt 16 -and $null -ne $ancestor; $depth++) {
        if ($ancestor.Current.NativeWindowHandle -ne 0) { $handles += [long]$ancestor.Current.NativeWindowHandle }
        $ancestor = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($ancestor)
      }
      $shell = New-Object -ComObject Shell.Application
      foreach ($window in $shell.Windows()) { try {
        if ($handles -contains [long]$window.HWND) {
          $item = $window.Document.Folder.ParseName($info.Name)
          if ($null -ne $item -and $item.IsFolder -and $item.IsFileSystem -and (Test-Path -LiteralPath $item.Path -PathType Container) -and (-not $expectedPath -or $item.Path.TrimEnd('\\') -eq $expectedPath.TrimEnd('\\'))) { $folder = $true; $folderItemPath = $item.Path; break }
        }
      } catch {} }
      # The desktop is not an Explorer window in Shell.Windows(). Validate its
      # list item against the real Desktop namespace, including redirected
      # OneDrive and Public Desktop items, before treating it as a folder.
      if (-not $folder) {
        $isDesktop = $false
        $hasFolderView = $false
        $ancestor = $element
        for ($depth=0; $depth -lt 16 -and $null -ne $ancestor; $depth++) {
          if ($ancestor.Current.ClassName -eq 'SysListView32' -and $ancestor.Current.Name -eq 'FolderView') { $hasFolderView = $true }
          if ($ancestor.Current.ClassName -in @('Progman','WorkerW') -and $hasFolderView) { $isDesktop = $true; break }
          $ancestor = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($ancestor)
        }
        if ($isDesktop) { try {
          $item = $shell.Namespace(0).ParseName($info.Name)
          if ($null -ne $item -and $item.IsFolder -and $item.IsFileSystem -and (Test-Path -LiteralPath $item.Path -PathType Container) -and (-not $expectedPath -or $item.Path.TrimEnd('\\') -eq $expectedPath.TrimEnd('\\'))) { $folder = $true; $folderItemPath = $item.Path }
        } catch {} }
      }
    }
    if (-not $info.IsOffscreen -and $info.IsEnabled -and $rect.Width -ge 8 -and $rect.Height -ge 8 -and ($folder -or $type -in @('ControlType.Button','ControlType.Hyperlink','ControlType.MenuItem','ControlType.TabItem'))) {
      $centerX = [int][Math]::Round($rect.X + $rect.Width / 2)
      $centerY = [int][Math]::Round($rect.Y + $rect.Height / 2)
      $hit = [System.Windows.Automation.AutomationElement]::FromPoint([System.Windows.Point]::new($centerX, $centerY))
      $hitMatches = $false
      for ($depth = 0; $depth -lt 5 -and $null -ne $hit; $depth++) {
        if ($hit.Current.Name -eq $name -and ($hit.GetRuntimeId() -join ',') -eq ($element.GetRuntimeId() -join ',')) { $hitMatches = $true; break }
        $hit = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($hit)
      }
      if ($hitMatches) {
        $found += @{ x = $centerX; y = $centerY; width = [int][Math]::Round($rect.Width); height = [int][Math]::Round($rect.Height); folder = $folder; folderPath = $folderItemPath }
      }
    }
  } catch {}
}
if ($found.Count -eq 1) { $found[0] | ConvertTo-Json -Compress } else { '{}' }`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024, signal },
    );
    const point = JSON.parse(stdout.trim());
    if (
      Number.isSafeInteger(point.x) &&
      Number.isSafeInteger(point.y) &&
      point.width >= 8 &&
      point.height >= 8
    )
      return point;
  } catch {
    signal?.throwIfAborted();
    // Fail closed when accessibility hit-testing cannot verify the visible control.
  }
  return null;
}

// Some Windows 11 Desktop providers expose no icon children through UIA. Read
// the actual Desktop list view through MSAA instead of guessing pixel positions.
// A named filesystem folder and its exact authorized path must both match.
async function locateDesktopFolder(name, folderPath, signal) {
  signal?.throwIfAborted();
  const encodedName = Buffer.from(name.trim(), 'utf8').toString('base64');
  const encodedPath = Buffer.from(folderPath, 'utf8').toString('base64');
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class InsightDesktopAccessible {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("oleacc.dll")] public static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint objectId, ref Guid interfaceId, [MarshalAs(UnmanagedType.Interface)] out object accessible);
}
'@
try { [InsightDesktopAccessible]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}
$name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedName}'))
$expectedPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
$shell = New-Object -ComObject Shell.Application
$item = $shell.Namespace(0).ParseName($name)
if ($null -eq $item -or -not $item.IsFolder -or -not $item.IsFileSystem -or $item.Path.TrimEnd('\\') -ne $expectedPath.TrimEnd('\\') -or -not (Test-Path -LiteralPath $item.Path -PathType Container)) { '{}'; exit }
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'SysListView32')
$lists = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
$found = @()
foreach ($list in $lists) { try {
 if ($list.Current.Name -ne 'FolderView' -or (Get-Process -Id $list.Current.ProcessId).ProcessName -ne 'explorer') { continue }
 $ancestor = $list; $desktop = $false
 for ($depth=0; $depth -lt 8 -and $null -ne $ancestor; $depth++) {
  if ($ancestor.Current.ClassName -in @('Progman','WorkerW')) { $desktop = $true; break }
  $ancestor = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($ancestor)
 }
 if (-not $desktop) { continue }
 $hwnd = [IntPtr]$list.Current.NativeWindowHandle
 $iid = [Guid]'618736e0-3c3d-11cf-810c-00aa00389b71'
 $accessible = $null
 if ([InsightDesktopAccessible]::AccessibleObjectFromWindow($hwnd, 4294967292, [ref]$iid, [ref]$accessible) -ne 0) { continue }
 for ($child=1; $child -le $accessible.accChildCount; $child++) { try {
  $label = $accessible.GetType().InvokeMember('accName', [Reflection.BindingFlags]::GetProperty, $null, $accessible, @($child))
  if ($label -ne $name) { continue }
  $x=0; $y=0; $width=0; $height=0
  $accessible.accLocation([ref]$x,[ref]$y,[ref]$width,[ref]$height,$child)
  if ($width -lt 8 -or $height -lt 8) { continue }
  $point = New-Object InsightDesktopAccessible+Point
  $point.X = [int][Math]::Round($x + $width/2.0); $point.Y = [int][Math]::Round($y + $height/2.0)
  # Verify that the Desktop icon is exposed, rather than covered by an app.
  if ([InsightDesktopAccessible]::WindowFromPoint($point) -ne $hwnd -or $accessible.accHitTest($point.X,$point.Y) -ne $child) { continue }
  $found += @{x=$point.X;y=$point.Y;width=$width;height=$height;folder=$true;folderPath=$item.Path;desktop=$true}
 } catch {} }
} catch {} }
if ($found.Count -eq 1) { $found[0] | ConvertTo-Json -Compress } else { '{}' }`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, timeout: 8000, maxBuffer: 4096, signal },
    );
    const point = JSON.parse(stdout.trim());
    return Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y) && point.folder === true
      ? point
      : null;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

// Fixed desktop reveal for an authorized Desktop folder. Unlike Win+D, this
// never toggles back to covered windows when the Desktop is already visible.
async function revealDesktop(signal) {
  if (process.platform !== 'win32') throw new Error('Desktop folder control requires Windows.');
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-Command',
      '(New-Object -ComObject Shell.Application).MinimizeAll()',
    ],
    { windowsHide: true, timeout: 8000, signal, maxBuffer: 4096 },
  );
}

async function explorerFolderIsOpen(folderPath, signal) {
  if (process.platform !== 'win32' || typeof folderPath !== 'string') return false;
  const encodedPath = Buffer.from(folderPath, 'utf8').toString('base64');
  const script = `$ErrorActionPreference = 'Stop'
$expectedPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
$found = $false
$shell = New-Object -ComObject Shell.Application
foreach ($window in $shell.Windows()) { try { if ($window.Document.Folder.Self.Path.TrimEnd('\\') -eq $expectedPath.TrimEnd('\\')) { $found = $true; break } } catch {} }
$found | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, timeout: 8000, signal, maxBuffer: 4096 },
    );
    return JSON.parse(stdout.trim()) === true;
  } catch {
    signal?.throwIfAborted();
    return false;
  }
}

module.exports = {
  validatePointerRequest,
  verifyPointerAuthorization,
  targetRegionChanged,
  runPointerCommand,
  locateAccessibleTarget,
  locateTaskbarApp,
  locateRunningAppCaption,
  taskbarAppPattern,
  locateAppActivation,
  revealDesktop,
  explorerFolderIsOpen,
};
