const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHmac, timingSafeEqual } = require('node:crypto');

const execFileAsync = promisify(execFile);
const forbidden =
  /\b(submit|send|publish|delete|remove|pay|purchase|buy|checkout|place order|confirm|sign in|log in|register|subscribe|upload|attach|password|credit card|bank|transfer)\b/i;
const contexts = new Set(['listing', 'form', 'checkout', 'desktop', 'other']);

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
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
}`;
  const prefix = `$ErrorActionPreference = 'Stop'\nAdd-Type -TypeDefinition @'\n${type}\n'@\ntry { if (-not [InsightPointer]::SetProcessDpiAwarenessContext([IntPtr](-4))) { [InsightPointer]::SetProcessDPIAware() | Out-Null } } catch { [InsightPointer]::SetProcessDPIAware() | Out-Null }\n`;
  if (command === 'move')
    return `${prefix}if (-not [InsightPointer]::SetCursorPos(${x}, ${y})) { throw 'Could not move mouse' }`;
  if (command === 'click')
    return `${prefix}if (-not [InsightPointer]::SetCursorPos(${x}, ${y})) { throw 'Could not move mouse' }\nStart-Sleep -Milliseconds 120\n[InsightPointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)\nStart-Sleep -Milliseconds 45\n[InsightPointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)`;
  if (command === 'scroll-up' || command === 'scroll-down') {
    const amount = command === 'scroll-up' ? 360 : -360;
    return `${prefix}if (-not [InsightPointer]::SetCursorPos(${x}, ${y})) { throw 'Could not move mouse' }\nStart-Sleep -Milliseconds 100\n[InsightPointer]::mouse_event(2048, 0, 0, ${amount}, [UIntPtr]::Zero)`;
  }
  throw new Error('Unknown pointer command.');
}

async function runPointerCommand(command, x, y) {
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

async function locateAccessibleTarget(name) {
  if (process.platform !== 'win32') return null;
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || forbidden.test(name))
    return null;
  const encodedName = Buffer.from(name.trim(), 'utf8').toString('base64');
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
$name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedName}'))
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name, [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase)
$matches = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
$found = @()
for ($i = 0; $i -lt $matches.Count; $i++) {
  try {
    $element = $matches.Item($i)
    $info = $element.Current
    $rect = $info.BoundingRectangle
    $type = $info.ControlType.ProgrammaticName
    if (-not $info.IsOffscreen -and $info.IsEnabled -and $rect.Width -ge 8 -and $rect.Height -ge 8 -and $type -in @('ControlType.Button','ControlType.Hyperlink','ControlType.MenuItem','ControlType.TabItem')) {
      $centerX = [int][Math]::Round($rect.X + $rect.Width / 2)
      $centerY = [int][Math]::Round($rect.Y + $rect.Height / 2)
      $hit = [System.Windows.Automation.AutomationElement]::FromPoint([System.Windows.Point]::new($centerX, $centerY))
      $hitMatches = $false
      for ($depth = 0; $depth -lt 5 -and $null -ne $hit; $depth++) {
        if ($hit.Current.Name -eq $name) { $hitMatches = $true; break }
        $hit = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($hit)
      }
      if ($hitMatches) {
        $found += @{ x = $centerX; y = $centerY; width = [int][Math]::Round($rect.Width); height = [int][Math]::Round($rect.Height) }
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
      { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 },
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
    // Fail closed when accessibility hit-testing cannot verify the visible control.
  }
  return null;
}

module.exports = {
  validatePointerRequest,
  verifyPointerAuthorization,
  targetRegionChanged,
  runPointerCommand,
  locateAccessibleTarget,
};
