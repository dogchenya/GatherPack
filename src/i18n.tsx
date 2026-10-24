import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type Language = 'zh-CN' | 'en';
// Chinese source keys keep persisted diagnostics readable across app versions.
// Only UI/diagnostic text is translated. File names and paths are never keys.
const rows = String.raw`从本次打包移除|Remove from this archive
移除仅影响打包，源文件保留原处|Removal affects this archive only. Originals stay in place.
已从本次打包移除，源文件保留原处|Removed from this archive. Originals stay in place.
请使用桌面程序连接系统能力|Use the desktop app to connect to system features
界面预览|UI preview
压缩格式|Archive format
请使用桌面程序执行此操作|Use the desktop app for this action
已移出清单，源文件保留原处|Removed from the collection. Original files stay in place.
清单已清空，源文件保留原处|Collection cleared. Original files stay in place.
已撤销，并保留新收集的项目|Undone. Newly collected items are kept.
仅支持本地真实文件和文件夹，文本或网页链接不会加入清单。|Only local files and folders can be collected. Text and web links are not added.
按住悬浮框任意空白或图标拖动|Drag the floating icon or its blank area
展开收集面板|Open collection panel
快捷键已注册|Shortcut registered
点击展开 · 按住拖动 · 拖入收集|Click to open · Hold to drag · Drop to collect
拖入收集|Drop to collect
按住标题栏空白区域拖动|Drag the blank area of the header
收集清单|Collection
项来源 ·|sources ·
正在扫描…|Scanning…
把分散的文件，轻轻收在一起。|Keep your scattered files together.
置顶窗口|Keep on top
取消置顶|Stop keeping on top
设置|Settings
收起面板|Collapse panel
应用菜单|App menu
隐藏收集栏|Hide collection
目录与问题|Contents and issues
结果报告|Result report
退出 GatherPack|Quit GatherPack
内容视图|Content views
清单|Collection
文件关系图|File graph
文件全景|File graph
添加文件|Add files
添加文件夹|Add folders
这是浏览器界面预览。系统拖拽、快捷键、收集和打包请在桌面程序中使用。|Browser preview. Use the desktop app for native drops, shortcuts, collection and archiving.
拖入文件或整个文件夹|Drop files or entire folders
跨目录持续收集，原文件保留原处|Collect across folders. Originals stay in place.
关闭错误提示|Dismiss error
取消任务|Cancel task
公共清单可继续操作，变更用于下次任务。|You can keep collecting. Changes apply to the next archive.
← 返回清单|← Back to collection
正在更新文件关系图…|Updating file graph…
先收集，再看全貌|Collect first, then see the full picture
添加文件或文件夹后，在这里查看可展开的文件关系图。|Add files or folders to explore an expandable file graph here.
新收集的内容将用于下次打包|New items will be used in the next archive
仅记录路径，打包时读取当前内容|Paths are stored; current contents are read when packing
清空清单|Clear collection
从第一份文件开始|Start with your first file
拖入，或在文件管理器中选中后按收集快捷键。|Drop files here, or select them in your file manager and use the collection shortcut.
自动编号|Renumbered
可用|Available
文件夹 ·|Folder ·
计算中…|Calculating…
待扫描|Pending scan
· 包含隐藏内容|· Includes hidden files
未知大小|Unknown size
扫描中|Scanning
重新定位|Relink
定位来源|Reveal source
定位|Reveal
移除|Remove
只读预览 · 保留目录结构及空文件夹|Read-only preview · Keeps folder structure and empty folders
扫描中…|Scanning…
重新检查|Check again
个文件 ·|files ·
个空目录 ·|empty folders ·
处改名|renamed
打包前问题检查|Issues to review before packing
需处理|Needs attention
已去重|Deduplicated
重新定位文件|Relink file
重新定位文件夹|Relink folder
查看重命名映射 (|View renamed paths (
没有可打包内容。|There is nothing to pack.
正在扫描文件和权限…|Checking files and permissions…
请先添加文件。|Add some files first.
{0} 个文件 · {1}|{0} files · {1}
{0} 项来源|{0} sources
项待处理|issues
查看目录|View contents
报告|Report
撤销|Undo
检查并打包 →|Review and pack →
正在打包 · {0}%|Packing · {0}%
检查并打包|Review and pack
本地收集|Local collection
浏览器预览|Browser preview
需要连接|Connection needed
收集连接|Collection connection
快捷键注册和文件管理器连接是两个独立步骤。|The global shortcut and file-manager connection are checked separately.
全局快捷键|Global shortcut
最近触发|Last triggered
重新注册|Register again
文件管理器连接|File-manager connection
请在系统文件管理器中选中文件，按收集快捷键；如需权限或依赖，具体原因会显示在这里。|Select files in your system file manager and use the collection shortcut. Permission or dependency issues appear here.
· 拖入和手动添加始终可用。Ubuntu 使用 GNOME/X11；依赖已安装但桥接未加载时，请退出后台“文件”进程后重新打开。|· Dropping and adding files remain available. On Ubuntu use GNOME/X11. If dependencies are installed but the bridge is not loaded, quit the background Files process and reopen Files.
完成|Done
应用设置|App settings
默认压缩格式|Default archive format
全局收集快捷键|Global collection shortcut
例如 Control+Alt+Shift+E；冲突时保留原快捷键。|For example, Control+Alt+Shift+E. A conflicting change keeps the existing shortcut.
开机启动|Launch at login
取消|Cancel
保存设置|Save settings
确认打包|Confirm archive
确认本次打包|Review this archive
文件名、格式和保存位置，确认好再出发。|Choose the name, format and destination before packing.
当前预览：|Current preview:
个文件，|files,
。开始前再次检查来源。|. Sources are checked again before packing.
本次格式（不修改默认设置）|Format for this archive (keeps your default)
保存到|Save to
输出路径|Output path
选择保存位置和包名|Choose a destination and archive name
选择保存位置|Choose destination
选择…|Choose…
明确跳过目录与问题页列出的|Explicitly skip the
项问题，其余内容继续打包|listed issues and pack the remaining items
包内目录预览 (|Archive contents (
本次问题明细 (|Issues for this archive (
已有同名包不会被覆盖。文件夹按整项管理，普通隐藏内容一并包含。|Existing archives are never overwritten. Folders are managed as whole items and include ordinary hidden files.
后台运行|Run in background
返回查看预览|Back to preview
处理中…|Working…
开始打包|Start packing
打包完成、失败或取消后，这里会显示本机结果报告。|A local result report appears here after an archive finishes, fails or is cancelled.
压缩包已生成|Archive created
任务已取消 · 未交付|Cancelled · No archive delivered
任务失败 · 未交付|Failed · No archive delivered
文件写入完成，源文件和收集清单已保留。|Files were written successfully. Originals and the collection are kept.
下列写入数仅表示临时写入，不代表已交付。|Written counts below refer to temporary output, not a delivered archive.
写入|Written
跳过|Skipped
失败|Failed
未执行|Not processed
空目录：|Empty folders:
打开输出所在目录|Open destination folder
写入明细|Written items
跳过明细|Skipped items
失败明细|Failed items
未执行明细|Unprocessed items
问题明细 (|Issues (
重命名映射 (|Renamed paths (
报告保留在本机应用数据目录，不写入共享压缩包。|Reports stay in the local app data folder and are not included in shared archives.
待处理项 ({0})|Issues ({0})
还有 {0} 项|{0} more items
把要带走的内容，一眼看全|See everything you are taking with you
点击文件夹展开 · 拖动画布 · 滚轮缩放|Click folders to expand · Drag to pan · Scroll to zoom
缩小关系图|Zoom out
适应画布|Fit to view
放大关系图|Zoom in
收集文件发散图|Collected file graph
个文件|files
显示更多：|Show more: 
文件夹：|Folder: 
文件：|File: 
点击继续显示|Click to show more
打包前需处理|Review before packing
{0} 项 · {1}|{0} items · {1}
共|Total
个节点 · 当前显示|nodes · Showing
个|nodes
只读查看，不改变收集清单|Read-only view; the collection stays unchanged
已达到单屏节点上限，请收起其他分支后继续展开。完整内容仍可在目录预览中查看。|Node limit reached. Collapse other branches to expand more. The complete contents remain available in the directory preview.
文件夹|Folder
待处理项汇总|Issue summary
打包路径：|Archive path:
选择一个节点，查看完整路径、大小和打包位置。|Select a node to see its full path, size and archive location.
压缩包目录树|Archive directory tree
继续显示（剩余|Show more (
项）|remaining)
关闭|Close 
界面语言|Interface language
贴边隐藏|Auto-hide at screen edges
收起的悬浮框靠近左右边缘后，移开鼠标自动隐藏，悬停恢复。|Move the collapsed icon to a left or right edge. It hides when the pointer leaves and returns on hover.
显示悬浮框|Show floating icon
悬停恢复悬浮框，点击打开清单|Hover to restore the icon; click to open the collection
不可用：{0}|Unavailable: {0}
链接：打包前需明确跳过|Link: explicitly skip before packing
不支持的类型|Unsupported type
{0}：需要本地绝对路径|{0}: an absolute local path is required
{0}：不支持链接或特殊类型|{0}: links and special file types are unsupported
该来源已从清单移除，请重新添加|This source was removed from the collection. Add it again.
该来源已在清单中，请移除失效项目以免重复|This source is already collected. Remove the unavailable item to avoid duplicates.
符号链接或目录链接：不跟随，需明确跳过|Symbolic link: not followed; explicitly skip it
不支持的文件类型|Unsupported file type
无法读取文件|Cannot read file
重复来源：已保留在收集的文件夹中，仅写入一次|Duplicate source: already inside a collected folder; written only once
请选择绝对输出路径|Choose an absolute output path
目标已存在，请选择新的包名，禁止覆盖|The destination exists. Choose a new archive name; overwriting is not allowed.
输出目录无效|Invalid output folder
不能将输出保存到待打包的文件夹内部|The archive cannot be saved inside a folder being packed
包名无效|Invalid archive name
不能覆盖源文件|Source files cannot be overwritten
打开时源文件类型或大小发生变化|The source type or size changed while opening it
用户取消|Cancelled by the user
用户取消准备|Preparation cancelled by the user
读取期间源文件大小发生变化|The source size changed while reading
没有可打包项目|There are no items to pack
来源文件夹变成了链接或不可用，已停止读取|The source folder became a link or is unavailable. Reading stopped.
源文件类型或大小发生变化，请重新检查|The source type or size changed. Check it again.
{0}；临时输出清理失败，残留位置 {1}：{2}|{0}; temporary output cleanup failed. Remaining path: {1}: {2}
保存目录无效|Invalid save folder
清单或设置尚未保存：{0}|Collection or settings could not be saved: {0}
；清单变更用于下次任务|; collection changes apply to the next archive
新增 {0} 项，重复 {1} 项，未加入 {2} 项{3}\n{4}|Added {0}, duplicates {1}, rejected {2}{3}\n{4}
窗口不可用|Window unavailable
来源已重新定位，请核对更新后的目录预览；正在执行的任务不受影响。|Source relinked. Review the updated preview; running tasks are unaffected.
请先检查目录预览|Review the directory preview first
清单或预览已改变，请重新检查并确认|The collection or preview changed. Review and confirm again.
已有打包任务|An archive task is already running
准备：重新检查目录|Preparing: checking sources again
源目录或问题列表已变化，请重新查看预览并确认|The sources or issues changed. Review the preview and confirm again.
请修正问题，或明确勾选跳过所列问题|Fix the issues or explicitly choose to skip them
输出扩展名与压缩格式不一致|The output extension does not match the archive format
打包中|Packing
结果报告未保存：{0}|Result report could not be saved: {0}
历史报告未保存：{0}|History report could not be saved: {0}
无法保存本机报告|Cannot save the local report
准备失败：{0}|Preparation failed: {0}
当前环境的全局快捷键后端不可用；仍可使用拖拽和添加文件|Global shortcuts are unavailable in this environment. Drop files or use Add files instead.
快捷键冲突或无法注册：{0}|Shortcut conflicts or could not be registered: {0}
开机启动设置失败：{0}|Launch-at-login setting failed: {0}
全局快捷键后端不可用，请退出后重新启动应用；Ubuntu 请使用 GNOME/X11 会话|Global shortcuts are unavailable. Restart the app; on Ubuntu use a GNOME/X11 session.
快捷键注册失败，请关闭占用此组合键的其他程序，或在设置中换键：{0}|Shortcut registration failed. Close the app using it or choose another shortcut in Settings: {0}
快捷键已重新注册。请切回文件管理器，选中文件后按收集快捷键。|Shortcut registered again. Return to your file manager, select files, and use the collection shortcut.
托盘不可用，暂不能隐藏；可收起为悬浮图标|The system tray is unavailable. Collapse to the floating icon instead.
请先取消任务，待清理完成后退出|Cancel the task and wait for cleanup before quitting
已收到快捷键，正在读取前台文件管理器的选中项…|Shortcut received. Reading the foreground file-manager selection…
已导入旧版清单、设置与报告；旧记录保留。开机启动请在新版本设置中重新启用。|Imported the previous collection, settings and reports. Originals are kept. Re-enable launch at login in the new app settings.
旧版配置未导入，原记录保留：{0}|Previous settings could not be imported. Originals are kept: {0}
恢复失败，原记录保留：{0}|Restore failed. Original records are kept: {0}
Nautilus 桥接未就绪：{0}|Nautilus bridge is not ready: {0}
快捷键后端不可用：{0}|Shortcut backend unavailable: {0}
快捷键注册失败：{0}|Shortcut registration failed: {0}
当前桌面没有系统托盘，收集栏将保留窗口入口|This desktop has no system tray. The collection window remains available.
托盘不可用，仍可通过窗口操作：{0}|The system tray is unavailable. Use the app window: {0}
无法检查 Nautilus 桥接连接：{0}|Cannot check the Nautilus bridge connection: {0}
用户目录中有同名扩展，可能覆盖系统桥接；未修改此文件：{0}|An extension with the same name in your user folder may override the system bridge. This file was left unchanged: {0}
桥接位置已有非本应用管理的文件，未覆盖：{0}|The bridge path contains a file not managed by this app. It was not overwritten: {0}
系统选择读取超时或失败，请检查辅助功能权限后重试|Selection reading timed out or failed. Check accessibility permission and retry.
选择读取失败|Selection reading failed
系统选择适配器执行失败：{0}|System selection adapter failed: {0}
系统选择适配器返回格式异常：{0}|Invalid response from the system selection adapter: {0}
适配器返回不一致的结果，已取消收集|The adapter returned inconsistent results. Collection cancelled.
找不到 Windows 系统目录|Cannot find the Windows system folder
Linux 选择读取需要系统 Python3 与 python3-pyatspi：{0}|Linux selection requires system Python 3 and python3-pyatspi: {0}
未找到 Nautilus 桥接文件，请在 GatherPack 的连接检查中点击重新注册以修复安装。|Nautilus bridge file not found. Click Register again in GatherPack's connection check to repair the installation.
未知导入错误|Unknown import error
Nautilus 扩展加载失败：{0}。扩展：{1}。请执行 sudo apt install --reinstall python3-nautilus python3-gi，再等待文件操作结束后执行 nautilus -q。|Nautilus extension failed to load: {0}. Extension: {1}. Run sudo apt install --reinstall python3-nautilus python3-gi, then wait for file operations to finish and run nautilus -q.
无法验证 Nautilus 扩展：{0}。扩展：{1}|Cannot validate the Nautilus extension: {0}. Extension: {1}
Nautilus 桥接尚未加载，python3-nautilus 已安装，无需重复安装。请先等待文件复制、移动等操作结束，再执行 nautilus -q，重新打开“文件”后重试。仅关闭文件窗口可能仍保留后台进程；若仍失败，请注销并重新登录桌面以重新加载扩展。|The Nautilus bridge has not loaded. python3-nautilus is already installed; reinstalling is unnecessary. Wait for file operations to finish, run nautilus -q, and reopen Files. Closing a window alone may leave Nautilus running. If it still fails, log out and back in to reload extensions.
Nautilus 桥接尚未加载，缺少或未完整安装 python3-nautilus。请执行 sudo apt install python3-nautilus python3-gi；等待文件操作结束后执行 nautilus -q，再重新打开“文件”重试。|The Nautilus bridge has not loaded. python3-nautilus is missing or incomplete. Run sudo apt install python3-nautilus python3-gi. Wait for file operations to finish, run nautilus -q, and reopen Files.
Nautilus 桥接尚未加载，无法确认 python3-nautilus 安装状态。请检查系统的 Nautilus Python 扩展支持；等待文件操作结束后退出 Nautilus 后台进程并重新打开。|The Nautilus bridge has not loaded and the python3-nautilus installation could not be checked. Check Nautilus Python extension support; wait for file operations to finish, quit the Nautilus background process, and reopen Files.
系统 Python 无法加载 GI，请执行 sudo apt install python3-gi|System Python cannot load GI. Run sudo apt install python3-gi.
{0}：非本地项目，未加入|{0}: not a local item; not added
文件管理器未提供有效绝对路径|The file manager did not provide a valid absolute path
请先在文件管理器中选中文件|Select files in your file manager first
前台窗口或进程变化，已取消本次收集|The foreground window or process changed. Collection cancelled.
Linux 选择读取需要 python3-pyatspi；请安装后重试|Linux selection requires python3-pyatspi. Install it and retry.
无法唯一确定前台窗口，请检查桌面辅助功能权限|The foreground window could not be uniquely identified. Check desktop accessibility permissions.
前台不是支持的系统文件管理器|The foreground window is not a supported file manager
当前辅助功能视图过大，无法安全读取选择|The accessibility view is too large to safely read its selection
未选中文件，或当前文件管理器未通过辅助功能提供选中项 URI；不能可靠读取当前选择|No files are selected, or the file manager did not expose selected file URIs through accessibility. The current selection cannot be read reliably.
收集期间前台窗口变化，请重试|The foreground window changed during collection. Try again.
Nautilus 不是前台活动窗口|Nautilus is not the active foreground window
当前桥接需要 Nautilus X11 会话|This bridge requires a Nautilus X11 session
前台窗口已经变化，未读取后台选择|The foreground window changed. Background selections were not read.
当前文件视图包含无法识别的选中项|The file view contains an unrecognized selected item
无法唯一确定当前文件视图；未读取其他标签页的选择|The current file view could not be uniquely identified. Other tabs were not read.
请先选中文件或文件夹|Select files or folders first
当前 Nautilus GTK3 视图不提供实时选择属性|The current Nautilus GTK3 view does not expose live selection
文件视图正在加载，请稍后重试|The file view is loading. Try again shortly.
当前文件视图返回了无法识别的选中项|The file view returned an unrecognized selected item
选中项没有文件 URI|The selected item has no file URI
请先在 Finder 中选中文件|Select files in Finder first
前台应用变化，请重试|The foreground app changed. Try again.
前台窗口已变化，请重新按收集键|The foreground window changed. Use the collection shortcut again.
请先在文件资源管理器中选中文件|Select files in File Explorer first
该窗口未提供可读取的资源管理器视图（桌面暂不支持）|This window does not expose a readable File Explorer view (the desktop is not supported)
发现多个匹配视图，无法安全判定当前标签页|Multiple matching views were found. The current tab cannot be safely identified.
{0}：非本地文件系统项目，未加入|{0}: not a local file-system item; not added
收集期间前台窗口变化，已取消本次收集|The foreground window changed during collection. Collection cancelled.
配置目录无效|Invalid configuration folder
旧版清单不是普通文件，未导入|The previous collection is not a regular file and was not imported
新版本报告目录不是普通目录，未导入|The new report folder is not a regular folder. Import cancelled.
文件不存在|File does not exist
Linux 连接修复|Linux connection repair
图标和展开清单贴近左右边缘后滑出隐藏，悬停恢复；弹窗与打包时暂停。|Both the icon and expanded panel slide out at either screen edge and return on hover. Auto-hide pauses during dialogs and packing.
检查当前文件管理器进程、扩展加载器和桌面会话。检查不会关闭窗口。|Inspect the running file manager, extension loader and desktop session. Checking does not close any windows.
检查中…|Checking…
检查文件管理器连接|Check file manager connection
重新连接文件管理器|Reconnect file manager
复制诊断信息|Copy diagnostics
诊断详情|Diagnostic details
确认重连|Confirm reconnection
将关闭并重新打开文件管理器窗口，请先完成复制、移动等操作。不会删除原文件。|This closes and reopens file manager windows. Finish copying or moving files first. Your original files will not be deleted.
已结束文件操作，继续重连|File operations finished — reconnect
请选中下方诊断内容手动复制。|Select the diagnostic text below and copy it manually.
文件管理器桥接已连接，请切回文件管理器选中文件后重试。|The file manager bridge is connected. Return to the file manager, select files and try again.
应用与文件管理器不在同一桌面会话，请退出 GatherPack 后从桌面应用菜单重新启动，勿使用 sudo。|The app and file manager use different desktop sessions. Quit GatherPack and reopen it from the desktop app menu without sudo.
正在运行的文件管理器没有加载 Python 扩展加载器。可在文件操作结束后点击“重新连接文件管理器”；仍失败时请导出诊断信息。|The running file manager has not loaded its Python extension loader. Finish file operations, then choose Reconnect file manager. Export diagnostics if the problem continues.
文件管理器扩展尚未连接。可在文件操作结束后点击“重新连接文件管理器”，以干净的系统 Python 环境重新加载扩展。|The file manager extension is disconnected. Finish file operations, then reconnect the file manager to reload extensions using a clean system Python environment.
重连后桥接仍未加载，请复制诊断信息用于排查；拖入和手动添加仍可使用。|The bridge is still disconnected after reconnecting. Copy diagnostics for troubleshooting. Dragging files and manual adding remain available.`;

