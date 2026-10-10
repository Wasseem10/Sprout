$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'

try {
    if (!(Test-Path -LiteralPath $electronPath)) {
        throw 'InsightOS dependencies are missing. Run npm install in the project folder.'
    }
    # Reuse the development services when they are already running. Otherwise
    # Electron starts the compiled local service itself.
    $developmentUi = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
    $developmentApi = Get-NetTCPConnection -State Listen -LocalPort 4311 -ErrorAction SilentlyContinue
    $launchArguments = @('.')
    if ($developmentUi -and $developmentApi) {
        $launchArguments += '--dev'
    } elseif (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) {
        throw 'InsightOS needs a build. Run npm run build in the project folder.'
    }
    Start-Process -FilePath $electronPath -ArgumentList $launchArguments -WorkingDirectory $projectRoot -WindowStyle Normal
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'InsightOS could not open') | Out-Null
    exit 1
}
