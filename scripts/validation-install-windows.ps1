param([Parameter(Mandatory=$true)][string]$Installer, [string]$ReportPath)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$existing = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*easy*pack*' }
if ($existing) { throw 'An existing easy_pack installation must not be replaced by this isolated test.' }
$installPath = Join-Path $workspace ('artifacts\validation\windows-install-' + [Guid]::NewGuid().ToString('N'))
if (-not $installPath.StartsWith(($workspace + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test installation path' }
$checks = [Collections.Generic.List[string]]::new()
$process = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$installPath") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)" }
$executable = Join-Path $installPath 'easy-pack.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed application executable is missing' }
$checks.Add('Silent install succeeds and installs the expected executable')
$licenses = Get-ChildItem -LiteralPath $installPath -Filter THIRD_PARTY_NOTICES.md -Recurse
if ($licenses.Count -ne 1 -or -not (Select-String -LiteralPath $licenses[0].FullName -SimpleMatch 'NSIS installer tooling' -Quiet)) { throw 'Installed licenses or NSIS notices are missing' }
$checks.Add('Installed resources include dependency and NSIS license notices')
$rustNotice = Get-ChildItem -LiteralPath $installPath -Filter Rust-COPYRIGHT-library.html -Recurse
if ($rustNotice.Count -ne 1 -or (Get-FileHash -LiteralPath $rustNotice[0].FullName -Algorithm SHA256).Hash -ne '68129500B616D5838629E68F55FF3AED5E096DACF60CE9EB41BBE599A563AFA6') { throw 'Installed Rust standard-library notice does not match the original' }
$checks.Add('Installed Rust standard-library copyright text matches the original SHA256')
& node (Join-Path $PSScriptRoot 'test-native.mjs') $executable
if ($LASTEXITCODE -ne 0) { throw 'Installed executable failed native IPC validation' }
$checks.Add('Installed executable passes core and restart native IPC scenarios')
$uninstaller = @(Get-ChildItem -LiteralPath $installPath -Filter '*uninstall*.exe')
if ($uninstaller.Count -ne 1) { throw 'Expected exactly one test uninstaller' }
$process = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Uninstaller exited $($process.ExitCode)" }
for ($i=0; $i -lt 100 -and (Test-Path -LiteralPath $executable); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path -LiteralPath $executable) { throw 'Uninstall left the application executable behind' }
$remaining = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.InstallLocation -eq $installPath }
if ($remaining) { throw 'Uninstall left its registration behind' }
$checks.Add('Silent uninstall removes the executable and installation registration')
$report = @{ passed=$true; installer=$installerPath; installerSHA256=(Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant(); installation=$installPath; checks=$checks }
if (-not $ReportPath) { $ReportPath = Join-Path $workspace 'artifacts\validation\windows-install-report.json' }
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8
$report | ConvertTo-Json -Depth 5
