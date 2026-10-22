$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ForegroundProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
}
'@
try {
    $foreground = [IntPtr]::new($expectedHwnd)
    if ([ForegroundProbe]::GetForegroundWindow() -ne $foreground) { throw '前台窗口已变化，请重新按收集键' }
    [uint32]$sourceProcessId = 0
    [void][ForegroundProbe]::GetWindowThreadProcessId($foreground, [ref]$sourceProcessId)
    if ((Get-Process -Id $sourceProcessId).ProcessName -ne 'explorer') { throw '请先在文件资源管理器中选中文件' }
    $shell = New-Object -ComObject Shell.Application
    $candidates = @($shell.Windows() | Where-Object { [long]$_.HWND -eq $expectedHwnd })
    if ($candidates.Count -eq 0) { throw '该窗口未提供可读取的资源管理器视图（桌面暂不支持）' }
    if ($candidates.Count -ne 1) { throw '发现多个匹配视图，无法安全判定当前标签页' }
    $selected = @($candidates[0].Document.SelectedItems())
    if ($selected.Count -eq 0) { throw '请先选中文件或文件夹' }
    $paths = @()
    $rejected = @()
    foreach ($item in $selected) {
        if ($item.IsFileSystem) { $paths += [string]$item.Path }
        else { $rejected += [string]$item.Name + '：非本地文件系统项目，未加入' }
    }
    if ([ForegroundProbe]::GetForegroundWindow() -ne $foreground) { throw '收集期间前台窗口变化，已取消本次收集' }
    @{ source = 'windows-explorer'; paths = $paths; rejected = $rejected; error = $null } | ConvertTo-Json -Compress -Depth 4
} catch {
    @{ source = 'windows-explorer'; paths = @(); error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 4
}
