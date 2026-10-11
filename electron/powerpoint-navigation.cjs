const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { runPointerCommand } = require('./native-pointer.cjs');

const execFileAsync = promisify(execFile);
const relativeSlides = new Set(['next', 'previous', 'first', 'last']);
const retryableCodes = new Set([
  'POWERPOINT_BUSY',
  'POWERPOINT_UNAVAILABLE',
  'PRESENTATION_NOT_READY',
  'SLIDE_SELECTION_PENDING',
]);

class PowerPointNavigationError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = 'PowerPointNavigationError';
    this.code = code;
  }
}

function stopped(signal) {
  if (signal?.aborted)
    throw new PowerPointNavigationError('Slide navigation was stopped.', 'STOPPED');
}

function waitForRetry(ms, signal) {
  stopped(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new PowerPointNavigationError('Slide navigation was stopped.', 'STOPPED'));
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function validateSlideNavigation(slide, filename) {
  if (!(Number.isSafeInteger(slide) && slide >= 1 && slide <= 500) && !relativeSlides.has(slide))
    throw new Error('Choose a slide number from 1 to 500, next, previous, first, or last.');
  if (
    filename !== undefined &&
    (typeof filename !== 'string' ||
      filename.length > 240 ||
      !/\.pptx$/i.test(filename) ||
      path.win32.basename(filename) !== filename ||
      /[<>:"/\\|?*\x00-\x1f]/.test(filename))
  )
    throw new Error('Choose the current PowerPoint presentation filename.');
  return { slide, ...(filename === undefined ? {} : { filename }) };
}

async function runScript(script, signal, timeout = 6000) {
  stopped(signal);
  const wrapped = `$ProgressPreference='SilentlyContinue'
$script:InsightSlideCode = ''
function Stop-InsightSlide([string]$code, [string]$message) { $script:InsightSlideCode=$code; throw $message }
try {
${script}
} catch {
  $code=$script:InsightSlideCode
  if (-not $code) {
    $code='POWERPOINT_ERROR'
    for ($cause=$_.Exception; $cause; $cause=$cause.InnerException) {
      $hr=[BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$cause.HResult),0)
      if ($hr -eq 2147549185 -or $hr -eq 2147549450) { $code='POWERPOINT_BUSY'; break }
    }
  }
  [ordered]@{error=$_.Exception.Message;code=$code} | ConvertTo-Json -Compress
}`;
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(wrapped, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024, signal },
    ));
  } catch (error) {
    stopped(signal);
    if (error.killed || error.code === 'ETIMEDOUT')
      throw new PowerPointNavigationError(
        'PowerPoint is still opening or busy. Slide selection has not been verified.',
        'POWERPOINT_BUSY',
        { cause: error },
      );
    throw new PowerPointNavigationError(
      'I could not communicate with PowerPoint. Slide selection has not been verified.',
      'POWERPOINT_EXECUTION_FAILED',
      { cause: error },
    );
  }
  let result;
  try {
    result = JSON.parse(stdout.trim());
  } catch (error) {
    throw new PowerPointNavigationError(
      'PowerPoint returned an unreadable navigation response. Slide selection has not been verified.',
      'POWERPOINT_PROTOCOL',
      { cause: error },
    );
  }
  if (!result || typeof result !== 'object')
    throw new PowerPointNavigationError(
      'PowerPoint returned an invalid navigation response.',
      'POWERPOINT_PROTOCOL',
    );
  if (result.error) {
    const code = result.code || 'POWERPOINT_ERROR';
    const message =
      code === 'POWERPOINT_ERROR'
        ? 'PowerPoint could not verify the selected slide. Try that slide command again.'
        : result.error;
    throw new PowerPointNavigationError(message, code, { cause: new Error(result.error) });
  }
  return result;
}