export const catalog = new Map(rows.split('\n').map(row => {
  const index = row.indexOf('|');
  return [row.slice(0, index).replaceAll('\\n', '\n'), row.slice(index + 1).replaceAll('\\n', '\n')];
}));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = [...catalog].filter(([key]) => /\{\d+\}/.test(key)).sort((a, b) => b[0].length - a[0].length).map(([key, value]) => {
  const slots = [...key.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
  return { expression: new RegExp('^' + key.split(/\{\d+\}/).map(escape).join('([\\s\\S]*?)') + '$'), slots, value };
});

export function translate(text: string, language: Language, depth = 0): string {
  if (language !== 'en' || !text || depth > 6) return text;
  const key = text.trim();
  const exact = catalog.get(key);
  if (exact !== undefined) return text.slice(0, text.indexOf(key)) + exact + text.slice(text.indexOf(key) + key.length);
  for (const { expression, slots, value } of patterns) {
    const match = text.match(expression) ?? key.match(expression);
    if (match) {
      const values: Record<number, string> = {};
      slots.forEach((slot, index) => { values[slot] = translate(match[index + 1], language, depth + 1); });
      return value.replace(/\{(\d+)\}/g, (_, slot) => values[Number(slot)] ?? '')
        .replace(/\b1 (files|sources|items)\b/g, (_, noun: string) => '1 ' + noun.slice(0, -1));
    }
  }
  if (text.startsWith('Error: ')) return 'Error: ' + translate(text.slice(7), language, depth + 1);
  if (text.includes('\n')) return text.split('\n').map(line => translate(line, language, depth + 1)).join('\n');
  return text;
}

const Context = createContext<Language>('zh-CN');
export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <Context.Provider value={language}>{children}</Context.Provider>;
}
export function useI18n() {
  const language = useContext(Context);
  return { language, t: (text: string) => translate(text, language) };
}
