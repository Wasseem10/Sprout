const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { lstat, realpath, readFile, mkdtemp, writeFile, unlink, rmdir } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const execFileAsync = promisify(execFile);
const privateEnvironmentKeys = new Set([
  'HF_TOKEN', 'DATABRICKS_TOKEN', 'ELEVENLABS_API_KEY', 'DATABASE_URL',
  'SESSION_PASSPHRASE', 'ELECTRON_RUN_AS_NODE',
]);
function nativeEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !privateEnvironmentKeys.has(name.toUpperCase())));
}

class PresentationWindowError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = 'PresentationWindowError';
    this.code = code;
  }
}
const stopped = (signal) => {
  if (signal?.aborted)
    throw new PresentationWindowError('Opening the presentation was stopped.', 'STOPPED');
};
function waitForRetry(ms, signal) {
  stopped(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', abort); resolve(); }
    function abort() {
      clearTimeout(timer);
      reject(new PresentationWindowError('Opening the presentation was stopped.', 'STOPPED'));
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
function openingNotReady(error) {
  return error?.code === 'POWERPOINT_BUSY' ||
    (error?.code === 'POWERPOINT_UNVERIFIED' &&
      error?.cause?.diagnostics?.phase === 'shell-open' &&
      error?.cause?.diagnostics?.stage === 'shell-verify');
}
const progressPrefix = '__INSIGHT_WINDOW_PROGRESS__';
function splitProgress(stdout) {
  let progress;
  const result = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (line.startsWith(progressPrefix)) {
      try { progress = JSON.parse(line.slice(progressPrefix.length)); } catch {}
    } else if (line.trim()) result.push(line);
  }
  return { progress, text: result.join('\n') };
}
const key = (value) => path.win32.normalize(value).toLowerCase();
function validateFile(value) {
  if (
    !value ||
    typeof value.path !== 'string' ||
    value.path.length > 4096 ||
    !/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)/i.test(value.path) ||
    /[<>"|?*\x00-\x1f]/.test(value.path) ||
    value.path.slice(2).includes(':') ||
    !/\.pptx$/i.test(value.path) ||
    !/^[a-f0-9]{64}$/i.test(value.sha256)
  )
    throw new PresentationWindowError('A verified presentation file is required.', 'INVALID_INPUT');
  return { path: path.win32.normalize(value.path), sha256: value.sha256.toLowerCase() };
}
function validateInput(input) {
  if (
    !input ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.projectId) ||
    !Array.isArray(input.previous) ||
    input.previous.length > 16 ||
    (input.slide !== undefined &&
      (!Number.isSafeInteger(input.slide) || input.slide < 1 || input.slide > 500))
  )
    throw new PresentationWindowError(
      'A bounded presentation project is required.',
      'INVALID_INPUT',
    );
  const current = validateFile(input.current);
  const previous = input.previous.map(validateFile);
  const seen = new Set();
  for (const file of previous) {
    if (key(file.path) === key(current.path) || seen.has(key(file.path)))
      throw new PresentationWindowError(
        'Presentation revisions must identify distinct files.',
        'INVALID_INPUT',
      );
    seen.add(key(file.path));
  }
  if (input.executable !== undefined && (
    typeof input.executable !== 'string' ||
    input.executable.length > 4096 ||
    !/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)/i.test(input.executable) ||
    /[<>"|?*\x00-\x1f]/.test(input.executable) ||
    input.executable.slice(2).includes(':') ||
    path.win32.basename(input.executable).toLowerCase() !== 'powerpnt.exe'
  )) throw new PresentationWindowError('A valid PowerPoint application is required.', 'INVALID_INPUT');
  return { projectId: input.projectId, current, previous, slide: input.slide,
    ...(input.executable ? { executable: path.win32.normalize(input.executable) } : {}) };
}
async function matchesExecutable(executable) {
  try {
    const stat = await lstat(executable);
    return stat.isFile() && !stat.isSymbolicLink() && key(await realpath(executable)) === key(executable);
  } catch { return false; }
}
async function launchPowerPoint(executable, presentation, signal) {
  stopped(signal);
  // The file is explicitly user-requested. Keep the visible Office app independent of our
  // short-lived verification helper; cancellation must never terminate an existing Office process.
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [presentation], {
      detached: true, stdio: 'ignore', shell: false, windowsHide: false, env: nativeEnvironment(),
    });
    child.once('error', (error) => reject(new PresentationWindowError(
      'PowerPoint could not be started. Your saved presentation is unchanged.',
      'APPLICATION_UNAVAILABLE',
      { cause: new Error(`PowerPoint launch failed (${error.code || 'unknown'}).`) },
    )));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function matchesFile(file) {
  try {
    const stat = await lstat(file.path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 128 * 1024 * 1024 ||
      key(await realpath(file.path)) !== key(file.path)
    )
      return false;
    return (
      createHash('sha256')
        .update(await readFile(file.path))
        .digest('hex') === file.sha256
    );
  } catch {
    return false;
  }
}

function nativeWindowScript(input) {
  const encoded = Buffer.from(JSON.stringify(input)).toString('base64');
  return `$ErrorActionPreference='Stop'
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
try {
  Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class InsightOwnedBuddyFocus {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint first, uint second, bool attach);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  public static long[] Find(string expectedExe, string documentStem, bool buddy) {
    var matches=new List<long>();
    EnumWindows((hwnd, unused) => {
      if (!IsWindowVisible(hwnd)) return true;
      var title=new StringBuilder(1024); GetWindowText(hwnd,title,title.Capacity);
      string name=title.ToString();
      bool wanted=buddy ? name.StartsWith("InsightOS",StringComparison.OrdinalIgnoreCase) :
        (String.Equals(name,documentStem,StringComparison.OrdinalIgnoreCase) ||
         name.StartsWith(documentStem+" - ",StringComparison.OrdinalIgnoreCase) ||
         name.StartsWith(documentStem+".pptx - ",StringComparison.OrdinalIgnoreCase));
      if (!wanted) return true;
      uint pid; GetWindowThreadProcessId(hwnd,out pid);
      IntPtr handle=OpenProcess(0x1000,false,pid);
      if (handle==IntPtr.Zero) return true;
      try {
        uint size=4096; var filename=new StringBuilder((int)size);
        if (QueryFullProcessImageName(handle,0,filename,ref size) && String.Equals(filename.ToString(),expectedExe,StringComparison.OrdinalIgnoreCase)) matches.Add(hwnd.ToInt64());
      } finally { CloseHandle(handle); }
      return true;
    },IntPtr.Zero);
    return matches.ToArray();
  }
  public static bool Focus(IntPtr target) {
    uint ignored; uint current=GetCurrentThreadId(); uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
    bool attached=false;
    try {
      if (foreground!=0 && current!=foreground) attached=AttachThreadInput(current,foreground,true);
      return SetForegroundWindow(target);
    } finally { if(attached) AttachThreadInput(current,foreground,false); }
  }
}
'@
  if ($data.phase -ne 'focus-buddy') {
    $started=[DateTime]::UtcNow
    $until=$started.AddMilliseconds(25000)
    do {
      $matches=@([InsightOwnedBuddyFocus]::Find([string]$data.executable,[string]$data.documentStem,$false))
      [Console]::Out.WriteLine('${progressPrefix}'+([ordered]@{phase=[string]$data.phase;stage='wait-visible-document';matches=$matches.Count} | ConvertTo-Json -Compress))
      [Console]::Out.Flush()
      if ($matches.Count -gt 1) { throw 'Several visible PowerPoint windows match this document. No windows were closed.' }
      if ($matches.Count -eq 1 -or $data.phase -eq 'locate-document' -or $data.phase -eq 'refresh-inventory') { break }
      Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $until)
    $running=$null
    if ($data.phase -eq 'refresh-inventory') {
      # Inventory does not attach to or create an Office COM application.
      $processes=@([Diagnostics.Process]::GetProcessesByName('POWERPNT'))
      try { $running=($processes.Count -gt 0) }
      finally { foreach($process in $processes) { $process.Dispose() } }
    }
    [ordered]@{ready=($matches.Count -eq 1);processRunning=$running;phase=[string]$data.phase;diagnostics=[ordered]@{phase=[string]$data.phase;stage='wait-visible-document';expectedTitleStem=[string]$data.documentStem;executable=[string]$data.executable;matches=$matches.Count;waitedMs=[int]([DateTime]::UtcNow-$started).TotalMilliseconds}} | ConvertTo-Json -Compress -Depth 4
    exit
  }
  $matches=@([InsightOwnedBuddyFocus]::Find([string]$data.buddyExecutable,'',$true))
  if ($matches.Count -ne 1) { throw 'Exactly one owned visible InsightOS window is required for Office readiness.' }
  $target=[IntPtr]([long]$matches[0])
  [InsightOwnedBuddyFocus]::Focus($target) | Out-Null
  Start-Sleep -Milliseconds 200
  if ([InsightOwnedBuddyFocus]::GetForegroundWindow() -ne $target) { throw 'InsightOS focus could not be verified before connecting to Office.' }
  [ordered]@{focused=$true;phase='focus-buddy'} | ConvertTo-Json -Compress
} catch {
  [ordered]@{error='PowerPoint is still opening. Your saved file and earlier windows were retained.';diagnostics=[ordered]@{phase=[string]$data.phase;stage='prepare-visible-document';message=[string]$_.Exception.Message;hresult=[int]$_.Exception.HResult}} | ConvertTo-Json -Compress -Depth 4
}`;
}

function scriptFor(input, phase) {
  const encoded = Buffer.from(JSON.stringify({ ...input, phase }), 'utf8').toString('base64');
  return `$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
$script:fileFailure=$null
function Set-InsightStage([string]$value,$detail=$null) {
  $script:stage=$value
  [Console]::Out.WriteLine('${progressPrefix}'+([ordered]@{phase=[string]$data.phase;stage=$value;detail=$detail} | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}
function Test-InsightFile($file) {
  $script:fileFailure=$null
  try {
    $item=Get-Item -LiteralPath $file.path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -gt 134217728) {
      $script:fileFailure=[ordered]@{reason='not-ordinary-file';path=[string]$file.path;attributes=[string]$item.Attributes;length=$item.Length}
      return $false
    }
    if ([IO.Path]::GetFullPath([string]$item.FullName) -ine [IO.Path]::GetFullPath([string]$file.path)) {
      $script:fileFailure=[ordered]@{reason='path-mismatch';path=[string]$file.path;actualPath=[string]$item.FullName}
      return $false
    }
    $stream=$null
    $hasher=$null
    try {
      # Do not depend on optional/autoloaded PowerShell modules in the desktop backend environment.
      # Read sharing permits PowerPoint's existing handle; the resulting bytes must still match exactly.
      $stream=[IO.File]::Open([string]$file.path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
      $hasher=[Security.Cryptography.SHA256]::Create()
      $actualHash=[BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','')
    } finally {
      if ($null -ne $stream) { $stream.Dispose() }
      if ($null -ne $hasher) { $hasher.Dispose() }
    }
    if ($actualHash -ine [string]$file.sha256) {
      $script:fileFailure=[ordered]@{reason='hash-mismatch';path=[string]$file.path;expectedHash=[string]$file.sha256;actualHash=$actualHash}
      return $false
    }
    return $true
  } catch {
    $script:fileFailure=[ordered]@{reason='file-check-error';path=[string]$file.path;message=[string]$_.Exception.Message;hresult=[int]$_.Exception.HResult;code=[string]$_.FullyQualifiedErrorId}
    return $false
  }
}
function Find-InsightPresentation($ppt,[string]$fullPath) {
  $found=@()
  $script:knownPresentations=@()
  foreach($item in $ppt.Presentations) {
    $name=[string]$item.FullName
    if ($script:knownPresentations.Count -lt 32) { $script:knownPresentations += $name }
    if ([IO.Path]::GetFullPath($name) -ieq [IO.Path]::GetFullPath($fullPath)) { $found += $item }
  }
  return ,$found
}
Set-InsightStage 'verify-file'
try {
  if (-not (Test-InsightFile $data.current)) { throw 'The current presentation changed or is unavailable.' }
  if ($data.phase -eq 'shell-open') {
    Set-InsightStage 'shell-open'
    # This is the user-requested visible presentation, not a background helper window.
    if (-not $data.externalLaunched -and $data.executable) {
      $executableItem=Get-Item -LiteralPath ([string]$data.executable) -Force
      if ($executableItem.PSIsContainer -or $executableItem.Name -ine 'POWERPNT.EXE' -or ($executableItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'The PowerPoint application could not be verified.' }
      Start-Process -FilePath ([string]$data.executable) -ArgumentList @('"' + [string]$data.current.path + '"') | Out-Null
    } elseif (-not $data.externalLaunched) {
      Start-Process -FilePath ([string]$data.current.path) | Out-Null
    }
    Set-InsightStage 'shell-verify'
    $until=[DateTime]::UtcNow.AddMilliseconds(4500)
    do {
      $currentMatches=@()
      try {
        Set-InsightStage 'attach-current'
        $ppt=[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
        Set-InsightStage 'enumerate-current'
        $currentMatches=Find-InsightPresentation $ppt $data.current.path
        Set-InsightStage 'inspect-current-window' @{matches=$currentMatches.Count;presentations=$script:knownPresentations}
        if ($currentMatches.Count -eq 1 -and [int]$currentMatches[0].Windows.Count -ge 1) { break }
      } catch { Set-InsightStage 'waiting-for-document' @{message=[string]$_.Exception.Message;hresult=[int]$_.Exception.HResult} }
      Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $until)
    Set-InsightStage 'shell-verify' @{matches=$currentMatches.Count;presentations=$script:knownPresentations}
    if ($currentMatches.Count -ne 1 -or [int]$currentMatches[0].Windows.Count -lt 1) { throw 'The launched presentation could not be verified in PowerPoint.' }
  } else {
    Set-InsightStage 'connect'
    try { $ppt=[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') }
    catch {
      if ($data.phase -ne 'open') { throw 'PowerPoint closed before the previous revision could be checked.' }
      $ppt=New-Object -ComObject PowerPoint.Application
    }
    $currentMatches=Find-InsightPresentation $ppt $data.current.path
  }
  Set-InsightStage 'match-current'
  if ($currentMatches.Count -gt 1) { throw 'Several PowerPoint windows identify the current file. No previous revision was closed.' }
  if ($data.phase -eq 'prepare-refresh') {
    Set-InsightStage 'prepare-refresh'
    if ($currentMatches.Count -eq 0) {
      [ordered]@{prepared=$true;wasOpen=$false;closed=$false;path=[string]$data.current.path} | ConvertTo-Json -Compress
      exit
    }
    $current=$currentMatches[0]
    if ([string]$current.FullName -ine [string]$data.current.path -or [int]$current.Windows.Count -ne 1) {
      [ordered]@{prepared=$false;reason='ambiguous';wasOpen=$true;closed=$false;path=[string]$data.current.path} | ConvertTo-Json -Compress
      exit
    }
    if ([int]$current.Saved -ne -1) {
      [ordered]@{prepared=$false;reason='unsaved';wasOpen=$true;closed=$false;path=[string]$data.current.path} | ConvertTo-Json -Compress
      exit
    }
    $selected=$null
    if ([int]$current.Windows.Count -eq 1) {
      try { $selected=[int]$current.Windows.Item(1).View.Slide.SlideIndex } catch { }
    }
    if ($null -eq $selected -or $selected -lt 1) {
      [ordered]@{prepared=$false;reason='selection';wasOpen=$true;closed=$false;path=[string]$data.current.path} | ConvertTo-Json -Compress
      exit
    }
    # Recheck both identities immediately before closing this exact saved document.
    if (-not (Test-InsightFile $data.current) -or -not (Test-InsightFile $data.staged)) {
      [ordered]@{prepared=$false;reason='changed';wasOpen=$true;closed=$false;path=[string]$data.current.path} | ConvertTo-Json -Compress
      exit
    }
    if ([int]$current.Saved -ne -1) {
      [ordered]@{prepared=$false;reason='unsaved';wasOpen=$true;closed=$false;path=[string]$data.current.path} | ConvertTo-Json -Compress
      exit
    }
    $closed=$false
    if ($data.closeCurrent) {
      Set-InsightStage 'close-working-file'
      $current.Close()
      $remaining=Find-InsightPresentation $ppt $data.current.path
      if ($remaining.Count -ne 0) { throw 'The working presentation could not be closed for refresh.' }
      $closed=$true
    }
    [ordered]@{prepared=$true;wasOpen=$true;closed=$closed;path=[string]$data.current.path;selectedSlide=$selected} | ConvertTo-Json -Compress
    exit
  }
  if ($data.phase -eq 'open' -or $data.phase -eq 'shell-open') {
    if ($currentMatches.Count -eq 0) {
      Set-InsightStage 'com-open'
      $current=$ppt.Presentations.Open([string]$data.current.path,0,0,-1)
    }
    else { $current=$currentMatches[0] }
    Set-InsightStage 'verify-window'
    if ([string]$current.FullName -ine [string]$data.current.path -or [int]$current.Windows.Count -lt 1) { throw 'PowerPoint did not open the requested file.' }
    $window=$current.Windows.Item(1)
    Set-InsightStage 'activate-window'
    $window.Activate()
    $selected=$null
    if ($null -ne $data.slide) {
      Set-InsightStage 'select-slide'
      $wanted=[int]$data.slide
      if ($wanted -lt 1 -or $wanted -gt [int]$current.Slides.Count) { throw 'The requested slide is outside this presentation.' }
      if ([int]$window.ViewType -ne 9) { $window.ViewType=9 }
      $window.View.GotoSlide($wanted)
      $selected=[int]$window.View.Slide.SlideIndex
      if ($selected -ne $wanted) { throw 'PowerPoint has not verified the requested slide.' }
    }
    Set-InsightStage 'verify-open-file'
    if (-not (Test-InsightFile $data.current)) { throw 'The current presentation changed while opening.' }
    [ordered]@{opened=$true;path=[string]$current.FullName;selectedSlide=$selected;outcomes=@()} | ConvertTo-Json -Compress -Depth 5
  } else {
    Set-InsightStage 'prune'
    if ($currentMatches.Count -ne 1 -or [int]$currentMatches[0].Windows.Count -lt 1) { throw 'The new presentation is no longer open. Previous revisions were retained.' }
    $current=$currentMatches[0]
    $outcomes=@()
    foreach($expected in $data.previous) {
      # Only registered exact paths are candidates. Never enumerate by filename prefix or close the active app.
      $previousMatches=Find-InsightPresentation $ppt $expected.path
      $status='not-open'
      if ($previousMatches.Count -gt 1) { $status='ambiguous' }
      elseif ($previousMatches.Count -eq 1) {
        $prior=$previousMatches[0]
        # Do not set Saved or suppress alerts: an unsaved manual edit must never be discarded.
        if ([int]$prior.Saved -ne -1 -or -not (Test-InsightFile $expected)) { $status='modified' }
        else {
          try {
            if ([string]$prior.FullName -ine [string]$expected.path -or [int]$prior.Saved -ne -1) { $status='modified' }
            else {
              $prior.Close()
              $remaining=Find-InsightPresentation $ppt $expected.path
              $status=if ($remaining.Count -eq 0) { 'closed' } else { 'retained' }
            }
          } catch { $status='retained' }
        }
      }
      $outcomes += [ordered]@{path=[string]$expected.path;status=$status}
    }
    $current.Windows.Item(1).Activate()
    [ordered]@{opened=$true;path=[string]$current.FullName;outcomes=$outcomes} | ConvertTo-Json -Compress -Depth 5
  }
} catch {
  $record=$_
  $causes=@()
  $exception=$record.Exception
  while ($null -ne $exception -and $causes.Count -lt 6) {
    $causes += [ordered]@{type=$exception.GetType().FullName;message=([string]$exception.Message).Substring(0,[Math]::Min(2000,([string]$exception.Message).Length));hresult=[int]$exception.HResult}
    $exception=$exception.InnerException
  }
  [ordered]@{error='PowerPoint could not complete the verified revision switch. Your files and unverified windows were retained.';diagnostics=[ordered]@{phase=[string]$data.phase;stage=$stage;code=[string]$record.FullyQualifiedErrorId;causes=$causes;fileCheck=$script:fileFailure}} | ConvertTo-Json -Compress -Depth 6
}`;
}

async function runScript(script, signal, timeout, executeFile = execFileAsync) {
  stopped(signal);
  let stdout;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'insight-powerpoint-'));
  const scriptPath = path.join(temporaryDirectory, 'verify.ps1');
  try {
    // Windows command lines stop at 32 KiB. The bounded registry belongs in a private script file,
    // not a base64 command-line argument. BOM preserves non-ASCII folder names in Windows PowerShell.
    await writeFile(scriptPath, `\uFEFF${script}`, { encoding: 'utf8', mode: 0o600 });
    stopped(signal);
    ({ stdout } = await executeFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
      ],
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024, signal, env: nativeEnvironment() },
    ));
  } catch (error) {
    stopped(signal);
    const cause = new Error('The PowerPoint verification helper did not complete.');
    cause.diagnostics = { ...splitProgress(error?.stdout).progress, process: {
      code: typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : null,
      signal: error?.signal || null,
      killed: error?.killed === true,
    } };
    throw new PresentationWindowError(
      'PowerPoint is busy. The new file is saved, but the window switch is unverified.',
      'POWERPOINT_BUSY',
      { cause },
    );
  } finally {
    await unlink(scriptPath).catch(() => {});
    await rmdir(temporaryDirectory).catch(() => {});
  }
  try {
    const result = JSON.parse(splitProgress(stdout).text.trim());
    if (result?.error) {
      const cause = new Error(String(result.error));
      cause.diagnostics = result.diagnostics;
      throw cause;
    }
    return result;
  } catch (error) {
    throw new PresentationWindowError(
      'PowerPoint could not verify the revision switch. Existing files were retained.',
      'POWERPOINT_UNVERIFIED',
      { cause: error },
    );
  }
}

