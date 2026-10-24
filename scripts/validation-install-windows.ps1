param([Parameter(Mandatory=$true)][string]$Installer, [string]$ReportPath)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$existing = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*GatherPack*' }
if ($existing) { throw 'An existing gatherpack installation must not be replaced by this isolated test.' }
$installPath = Join-Path $workspace ('artifacts\validation\windows-install-' + [Guid]::NewGuid().ToString('N'))
if (-not $installPath.StartsWith(($workspace + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test installation path' }
$checks = [Collections.Generic.List[string]]::new()
$process = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$installPath") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)" }
$executable = Join-Path $installPath 'gatherpack.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed application executable is missing' }
$checks.Add('Silent install succeeds and installs the expected executable')
$expected = Get-Content (Join-Path $workspace 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$metadata = (Get-Item -LiteralPath $executable).VersionInfo
if ($metadata.ProductName -ne $expected.productName -or $metadata.ProductVersion -ne $expected.version) { throw 'Installed executable branding or version metadata is incorrect' }
$checks.Add('Installed executable product name and version match the current brand')
$licenses = Get-ChildItem -LiteralPath $installPath -Filter THIRD_PARTY_NOTICES.md -Recurse
if ($licenses.Count -ne 1 -or -not (Select-String -LiteralPath $licenses[0].FullName -SimpleMatch 'NSIS installer tooling' -Quiet)) { throw 'Installed licenses or NSIS notices are missing' }
$checks.Add('Installed resources include dependency and NSIS license notices')
$rustNotice = Get-ChildItem -LiteralPath $installPath -Filter Rust-COPYRIGHT-library.html -Recurse
if ($rustNotice.Count -ne 1 -or (Get-FileHash -LiteralPath $rustNotice[0].FullName -Algorithm SHA256).Hash -ne '68129500B616D5838629E68F55FF3AED5E096DACF60CE9EB41BBE599A563AFA6') { throw 'Installed Rust standard-library notice does not match the original' }
$checks.Add('Installed Rust standard-library copyright text matches the original SHA256')
& node (Join-Path $PSScriptRoot 'test-native.mjs') $executable
if ($LASTEXITCODE -ne 0) { throw 'Installed executable failed native IPC validation' }
$checks.Add('Installed executable passes core and restart native IPC scenarios')
$desktopPath = Join-Path $workspace 'artifacts/validation/windows-installed-desktop-report.json'
& (Join-Path $PSScriptRoot 'test-desktop-windows.ps1') -Executable $executable -ReportPath $desktopPath
$desktop = Get-Content -LiteralPath $desktopPath -Raw | ConvertFrom-Json
if (-not $desktop.passed) { throw 'Installed executable failed native desktop checks' }
$checks.Add('Installed executable passes 26 four-edge, crossed-edge and dialog native desktop checks')
$uninstaller = @(Get-ChildItem -LiteralPath $installPath -Filter '*uninstall*.exe')
if ($uninstaller.Count -ne 1) { throw 'Expected exactly one test uninstaller' }
$process = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Uninstaller exited $($process.ExitCode)" }
for ($i=0; $i -lt 100 -and (Test-Path -LiteralPath $executable); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path -LiteralPath $executable) { throw 'Uninstall left the application executable behind' }
$remaining = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.InstallLocation -eq $installPath }
if ($remaining) { throw 'Uninstall left its registration behind' }
$checks.Add('Silent uninstall removes the executable and installation registration')
$report = @{ passed=$true; installer=$installerPath; installerSHA256=(Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant(); installation=$installPath; checks=$checks; desktopValidation=@{passed=$desktop.passed;commit=$desktop.commit;executableSHA256=$desktop.executableSHA256;checks=$desktop.report.checks} }
if (-not $ReportPath) { $ReportPath = Join-Path $workspace 'artifacts\validation\windows-install-report.json' }
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding utf8
$report | ConvertTo-Json -Depth 10