function contextScript(input) {
  // Values enter PowerShell as UTF-8 JSON, never as interpolated shell syntax.
  const data = Buffer.from(JSON.stringify(input), 'utf8').toString('base64');
  return `$ErrorActionPreference = 'Stop'
$inputData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
try { $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { Stop-InsightSlide 'POWERPOINT_UNAVAILABLE' 'PowerPoint has not opened the requested presentation yet.' }
$presentation=$null
$window=$null
if ($inputData.filename) {
  $presentations=@()
  foreach ($candidate in $ppt.Presentations) {
    if ([IO.Path]::GetFileName([string]$candidate.FullName) -ieq [string]$inputData.filename) {
      if (-not $inputData.fullName -or [string]$candidate.FullName -ieq [string]$inputData.fullName) { $presentations += $candidate }
    }
  }
  if ($presentations.Count -eq 0) { Stop-InsightSlide 'PRESENTATION_NOT_READY' 'The requested presentation is still opening in PowerPoint. Slide selection has not been verified.' }
  if ($presentations.Count -ne 1) { Stop-InsightSlide 'PRESENTATION_AMBIGUOUS' 'More than one open presentation has that filename. Nothing was clicked.' }
  $presentation=$presentations[0]
  if ([int]$presentation.Windows.Count -lt 1) { Stop-InsightSlide 'PRESENTATION_NOT_READY' 'The requested presentation window is still opening. Slide selection has not been verified.' }
  $window=$presentation.Windows.Item(1)
} else {
  try { $presentation=$ppt.ActivePresentation; $window=$ppt.ActiveWindow } catch { Stop-InsightSlide 'POWERPOINT_UNAVAILABLE' 'Open your presentation in PowerPoint first, then ask for a slide.' }
}
if (-not $presentation -or -not $window) { Stop-InsightSlide 'POWERPOINT_UNAVAILABLE' 'Open your presentation in PowerPoint first, then ask for a slide.' }
$filename = [IO.Path]::GetFileName([string]$presentation.FullName)
if ($inputData.filename -and $filename -ine $inputData.filename) { Stop-InsightSlide 'PRESENTATION_CHANGED' 'The open PowerPoint file is different from the current Insight presentation. Nothing was clicked.' }
if ($inputData.fullName -and [string]$presentation.FullName -ine [string]$inputData.fullName) { Stop-InsightSlide 'PRESENTATION_CHANGED' 'The PowerPoint presentation changed. Nothing further was clicked.' }
$slideCount = [int]$presentation.Slides.Count
$showWindow = $null
foreach ($show in $ppt.SlideShowWindows) { if ([string]$show.Presentation.FullName -ieq [string]$presentation.FullName) { $showWindow = $show; break } }
$currentSlide = 1
if ($showWindow) { $currentSlide = [int]$showWindow.View.Slide.SlideIndex } else { try { $currentSlide = [int]$window.View.Slide.SlideIndex } catch {} }
$slide = switch ([string]$inputData.slide) { 'next' { $currentSlide + 1 } 'previous' { $currentSlide - 1 } 'first' { 1 } 'last' { $slideCount } default { [int]$inputData.slide } }
if ($slide -lt 1 -or $slide -gt $slideCount) { Stop-InsightSlide 'SLIDE_OUT_OF_RANGE' "That presentation has $slideCount slides. Choose a slide between 1 and $slideCount." }
`;
}

const locateScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class InsightSlideWindow {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
}
'@
try { if (-not [InsightSlideWindow]::SetProcessDpiAwarenessContext([IntPtr](-4))) { [InsightSlideWindow]::SetProcessDPIAware() | Out-Null } } catch { [InsightSlideWindow]::SetProcessDPIAware() | Out-Null }
if (-not $showWindow) {
  $window.Activate()
  if ([int]$window.ViewType -ne 9) { $window.ViewType = 9 }
  if ([int]$window.SplitHorizontal -lt 8) { $window.SplitHorizontal = 18 }
}
$stem = [IO.Path]::GetFileNameWithoutExtension($filename)
$roots = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
$matching = @()
$expectedHwnd=0
try { $expectedHwnd=[long]$window.HWND } catch {}
foreach ($root in $roots) {
  try {
    $value=$root.Current; $process=Get-Process -Id $value.ProcessId -ErrorAction Stop
    $matchesExpected=if ($expectedHwnd) { [long]$value.NativeWindowHandle -eq $expectedHwnd } else { $value.Name.IndexOf($stem,[StringComparison]::OrdinalIgnoreCase) -ge 0 }
    if ($process.ProcessName -ieq 'POWERPNT' -and $matchesExpected) { $matching += $root }
  } catch {}
}
if ($matching.Count -ne 1) { Stop-InsightSlide 'PRESENTATION_NOT_READY' 'I could not identify one visible window for that PowerPoint yet. Nothing was clicked.' }
$root=$matching[0]
[InsightSlideWindow]::ShowWindow([IntPtr]$root.Current.NativeWindowHandle, 9) | Out-Null
[InsightSlideWindow]::SetForegroundWindow([IntPtr]$root.Current.NativeWindowHandle) | Out-Null
Start-Sleep -Milliseconds 180
$items=$root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
$matches=@()
$titleTarget=$null
function Test-InsightSlideHit($item,[int]$x,[int]$y) {
  $hit=[Windows.Automation.AutomationElement]::FromPoint([Windows.Point]::new($x,$y))
  $wanted=($item.GetRuntimeId() -join ',')
  for($depth=0;$depth -lt 10 -and $hit;$depth++) {
    if (($hit.GetRuntimeId() -join ',') -eq $wanted) { return $true }
    $hit=[Windows.Automation.TreeWalker]::RawViewWalker.GetParent($hit)
  }
  return $false
}
foreach ($item in $items) {
  try {
    $c=$item.Current
    if ($c.IsOffscreen -or -not $c.IsEnabled) { continue }
    $rect=$c.BoundingRectangle
    if ($rect.Width -lt 12 -or $rect.Height -lt 12) { continue }
    if ($c.ControlType -eq [Windows.Automation.ControlType]::TitleBar -and $rect.Width -gt 250) {
      $tx=[int]($rect.Left+$rect.Width*0.5);$ty=[int]($rect.Top+$rect.Height*0.5)
      if (Test-InsightSlideHit $item $tx $ty) { $titleTarget=@{x=$tx;y=$ty} }
    }
    if ($c.Name -notmatch ('(?i)^slide\\s*' + $slide + '(?:\\D|$)')) { continue }
    if ($c.ControlType -notin @([Windows.Automation.ControlType]::ListItem,[Windows.Automation.ControlType]::DataItem,[Windows.Automation.ControlType]::TreeItem,[Windows.Automation.ControlType]::Pane,[Windows.Automation.ControlType]::Custom)) { continue }
    $x=[int]($rect.Left+$rect.Width/2); $y=[int]($rect.Top+$rect.Height/2)
    if (Test-InsightSlideHit $item $x $y) { $matches += @{x=$x;y=$y} }
  } catch {}
}
$target=$null
if (-not $showWindow -and $matches.Count -eq 1) { $target=$matches[0] }
[ordered]@{slide=$slide;slideCount=$slideCount;filename=$filename;fullName=[string]$presentation.FullName;title=[string]$window.Caption;target=$target;focusTarget=$titleTarget;slideShow=[bool]$showWindow} | ConvertTo-Json -Compress -Depth 4
`;

function verificationScript(located, clicked) {
  return (
    contextScript({
      slide: located.slide,
      filename: located.filename,
      fullName: located.fullName,
    }) +
    `