// Dependency injection exercises the exact ownership/sequence/cancellation contract without installed Office.
function createPresentationWindowManager(dependencies = {}) {
  const execute = dependencies.runScript || ((script, signal, timeout) =>
    runScript(script, signal, timeout, dependencies.executeFile || execFileAsync));
  const checkFile = dependencies.matchesFile || matchesFile;
  const checkExecutable = dependencies.matchesExecutable || matchesExecutable;
  const launch = dependencies.launchPowerPoint || launchPowerPoint;
  const wait = dependencies.waitForRetry || waitForRetry;
  const buddyExecutable = dependencies.buddyExecutable || path.resolve(__dirname, '../node_modules/electron/dist/electron.exe');
  const platform = dependencies.platform || process.platform;
  return async function openManagedPresentation(request) {
    const budget = new AbortController();
    const signal = request.signal
      ? AbortSignal.any([request.signal, budget.signal])
      : budget.signal;
    const deadline = Date.now() + 45000;
    const timer = setTimeout(() => budget.abort(), 45000);
    timer.unref?.();
    try {
      stopped(signal);
      const input = validateInput(request);
      if (platform !== 'win32')
        throw new PresentationWindowError(
          'Managed PowerPoint windows are available on Windows.',
          'UNSUPPORTED_PLATFORM',
        );
      if (!(await checkFile(input.current)))
        throw new PresentationWindowError(
          'The current presentation changed or is unavailable. No windows were closed.',
          'CURRENT_CHANGED',
        );
      stopped(signal);
      let opened;
      if (input.executable) {
        if (!(await checkExecutable(input.executable)))
          throw new PresentationWindowError('The installed PowerPoint application could not be verified.', 'APPLICATION_UNAVAILABLE');
        const windowInput = { executable: input.executable,
          documentStem: path.win32.basename(input.current.path, path.win32.extname(input.current.path)) };
        const existing = await execute(nativeWindowScript({ ...windowInput, phase: 'locate-document' }), signal,
          Math.max(1, Math.min(4000, deadline - Date.now())));
        stopped(signal);
        if (typeof existing?.ready !== 'boolean')
          throw new PresentationWindowError('PowerPoint document readiness could not be verified.', 'POWERPOINT_UNVERIFIED');
        if (!existing.ready) {
          await launch(input.executable, input.current.path, signal);
          stopped(signal);
          const visible = await execute(nativeWindowScript({ ...windowInput, phase: 'await-document' }), signal,
            Math.max(1, Math.min(27000, deadline - Date.now())));
          stopped(signal);
          if (visible?.ready !== true) {
            const cause = new Error('The requested PowerPoint document window was not ready within the startup allowance.');
            cause.diagnostics = visible?.diagnostics || { phase: 'await-document', stage: 'wait-visible-document' };
            throw new PresentationWindowError('PowerPoint is still opening the requested document. Earlier windows were retained.', 'POWERPOINT_BUSY', { cause });
          }
        }
        stopped(signal);
        // Office may register its automation object after losing focus. Try only our
        // verified buddy; a Windows foreground denial does not replace the exact-file
        // COM and slide verification below, and need not prevent it from succeeding.
        try {
          await execute(nativeWindowScript({ phase: 'focus-buddy', buddyExecutable }), signal,
            Math.max(1, Math.min(4000, deadline - Date.now())));
        } catch {
          stopped(signal);
        }
        stopped(signal);
        try {
          opened = await execute(
            scriptFor({ ...input, externalLaunched: true }, 'shell-open'), signal,
            Math.max(1, Math.min(6000, deadline - Date.now())),
          );
        } catch (firstVerificationError) {
          stopped(signal);
          if (!openingNotReady(firstVerificationError)) throw firstVerificationError;
          await wait(400, signal);
          stopped(signal);
          opened = await execute(
            scriptFor({ ...input, externalLaunched: true }, 'shell-open'), signal,
            Math.max(1, Math.min(6000, deadline - Date.now())),
          );
        }
      } else {
      try {
        opened = await execute(
          scriptFor(input, 'open'),
          signal,
          Math.max(1, Math.min(9000, deadline - Date.now())),
        );
      } catch (error) {
        stopped(signal);
        const diagnostics = error?.cause?.diagnostics;
        // Some inactive Office installations reject COM Open while their normal file association
        // can still display a saved deck. Fall back only at opening, never at verification/cleanup.
        if (
          error?.code !== 'POWERPOINT_UNVERIFIED' ||
          diagnostics?.phase !== 'open' ||
          !['connect', 'com-open'].includes(diagnostics.stage)
        ) throw error;
        if (!(await checkFile(input.current)))
          throw new PresentationWindowError(
            'The current presentation changed or is unavailable. No windows were closed.',
            'CURRENT_CHANGED',
            { cause: error },
          );
        if (input.executable && !(await checkExecutable(input.executable)))
          throw new PresentationWindowError(
            'The installed PowerPoint application could not be verified. No windows were closed.',
            'APPLICATION_UNAVAILABLE',
            { cause: error },
          );
        stopped(signal);
        try {
          if (input.executable) {
            await launch(input.executable, input.current.path, signal);
            stopped(signal);
          }
          const verifyInput = { ...input, externalLaunched: Boolean(input.executable) };
          try {
            opened = await execute(
              scriptFor(verifyInput, 'shell-open'), signal,
              Math.max(1, Math.min(6000, deadline - Date.now())),
            );
          } catch (firstVerificationError) {
            stopped(signal);
            if (!openingNotReady(firstVerificationError)) throw firstVerificationError;
            // PowerPoint may register its visible document after the initial COM proxy was acquired.
            // Retry in one fresh helper process; never launch another window or close anything yet.
            await wait(400, signal);
            stopped(signal);
            opened = await execute(
              scriptFor({ ...verifyInput, externalLaunched: true }, 'shell-open'), signal,
              Math.max(1, Math.min(6000, deadline - Date.now())),
            );
          }
        } catch (fallbackError) {
          // Kept privately for diagnosis; the public error remains a concise safe message.
          fallbackError.initialOpenFailure = error;
          if (fallbackError.cause) {
            fallbackError.cause.diagnostics = {
              ...fallbackError.cause.diagnostics,
              initialOpenFailure: diagnostics,
            };
          }
          throw fallbackError;
        }
      }
      }
      stopped(signal);
      if (
        opened?.opened !== true ||
        typeof opened.path !== 'string' ||
        key(opened.path) !== key(input.current.path) ||
        (input.slide !== undefined && opened.selectedSlide !== input.slide)
      )
        throw new PresentationWindowError(
          'PowerPoint did not verify the requested presentation. No previous revision was closed.',
          'OPEN_UNVERIFIED',
        );
      const result = {
        opened: true,
        ...(Number.isSafeInteger(opened.selectedSlide)
          ? { selectedSlide: opened.selectedSlide }
          : {}),
        closed: 0,
        retainedModified: 0,
        warnings: [],
      };
      const eligible = [];
      for (const file of input.previous) {
        stopped(signal);
        if (await checkFile(file)) eligible.push(file);
        else result.retainedModified++;
      }
      stopped(signal);
      if (eligible.length) {
        try {
          const pruned = await execute(
            scriptFor({ ...input, previous: eligible }, 'prune'),
            signal,
            Math.max(1, deadline - Date.now()),
          );
          stopped(signal);
          if (
            pruned?.opened !== true ||
            typeof pruned.path !== 'string' ||
            key(pruned.path) !== key(input.current.path) ||
            !Array.isArray(pruned.outcomes) ||
            pruned.outcomes.length !== eligible.length
          )
            throw new Error('Invalid revision cleanup response.');
          const statuses = new Map();
          for (const item of pruned.outcomes) {
            if (
              !item ||
              typeof item.path !== 'string' ||
              statuses.has(key(item.path)) ||
              !eligible.some((file) => key(file.path) === key(item.path)) ||
              !['closed', 'modified', 'not-open', 'ambiguous', 'retained'].includes(item.status)
            )
              throw new Error('Invalid revision cleanup result.');
            statuses.set(key(item.path), item.status);
          }
          for (const status of statuses.values()) {
            if (status === 'closed') result.closed++;
            else if (status === 'modified') result.retainedModified++;
            else if (status !== 'not-open')
              result.warnings.push('An earlier presentation window could not be safely closed.');
          }
        } catch (error) {
          stopped(signal);
          result.warnings.push(
            'The new presentation is open. Some earlier windows may remain because safe closure was not verified.',
          );
        }
      }
      if (result.retainedModified)
        result.warnings.push(
          'Earlier revisions with changed files or unsaved edits were kept open.',
        );
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
}

function validateRefreshInput(request) {
  const input = validateInput(request);
  const staged = validateFile(request.staged);
  if (key(staged.path) === key(input.current.path) || input.previous.some(file => key(file.path) === key(staged.path)))
    throw new PresentationWindowError('The staged revision must be a separate verified file.', 'INVALID_INPUT');
  if (request.open !== undefined && typeof request.open !== 'boolean')
    throw new PresentationWindowError('The presentation opening preference must be boolean.', 'INVALID_INPUT');
  return { ...input, staged, open: request.open !== false };
}

function safeRefreshFailure(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'REFRESH_FAILED',
    message: error instanceof PresentationWindowError
      ? error.message
      : 'The working presentation could not be updated. Its previous saved revision was retained.',
    ...(error?.cause?.diagnostics ? { diagnostics: error.cause.diagnostics } : {}),
  };
}

/** Native view lease around a backend-owned atomic working-file/state commit. */
function createPresentationRefreshManager(dependencies = {}) {
  const execute = dependencies.runScript || ((script, signal, timeout) =>
    runScript(script, signal, timeout, dependencies.executeFile || execFileAsync));
  const checkFile = dependencies.matchesFile || matchesFile;
  const checkExecutable = dependencies.matchesExecutable || matchesExecutable;
  const open = dependencies.openManagedPresentation || createPresentationWindowManager(dependencies);
  const platform = dependencies.platform || process.platform;
  const buddyExecutable = dependencies.buddyExecutable || path.resolve(__dirname, '../node_modules/electron/dist/electron.exe');
  return async function refreshManagedPresentation(request, promote) {
    const input = validateRefreshInput(request);
    if (typeof promote !== 'function')
      throw new PresentationWindowError('A verified presentation commit is required.', 'INVALID_INPUT');
    const budget = new AbortController();
    const signal = request.signal ? AbortSignal.any([request.signal, budget.signal]) : budget.signal;
    const deadline = Date.now() + 45000;
    const timer = setTimeout(() => budget.abort(), 45000);
    timer.unref?.();
    const result = { promoted: false, opened: false, wasOpen: false, current: input.current,
      closed: 0, retainedModified: 0, warnings: [] };
    let priorClosed = false;
    let prepared = false;
    let priorSlide;
    let promotionStarted = false;
    const timeLeft = (limit) => Math.max(1, Math.min(limit, deadline - Date.now()));
    const next = { path: input.current.path, sha256: input.staged.sha256 };
    const fail = (message, code) => { throw new PresentationWindowError(message, code); };
    try {
      stopped(signal);
      if (platform !== 'win32') fail('Managed PowerPoint refresh is available on Windows.', 'UNSUPPORTED_PLATFORM');
      if (!(await checkFile(input.current))) fail('The working presentation changed outside Insight. Save or resolve those changes before editing it.', 'CURRENT_CHANGED');
      if (!(await checkFile(input.staged))) fail('The staged revision changed or is unavailable. The working presentation was retained.', 'STAGED_CHANGED');
      stopped(signal);
      if (input.executable && !(await checkExecutable(input.executable)))
        fail('The installed PowerPoint application could not be verified.', 'APPLICATION_UNAVAILABLE');

      // A process inventory avoids creating or attaching Office just to edit a closed file.
      const inventory = await execute(nativeWindowScript({ phase: 'refresh-inventory', executable: input.executable || '',
        documentStem: path.win32.basename(input.current.path, path.win32.extname(input.current.path)) }), signal, timeLeft(4000));
      stopped(signal);
      if (typeof inventory?.processRunning !== 'boolean' || typeof inventory?.ready !== 'boolean')
        fail('PowerPoint presence could not be verified. Your working presentation was retained.', 'POWERPOINT_UNVERIFIED');
      result.wasOpen = inventory.ready;
      if (inventory.processRunning) {
        if (input.executable) {
          // Losing focus helps Office register its automation object, but Windows may
          // deny foreground activation. Exact-file COM verification below owns safety.
          try {
            await execute(nativeWindowScript({ phase: 'focus-buddy', buddyExecutable }), signal, timeLeft(4000));
          } catch {
            stopped(signal);
          }
          stopped(signal);
        }
        const closed = await execute(scriptFor({ ...input, closeCurrent: input.current.sha256 !== input.staged.sha256 }, 'prepare-refresh'), signal, timeLeft(9000));
        stopped(signal);
        if (typeof closed?.path !== 'string' || key(closed.path) !== key(input.current.path) || typeof closed.wasOpen !== 'boolean')
          fail('The exact working presentation could not be verified for refresh.', 'REFRESH_UNVERIFIED');
        if (inventory.ready && !closed.wasOpen)
          fail('The visible working presentation was not found in this PowerPoint session. No revision was published.', 'REFRESH_UNVERIFIED');
        result.wasOpen = closed.wasOpen;
        if (closed.prepared !== true) {
          if (closed.reason === 'unsaved') {
            result.retainedModified = 1;
            fail('PowerPoint has unsaved manual changes. Save or discard those changes before asking Insight to revise this presentation.', 'UNSAVED_CHANGES');
          }
          fail('The working presentation changed or has ambiguous windows. No revision was published.', closed.reason === 'changed' ? 'CURRENT_CHANGED' : 'REFRESH_UNVERIFIED');
        }
        if (typeof closed.closed !== 'boolean' || (closed.wasOpen && input.current.sha256 !== input.staged.sha256 && !closed.closed))
          fail('The working presentation did not confirm it was closed. No revision was published.', 'REFRESH_UNVERIFIED');
        prepared = true;
        priorClosed = closed.closed;
        if (Number.isSafeInteger(closed.selectedSlide) && closed.selectedSlide >= 1 && closed.selectedSlide <= 500)
          priorSlide = closed.selectedSlide;
        else if (closed.wasOpen)
          fail('The previous PowerPoint selection could not be verified. No revision was published.', 'REFRESH_UNVERIFIED');
      } else {
        if (inventory.ready) fail('PowerPoint window and process evidence disagree. No revision was published.', 'REFRESH_UNVERIFIED');
        prepared = true;
      }
      stopped(signal);
      if (!(await checkFile(input.current))) fail('The working presentation changed before publishing. The candidate was retained privately.', 'CURRENT_CHANGED');
      if (!(await checkFile(input.staged))) fail('The staged revision changed before publishing. The working file was retained.', 'STAGED_CHANGED');
      stopped(signal);
      promotionStarted = true;
      // Backend owns atomic file+manifest/state publication. It must throw only before commit.
      await promote();
      result.promoted = true;
      result.current = next;
      if (!(await checkFile(next))) fail('The new working file could not be verified after publication. Its native view was not opened.', 'PROMOTED_UNVERIFIED');
      if (signal.aborted) {
        result.stopped = true;
        result.failure = { code: 'STOPPED', message: 'The revision was saved before stopping. PowerPoint was not reopened.' };
        return result;
      }
      if (input.open || result.wasOpen) {
        const opened = await open({ projectId: input.projectId, current: next, previous: input.previous,
          slide: input.slide ?? priorSlide, executable: input.executable, signal });
        if (opened?.opened !== true || ((input.slide ?? priorSlide) !== undefined && opened.selectedSlide !== (input.slide ?? priorSlide)))
          fail('PowerPoint did not verify the new working presentation.', 'OPEN_UNVERIFIED');
        result.opened = true;
        result.closed = opened.closed || 0;
        result.retainedModified += opened.retainedModified || 0;
        result.warnings.push(...(opened.warnings || []));
        if (opened.selectedSlide !== undefined) result.selectedSlide = opened.selectedSlide;
      }
      if (signal.aborted) result.stopped = true;
      return result;
    } catch (error) {
      // New bytes are not proof that the manifest and application state committed.
      // Leave a failed publication to the backend journal; never reopen or call it saved.
      if (!result.promoted && promotionStarted && (
        error?.code === 'PUBLICATION_RECOVERY_REQUIRED' ||
        (input.current.sha256 !== next.sha256 && await checkFile(next))
      )) {
        result.recoveryRequired = true;
      }
      result.stopped = signal.aborted || error?.code === 'STOPPED';
      result.failure = safeRefreshFailure(error);
      if (result.recoveryRequired) {
        result.failure = { code: 'PUBLICATION_RECOVERY_REQUIRED',
          message: 'The working file changed, but its project state could not be committed. Recovery is required before continuing.' };
      } else if (result.promoted) {
        result.failure.message = result.stopped
          ? 'The revision was saved before stopping. PowerPoint display was not verified.'
          : 'The revision was saved, but PowerPoint could not display it. You can ask Insight to open the presentation again.';
      } else if (prepared && priorClosed && !result.stopped && await checkFile(input.current)) {
        try {
          const restored = await open({ projectId: input.projectId, current: input.current, previous: [],
            slide: priorSlide, executable: input.executable, signal });
          result.reopenedPrevious = restored.opened === true;
          result.opened = result.reopenedPrevious;
          if (restored.selectedSlide !== undefined) result.selectedSlide = restored.selectedSlide;
          result.warnings.push(...(restored.warnings || []));
        } catch {
          result.warnings.push('The previous saved file remains intact, but its PowerPoint window could not be reopened.');
        }
      }
      return result;
    } finally { clearTimeout(timer); }
  };
}
module.exports = {
  openManagedPresentation: createPresentationWindowManager(),
  createPresentationWindowManager,
  PresentationWindowError,
  validateInput,
  refreshManagedPresentation: createPresentationRefreshManager(),
  createPresentationRefreshManager,
  validateRefreshInput,
};
