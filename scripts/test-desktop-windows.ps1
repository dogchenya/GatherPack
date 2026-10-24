param([string]$Executable = 'target/release/gatherpack.exe', [switch]$KeepOpen, [string]$ReportPath)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$program = (Resolve-Path -LiteralPath $Executable).Path
$taskRoot = Join-Path $workspace ('artifacts/validation/windows-desktop-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null
$child = Start-Process -FilePath $program -ArgumentList @("--validation-dir=$taskRoot", '--validation-scenario=desktop') -WindowStyle Hidden -PassThru
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    $reportFile = Join-Path $taskRoot 'desktop-report.json'
    do {
        Start-Sleep -Milliseconds 200
        if (Test-Path -LiteralPath $reportFile) {
            $report = Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json
            if ($report.samples[-1].phase -eq 'finished') { break }
        }
        if ($child.HasExited) { throw "Desktop check exited early: $($child.ExitCode)" }
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $report -or $report.samples[-1].phase -ne 'finished') { throw 'Desktop check did not finish' }
    if (-not $report.passed -or $report.checks.Count -ne 26) { throw ('Desktop assertions failed: ' + ($report.checks | ConvertTo-Json -Compress)) }
    $result = @{passed=$true; commit=(& git -C $workspace rev-parse HEAD); executableSHA256=(Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash.ToLowerInvariant(); report=$report; profile=$taskRoot; pid=$child.Id}
    $result | ConvertTo-Json -Depth 30 | Set-Content (Join-Path $taskRoot 'verified.json') -Encoding UTF8
    if ($ReportPath) { $result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
    Write-Output "Windows desktop: $($report.checks.Count) checks passed; $taskRoot"
} finally {
    if (-not $KeepOpen -and -not $child.HasExited) { Stop-Process -Id $child.Id }
}