$method = '${clicked ? 'thumbnail' : 'powerpoint'}'
if ($method -eq 'thumbnail') {
  Start-Sleep -Milliseconds 250
  $actual = [int]$window.View.Slide.SlideIndex
  if ($actual -ne $slide) { Stop-InsightSlide 'SLIDE_SELECTION_PENDING' 'PowerPoint has not yet confirmed the requested slide click.' }
} else {
  $actual=0
  try { if ($showWindow) { $actual=[int]$showWindow.View.Slide.SlideIndex } else { $actual=[int]$window.View.Slide.SlideIndex } } catch {}
  if ($actual -ne $slide) { if ($showWindow) { $showWindow.View.GotoSlide($slide) } else { $window.View.GotoSlide($slide) } }
  Start-Sleep -Milliseconds 100
  if ($showWindow) { $actual = [int]$showWindow.View.Slide.SlideIndex } else { $actual = [int]$window.View.Slide.SlideIndex }
}
if ($actual -ne $slide) { Stop-InsightSlide 'SLIDE_SELECTION_PENDING' 'PowerPoint has not yet confirmed the requested slide.' }
$title=$null
try {
  $targetSlide=$presentation.Slides.Item($actual)
  if ($targetSlide.Shapes.HasTitle) { $title=[string]$targetSlide.Shapes.Title.TextFrame.TextRange.Text }
  else {
    $largest=0
    foreach($shape in $targetSlide.Shapes) {
      if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
        $text=[string]$shape.TextFrame.TextRange.Text
        $size=[double]$shape.TextFrame.TextRange.Font.Size
        if ($text.Trim().Length -gt 3 -and $text.Trim().Length -lt 180 -and $size -ge 20 -and $size -gt $largest) { $title=$text.Trim();$largest=$size }
      }
    }
  }
} catch {}
[ordered]@{slide=$actual;slideCount=$slideCount;filename=$filename;fullName=[string]$presentation.FullName;title=$title;verified=$true;method=$method} | ConvertTo-Json -Compress
`
  );
}

function validateContextResult(result, input) {
  if (
    !result ||
    !Number.isSafeInteger(result.slideCount) ||
    result.slideCount < 1 ||
    result.slideCount > 500 ||
    !Number.isSafeInteger(result.slide) ||
    result.slide < 1 ||
    result.slide > result.slideCount ||
    typeof result.filename !== 'string' ||
    typeof result.fullName !== 'string' ||
    !path.win32.isAbsolute(result.fullName) ||
    path.win32.basename(result.fullName).toLowerCase() !== result.filename.toLowerCase()
  )
    throw new PowerPointNavigationError(
      'PowerPoint did not return a valid presentation context. Nothing was clicked.',
      'POWERPOINT_PROTOCOL',
    );
  validateSlideNavigation(result.slide, result.filename);
  if (
    (input.filename && input.filename.toLowerCase() !== result.filename.toLowerCase()) ||
    (input.fullName && input.fullName.toLowerCase() !== result.fullName.toLowerCase()) ||
    (Number.isSafeInteger(input.slide) && input.slide !== result.slide) ||
    (input.slide === 'first' && result.slide !== 1) ||
    (input.slide === 'last' && result.slide !== result.slideCount)
  )
    throw new PowerPointNavigationError(
      'The PowerPoint presentation changed. Nothing further was clicked.',
      'PRESENTATION_CHANGED',
    );
  for (const target of [result.target, result.focusTarget]) {
    if (
      target &&
      (!Number.isSafeInteger(target.x) ||
        !Number.isSafeInteger(target.y) ||
        Math.abs(target.x) > 100_000 ||
        Math.abs(target.y) > 100_000)
    )
      throw new PowerPointNavigationError(
        'PowerPoint returned an invalid pointer target. Nothing was clicked.',
        'POWERPOINT_PROTOCOL',
      );
  }
  return result;
}

// Injection keeps retry/cancellation/verification tests independent of Office
// installation. The production navigator uses the actual PowerShell/Win32 tools.
function createPowerPointNavigator(dependencies = {}) {
  const execute = dependencies.runScript || runScript;
  const pointer = dependencies.runPointerCommand || runPointerCommand;
  const now = dependencies.now || Date.now;
  const delay = dependencies.delay || waitForRetry;
  return async function navigatePresentationSlide(slide, filename, signal) {
    const input = validateSlideNavigation(slide, filename);
    const deadline = now() + 28_000;
    async function attempt(script, phase, allowRetry) {
      let previous;
      for (let index = 0; index < 5; index++) {
        stopped(signal);
        const remaining = deadline - now();
        if (remaining < 250) break;
        try {
          const result = await execute(
            script,
            signal,
            Math.min(phase === 'locate' ? 6500 : 4500, remaining),
          );
          stopped(signal);
          return result;
        } catch (error) {
          stopped(signal);
          previous = error;
          if (!allowRetry || !retryableCodes.has(error.code)) throw error;
          if (index < 4) {
            const pause = Math.min(1500, (index + 1) * 500);
            if (deadline - now() <= pause + 250) break;
            await delay(pause, signal);
          }
        }
      }
      const error = new PowerPointNavigationError(
        'PowerPoint is still opening or busy. I have not verified the slide selection; try that slide command again.',
        'POWERPOINT_NOT_READY',
        { cause: previous },
      );
      error.stage = phase;
      throw error;
    }
    const located = validateContextResult(
      await attempt(contextScript(input) + locateScript, 'locate', Boolean(input.filename)),
      input,
    );
    let clicked = false;
    let focusedByMouse = false;
    stopped(signal);
    if (located.target || located.focusTarget) {
      const remaining = deadline - now();
      if (remaining < 250)
        throw new PowerPointNavigationError(
          'PowerPoint slide selection has not been verified yet.',
          'POWERPOINT_NOT_READY',
        );
      const budget = new AbortController();
      const pointerSignal = signal ? AbortSignal.any([signal, budget.signal]) : budget.signal;
      const timer = setTimeout(() => budget.abort(), remaining);
      timer.unref?.();
      const target = located.target || located.focusTarget;
      try {
        await pointer('click', target.x, target.y, pointerSignal);
        stopped(signal);
        if (budget.signal.aborted || now() >= deadline)
          throw new PowerPointNavigationError(
            'PowerPoint slide selection has not been verified yet.',
            'POWERPOINT_NOT_READY',
          );
        clicked = Boolean(located.target);
        focusedByMouse = !located.target;
      } catch (error) {
        stopped(signal);
        if (budget.signal.aborted || now() >= deadline)
          throw new PowerPointNavigationError(
            'PowerPoint slide selection has not been verified yet.',
            'POWERPOINT_NOT_READY',
            { cause: error },
          );
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    stopped(signal);
    const verified = await attempt(verificationScript(located, clicked), 'verify', true);
    validateContextResult(verified, {
      slide: located.slide,
      filename: located.filename,
      fullName: located.fullName,
    });
    if (verified.verified !== true || verified.slideCount !== located.slideCount)
      throw new PowerPointNavigationError(
        'PowerPoint slide selection has not been verified.',
        'UNVERIFIED_SELECTION',
      );
    stopped(signal);
    return { ...verified, clicked, focusedByMouse };
  };
}

const navigatePresentationSlide = createPowerPointNavigator();
module.exports = {
  validateSlideNavigation,
  navigatePresentationSlide,
  createPowerPointNavigator,
  PowerPointNavigationError,
};
