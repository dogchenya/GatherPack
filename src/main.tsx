import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { LinuxConnection } from './LinuxConnection';
import { ArchiveTree } from './ArchiveTree';
import { FileGraph } from './FileGraph';
import { useWindowDrag } from './windowDrag';
import { I18nProvider, translate, useI18n, type Language } from './i18n';
import './style.css';
import './desktop.css';
import './shelf.css';

type Format = 'Zip' | 'SevenZip' | 'TarGz';
type Entry = { path: string; name: string; isDirectory: boolean; size: number | null; status: string };
type Settings = { format: Format; shortcut: string; lastDirectory: string | null; autostart: boolean; language: Language; edgeHide: boolean };
type Report = { status: string; output: string; written: string[]; skipped: string[]; failed: string[]; pending: string[]; emptyDirectories: number; renames: { source: string; destination: string }[]; error: string | null; delivered: boolean; issues: { source: string; message: string; blocking: boolean }[] };
type Task = { running: boolean; phase: string; bytes: number; totalBytes: number; report: Report | null };
type Snapshot = { excluded?: string[]; dockMotion?: { side: 'left' | 'right' | 'top' | 'bottom'; revealing: boolean } | null; dockHidden?: 'left' | 'right' | 'top' | 'bottom' | null; entries: Entry[]; message: string; shortcutStatus: string; shortcutLastTriggered?: number | null; settings: Settings; platform: string; task: Task; expanded: boolean; trayAvailable: boolean; validation?: { root: string; scenario: string } | null };
type Plan = { excluded?: string[]; sources: string[]; entries: { source: string; destination: string; directory: boolean; size: number }[]; issues: { source: string; message: string; blocking: boolean; file: boolean }[]; renames: { source: string; destination: string }[]; totalBytes: number; files: number; emptyDirectories: number };
const formats: { value: Format; label: string; extension: string }[] = [{ value: 'Zip', label: 'ZIP', extension: 'zip' }, { value: 'SevenZip', label: '7z', extension: '7z' }, { value: 'TarGz', label: 'tar.gz', extension: 'tar.gz' }];
const empty: Snapshot = { entries: [], message: '', shortcutStatus: '请使用桌面程序连接系统能力', settings: { format: 'Zip', shortcut: 'Control+Alt+Shift+E', lastDirectory: null, autostart: false, language: 'zh-CN', edgeHide: true }, platform: '界面预览', task: { running: false, phase: '', bytes: 0, totalBytes: 0, report: null }, expanded: !isTauri(), trayAvailable: false };
function folderBytes(path: string, plan: Plan) { const prefix = path.replaceAll(String.fromCharCode(92), '/') + '/'; return plan.entries.filter(e => !e.directory && e.source.replaceAll(String.fromCharCode(92), '/').startsWith(prefix)).reduce((total, e) => total + e.size, 0); }
function size(n: number) { if (n < 1024) return n + ' B'; const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4); return (n / 1024 ** i).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]; }
function FormatSelect({ value, change }: { value: Format; change: (v: Format) => void }) { const { t } = useI18n(); return <select aria-label={t("压缩格式")} value={value} onChange={e => change(e.target.value as Format)}>{formats.map(f => <option key={f.value} value={f.value}>{f.label} (.{f.extension})</option>)}</select>; }
function App() {
  const [state, setState] = useState<Snapshot>(empty);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<'collection' | 'graph' | 'preview' | 'report'>('collection');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [packDialog, setPackDialog] = useState(false);
  const [format, setFormat] = useState<Format>('Zip');
  const [output, setOutput] = useState('');
  const [skip, setSkip] = useState(false);
  const [starting, setStarting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [connection, setConnection] = useState(false);
  const language = settings?.language ?? state.settings.language ?? 'zh-CN';
  const t = (text: string) => translate(text, language);
  const [pinned, setPinned] = useState(true);
  const [undo, setUndo] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const taskWasRunning = useRef(false);
  const generation = useRef(0);
  const desktop = isTauri();
  const drag = useWindowDrag(setError);
  useEffect(() => { document.documentElement.dataset.compact = String(!state.expanded); document.documentElement.toggleAttribute('data-docked', !!state.dockHidden); }, [state.expanded, state.dockHidden]);
  useEffect(() => { if (desktop) void invoke('set_edge_blocked', { blocked: starting || (state.expanded && (!!settings || packDialog || connection || menu)) }).catch(e => setError(String(e))); }, [desktop, state.expanded, !!settings, packDialog, connection, menu, starting]);
  const act = useCallback(async (command: string, args?: Record<string, unknown>) => {
    try { if (!desktop) throw new Error('请使用桌面程序执行此操作'); setError(''); return await invoke(command, args); }
    catch (e) { setError(String(e)); throw e; }
  }, [desktop]);
  const run = (command: string, args?: Record<string, unknown>) => { void act(command, args).catch(() => {}); };
  useEffect(() => {
    if (!desktop) return;
    let disposed = false; const stops: (() => void)[] = []; let updated = false;
    void (async () => {
      const unlisten = await listen<Snapshot>('collection-changed', e => { updated = true; if (!disposed) setState(e.payload); });
      if (disposed) { unlisten(); return; } stops.push(unlisten);
      const taskStop = await listen<Task>('task-progress', e => { if (!disposed) setState(s => ({ ...s, task: e.payload })); });
      if (disposed) { taskStop(); return; } stops.push(taskStop);
      const dropStop = await getCurrentWindow().onDragDropEvent(e => { if (!disposed) setDragOver(e.payload.type === 'enter' || e.payload.type === 'over'); });
      if (disposed) { dropStop(); return; } stops.push(dropStop);
      const initial = await invoke<Snapshot>('snapshot'); if (!disposed && !updated) setState(initial);
      await invoke('frontend_ready');
      if (initial.validation) { const { runNativeValidation } = await import('./validation'); await runNativeValidation(initial.validation); }
    })().catch(e => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; stops.forEach(stop => stop()); };
  }, [desktop]);
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const id = ++generation.current; setScanning(true);
    try { const next = await invoke<Plan>('prepare'); if (id === generation.current) { setPlan(next); setSkip(false); } }
    catch (e) { if (id === generation.current) setError(String(e)); }
    finally { if (id === generation.current) setScanning(false); }
  }, [desktop]);
  const signature = JSON.stringify([state.entries.map(e => [e.path, e.status, e.size]), state.excluded ?? []]);
  useEffect(() => { setPlan(null); if (state.validation) return; const timer = setTimeout(() => { void refresh(); }, 200); return () => { clearTimeout(timer); generation.current++; }; }, [signature, refresh, state.validation?.root]);
  useEffect(() => {
    if (desktop) void invoke('set_panel_wide', { wide: tab === 'graph' }).catch(e => setError(String(e)));
  }, [tab, desktop]);
  useEffect(() => {
    if (taskWasRunning.current && !state.task.running && state.task.report) setTab('report');
    taskWasRunning.current = state.task.running;
  }, [state.task.running, state.task.report]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function remove(path?: string, canvas = false) {
    try { await act(path ? canvas ? 'exclude_entry' : 'remove_entry' : 'clear_entries', path ? { path } : undefined); setUndo(true); setNotice(path ? canvas ? '已从本次打包移除，源文件保留原处' : '已移出清单，源文件保留原处' : '清单已清空，源文件保留原处'); } catch { /* inline error */ }
  }
  async function restore() { try { await act('undo_collection'); setUndo(false); setNotice('已撤销，并保留新收集的项目'); } catch { /* inline error */ } }
  async function pin() { try { await act('set_pinned', { pinned: !pinned }); setPinned(!pinned); } catch { /* inline error */ } }
  function relink(path: string, directory?: boolean) {
    const root = state.entries.find(e => path === e.path || path.startsWith(e.path + '/') || path.startsWith(e.path + String.fromCharCode(92)));
    if (root) void act('relink_entry', { path: root.path, directory: directory ?? root.isDirectory }).then(changed => { if (changed) { setUndo(true); void refresh(); } }).catch(() => {});
  }
  async function openPack() {
    setOutput(''); setSkip(false); setFormat(state.settings.format); setPackDialog(true); await refresh();
  }
  async function choose() { try { const p = await act('choose_output', { format }); if (typeof p === 'string') setOutput(p); } catch { /* shown inline */ } }
  async function start() {
    setStarting(true);
    try { const pending = act('start_pack', { output, format, skipIssues: skip, expectedPlan: plan }); setPackDialog(false); await pending; }
    catch { setPackDialog(true); await refresh(); }
    finally { setStarting(false); }
  }
  const task = state.task;
  const blockers = plan?.issues.filter(i => i.blocking) ?? [];
  const changed = plan !== null && (JSON.stringify(plan.sources) !== JSON.stringify(state.entries.map(e => e.path)) || JSON.stringify(plan.excluded ?? []) !== JSON.stringify(state.excluded ?? []));
  const progress = task.totalBytes ? Math.min(100, Math.round(task.bytes / task.totalBytes * 100)) : 0;
  const preventWebDrop = (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragOver(false); if (!event.dataTransfer.files.length) setError('仅支持本地真实文件和文件夹，文本或网页链接不会加入清单。'); };
  if (state.dockHidden) return <I18nProvider language={language}><button className={'edge-handle ' + state.dockHidden} aria-label={t("显示悬浮框")} title={t("悬停恢复悬浮框，点击打开清单")} onMouseEnter={() => run('reveal_dock')} onFocus={() => run('reveal_dock')} onClick={() => run('set_expanded', { expanded: true })}><span /></button></I18nProvider>;
  if (!state.expanded) return <I18nProvider language={language}><div className={'compact' + (state.dockMotion ? ' edge-' + state.dockMotion.side + (state.dockMotion.revealing ? ' edge-revealing' : ' edge-hiding') : '')} onMouseDown={e => drag.down(e)} onMouseMove={drag.move} onMouseUp={drag.end} onDragOver={e => e.preventDefault()} onDrop={preventWebDrop}>
    <div className="handle" title={t("按住悬浮框任意空白或图标拖动")}><i /><i /><i /></div>
    <button className="orb" data-drag-click onClick={event => { if (event.detail === 0 || !drag.wasDragged()) run('set_expanded', { expanded: true }); }} aria-label={t("展开收集面板")} title={t(error || state.message || (state.shortcutStatus !== '快捷键已注册' ? state.shortcutStatus : t('点击展开 · 按住拖动 · 拖入收集')))}><Icon name="box" /><b>{state.entries.length}</b></button>
    <small role="status" title={t(error || state.message)}>{t(error || (state.message ? state.message.split('\n')[0] : state.validation?.scenario === 'desktop' ? '本地预览' : '拖入收集'))}</small>
  </div></I18nProvider>;
  return <I18nProvider language={language}><main className={(dragOver ? 'drop-active ' : '') + (tab === 'graph' ? 'graph-mode' : '') + (state.dockMotion ? ' edge-' + state.dockMotion.side + (state.dockMotion.revealing ? ' edge-revealing' : ' edge-hiding') : '')} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }} onDrop={preventWebDrop}>
    <header onMouseDown={e => drag.down(e, true)} title={t("按住标题栏空白区域拖动")}><span className="grip" aria-hidden="true">⠿</span><span className="logo"><Icon name="box" /></span><div className="brand"><h1>{t("收集清单")}</h1><p>{state.entries.length} {t(" 项来源 · ")}{scanning ? t('正在扫描…') : plan ? size(plan.totalBytes) : t('把分散的文件，轻轻收在一起。')}</p></div>
      <button className={'icon-button pin-button' + (pinned ? ' selected' : '')} aria-label={t("置顶窗口")} aria-pressed={pinned} title={pinned ? t('取消置顶') : t('置顶窗口')} onClick={() => void pin()}><Icon name="pin" /></button>
      <button className="icon-button" aria-label={t("设置")} title={t("设置")} onClick={() => setSettings({ ...state.settings })}><Icon name="settings" /></button>
      <button className="icon-button" aria-label={t("收起面板")} title={t("收起面板")} onClick={() => run('set_expanded', { expanded: false })}><Icon name="collapse" /></button>
      <div className="menu-wrap"><button className="icon-button" aria-label={t("应用菜单")} aria-expanded={menu} onClick={() => setMenu(!menu)}>···</button>{menu && <div className="menu"><button disabled={!state.trayAvailable} onClick={() => { setMenu(false); run('hide_window'); }}>{t("隐藏收集栏")}</button><button onClick={() => { setMenu(false); setTab('preview'); }}>{t("目录与问题")}</button><button onClick={() => { setMenu(false); setTab('report'); }}>{t("结果报告")}</button><button onClick={() => run('exit_app')}>{t("退出 GatherPack")}</button></div>}</div>
    </header>
    <div className="view-bar"><nav aria-label={t("内容视图")}><button aria-label={t("收集清单")} className={tab === 'collection' ? 'active' : ''} onClick={() => setTab('collection')}><Icon name="list" />{t("清单")}</button><button aria-label={t("文件关系图")} className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}><Icon name="graph" />{t("文件全景")}</button></nav><div className="add-menu"><div className="add-options"><button onClick={() => run('pick_entries', { directories: false })}><Icon name="plus" />{t("添加文件")}</button><button onClick={() => run('pick_entries', { directories: true })}>{t("添加文件夹")}</button></div></div></div>
    {!desktop && <p className="message">{t("这是浏览器界面预览。系统拖拽、快捷键、收集和打包请在桌面程序中使用。")}</p>}
    {!state.entries.length && <section className="drop-area"><Icon name="plus" /><div><h2>{t("拖入文件或整个文件夹")}</h2><p>{t("跨目录持续收集，原文件保留原处")}</p></div></section>}
    {error && <p role="alert" className="error">{t(error)}<button aria-label={t("关闭错误提示")} onClick={() => setError('')}>×</button></p>}
    {state.message && <p role="status" className="message">{t(state.message)}</p>}
    {task.running && <section className="task" role="status"><div><strong>{t(task.phase)}</strong><span>{size(task.bytes)} / {size(task.totalBytes)}</span><button onClick={() => run('cancel_pack')}>{t("取消任务")}</button></div><progress max={100} value={progress} /><small>{t("公共清单可继续操作，变更用于下次任务。")}</small></section>}
    {(tab === 'preview' || tab === 'report') && <div className="detail-heading"><button onClick={() => setTab('collection')}>{t("← 返回清单")}</button><strong>{tab === 'preview' ? t('目录与问题') : t('结果报告')}</strong></div>}
    <section className="content">
      {tab === 'graph' && (scanning || changed ? <p className="empty">{t("正在更新文件关系图…")}</p> : plan && state.entries.length ? <FileGraph key={signature} plan={plan} reveal={path => run('reveal', { path })} remove={path => void remove(path, true)} /> : <div className="empty"><span>⌘</span><h2>{t("先收集，再看全貌")}</h2><p>{t("添加文件或文件夹后，在这里查看可展开的文件关系图。")}</p></div>)}
      {tab === 'collection' && <><div className="section-heading"><p>{task.running ? t('新收集的内容将用于下次打包') : t('仅记录路径，打包时读取当前内容')}</p><button disabled={!state.entries.length} onClick={() => void remove()}>{t("清空清单")}</button></div>{!state.entries.length ? <div className="empty"><span>▤</span><h2>{t("从第一份文件开始")}</h2><p>{t("拖入，或在文件管理器中选中后按收集快捷键。")}</p></div> : <ul>{state.entries.map(entry => <li key={entry.path}><span className={'file-icon ' + (entry.isDirectory ? 'folder' : /\.(png|jpg|jpeg|gif|webp)$/i.test(entry.name) ? 'image' : /\.(xls|xlsx|csv)$/i.test(entry.name) ? 'sheet' : 'document')}><Icon name={entry.isDirectory ? 'folder' : 'file'} /></span><div className="file-info"><strong>{entry.name}</strong>{plan?.renames.some(r => r.source === entry.path) && <em className="rename-badge">{t("自动编号")}</em>}<span title={entry.path}>{entry.path}</span><small className={entry.status !== '可用' ? 'warning' : ''}>{entry.isDirectory ? t('文件夹 · ') + (scanning ? t('计算中…') : plan ? size(folderBytes(entry.path, plan)) : t('待扫描')) + t(' · 包含隐藏内容') : entry.size === null ? t('未知大小') : size(entry.size)} · {t(entry.status)}</small></div><span className="entry-size">{entry.isDirectory ? plan ? size(folderBytes(entry.path, plan)) : t('扫描中') : entry.size === null ? '—' : size(entry.size)}</span><div className="entry-actions">{entry.status !== '可用' && <button title={t("重新定位")} aria-label={t('重新定位 ') + entry.name} onClick={() => relink(entry.path)}><Icon name="undo" /></button>}<button className="reveal-entry" title={t("定位来源")} aria-label={t('定位 ') + entry.name} onClick={() => run('reveal', { path: entry.path })}><Icon name="locate" /></button><button aria-label={t('移除 ') + entry.name} title={t("移除")} onClick={() => void remove(entry.path)}><Icon name="close" /></button></div></li>)}</ul>}</>}
      {tab === 'preview' && <><div className="section-heading"><p>{t("只读预览 · 保留目录结构及空文件夹")}</p><button disabled={scanning} onClick={() => void refresh()}>{scanning ? t('扫描中…') : t('重新检查')}</button></div>{plan && <><p className="hint">{plan.files} {t(" 个文件 · ")}{plan.emptyDirectories} {t(" 个空目录 · ")}{plan.renames.length} {t(" 处改名")}</p>{plan.issues.length > 0 && <div className="issues"><h3>{t("打包前问题检查")}</h3>{plan.issues.map((issue, i) => <div className="issue" key={i}><strong>{issue.blocking ? t('需处理') : t('已去重')} · {t(issue.message)}</strong><span>{issue.source}</span><button onClick={() => run('reveal', { path: issue.source })}>{t("定位来源")}</button>{issue.blocking && <><button onClick={() => relink(issue.source, false)}>{t("重新定位文件")}</button><button onClick={() => relink(issue.source, true)}>{t("重新定位文件夹")}</button></>}</div>)}</div>}{plan.renames.length > 0 && <details><summary>{t("查看重命名映射 (")}{plan.renames.length})</summary>{plan.renames.map((r, i) => <p className="mapping" key={i}>{r.source}<br />→ {r.destination}</p>)}</details>}<ArchiveTree key={signature} entries={plan.entries} />{!plan.entries.length && <p className="empty">{t("没有可打包内容。")}</p>}</>}{!plan && <p className="empty">{scanning ? t('正在扫描文件和权限…') : t('请先添加文件。')}</p>}</>}
      {tab === 'report' && <ReportView report={task.report} reveal={path => run('reveal', { path })} />}
    </section>
    <footer><div className="collection-summary"><span>{scanning ? t('扫描中…') : plan ? t(`${plan.files} 个文件 · ${size(plan.totalBytes)}`) : t(`${state.entries.length} 项来源`)}</span><div><button aria-label={t("目录与问题")} onClick={() => setTab('preview')}>{blockers.length ? <><Icon name="alert" />{blockers.length} {t(" 项待处理")}</> : t('查看目录')}</button>{task.report && <button aria-label={t("结果报告")} onClick={() => setTab('report')}>{t("报告")}</button>}{undo && <button onClick={() => void restore()}><Icon name="undo" />{t("撤销")}</button>}</div></div><button aria-label={t("检查并打包 →")} className="primary pack-button" disabled={!desktop || !state.entries.length || task.running || starting} onClick={() => void openPack()}><Icon name="box" /><span>{task.running ? t(`正在打包 · ${progress}%`) : t('检查并打包')}</span><Icon name="arrow" /></button><div className="connection-strip"><button onClick={() => setConnection(true)}><span className="status-dot" data-ok={state.shortcutStatus === '快捷键已注册'} />{desktop ? t('本地收集') : t('浏览器预览')} · {state.shortcutStatus === '快捷键已注册' ? t('快捷键已注册') : t('需要连接')}</button><kbd title={t(state.shortcutStatus)}>{state.settings.shortcut.replaceAll('Control', 'Ctrl').replaceAll('Command', '⌘').replaceAll('+', ' ')}</kbd></div></footer>
    {notice && <div className="toast" role="status"><Icon name="check" />{t(notice)}{undo && <button onClick={() => void restore()}>{t("撤销")}</button>}</div>}
    {connection && <Modal label={t("收集连接")} close={() => setConnection(false)}><span className="dialog-emblem"><Icon name="settings" /></span><h2>{t("收集连接")}</h2><p>{t("快捷键注册和文件管理器连接是两个独立步骤。")}</p><div className="connection-card"><strong>{t("全局快捷键")}</strong><p>{t(state.shortcutStatus)}</p>{state.shortcutLastTriggered && <small>{t("最近触发 ")}{new Date(state.shortcutLastTriggered).toLocaleTimeString()}</small>}<button disabled={!desktop} onClick={() => run('retry_shortcut')}>{t("重新注册")}</button></div><div className="connection-card"><strong>{t("文件管理器连接")}</strong><p>{t(state.message || '请在系统文件管理器中选中文件，按收集快捷键；如需权限或依赖，具体原因会显示在这里。')}</p></div><>{state.platform === 'linux' && <LinuxConnection />}</><p className="hint">{t(state.platform)} {t(" · 拖入和手动添加始终可用。Ubuntu 使用 GNOME/X11；依赖已安装但桥接未加载时，请退出后台“文件”进程后重新打开。")}</p>{error && <p role="alert" className="error">{t(error)}</p>}<div className="dialog-actions"><button className="primary" onClick={() => setConnection(false)}>{t("完成")}</button></div></Modal>}
    {settings && <Modal label={t("应用设置")} close={() => setSettings(null)}><span className="dialog-emblem"><Icon name="settings" /></span><h2>{t("应用设置")}</h2><label>{t("界面语言")}<select aria-label={t("界面语言")} value={settings.language ?? 'zh-CN'} onChange={e => setSettings({ ...settings, language: e.target.value as Language })}><option value="zh-CN">{t("简体中文")}</option><option value="en">English</option></select></label><label className="checkbox"><input type="checkbox" checked={settings.edgeHide ?? true} onChange={e => setSettings({ ...settings, edgeHide: e.target.checked })} />{t("贴边隐藏")}</label><p className="hint">{t("图标和展开清单贴近左右边缘后滑出隐藏，悬停恢复；弹窗与打包时暂停。")}</p><label>{t("默认压缩格式")}<FormatSelect value={settings.format} change={format => setSettings({ ...settings, format })} /></label><label>{t("全局收集快捷键")}<input aria-label={t("全局收集快捷键")} onKeyDown={e => { if (e.key === 'Tab') return; if ((e.ctrlKey || e.altKey || e.metaKey) && /^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); setSettings({ ...settings, shortcut: [e.ctrlKey && 'Control', e.metaKey && 'Command', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.toUpperCase()].filter(Boolean).join('+') }); } }} value={settings.shortcut} onChange={e => setSettings({ ...settings, shortcut: e.target.value })} /></label><p className="hint">{t("例如 Control+Alt+Shift+E；冲突时保留原快捷键。")}</p><label className="checkbox"><input type="checkbox" checked={settings.autostart} onChange={e => setSettings({ ...settings, autostart: e.target.checked })} />{t("开机启动")}</label><p className="hint">{t(state.platform)} · {t(state.shortcutStatus)}</p>{error && <p className="error">{t(error)}</p>}<div className="dialog-actions"><button onClick={() => setSettings(null)}>{t("取消")}</button><button className="primary" onClick={() => { void act('save_settings', { format: settings.format, shortcut: settings.shortcut, autostart: settings.autostart, language: settings.language ?? 'zh-CN', edgeHide: settings.edgeHide ?? true }).then(() => setSettings(null)).catch(() => {}); }}>{t("保存设置")}</button></div></Modal>}
    {packDialog && <Modal label={t("确认打包")} close={() => setPackDialog(false)}><span className="dialog-emblem"><Icon name="box" /></span><h2>{t("确认本次打包")}</h2><p className="dialog-subtitle">{t("文件名、格式和保存位置，确认好再出发。")}</p><p>{t("当前预览：")}{plan?.files ?? 0} {t(" 个文件，")}{size(plan?.totalBytes ?? 0)}{t("。开始前再次检查来源。")}</p><label>{t("本次格式（不修改默认设置）")}<FormatSelect value={format} change={value => { setFormat(value); setOutput(''); }} /></label><div className="output-field"><label htmlFor="output-path">{t("保存到")}</label><div className="output"><input id="output-path" aria-label={t("输出路径")} value={output} onChange={e => setOutput(e.target.value)} placeholder={t("选择保存位置和包名")} /><button aria-label={t("选择保存位置")} disabled={starting} onClick={() => void choose()}>{t("选择…")}</button></div></div>{blockers.length > 0 && <label className="checkbox warning"><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />{t("明确跳过目录与问题页列出的 ")}{blockers.length} {t(" 项问题，其余内容继续打包")}</label>}<details className="pack-tree"><summary>{t("包内目录预览 (")}{plan?.entries.length ?? 0})</summary>{plan && <ArchiveTree key={signature} entries={plan.entries} />}</details><details><summary>{t("本次问题明细 (")}{plan?.issues.length ?? 0})</summary>{plan?.issues.map((issue, i) => <p className="mapping" key={i}>{issue.source}<br />{t(issue.message)}</p>)}</details><p className="hint">{t("已有同名包不会被覆盖。文件夹按整项管理，普通隐藏内容一并包含。")}</p>{error && <p role="alert" className="error">{t(error)}</p>}{task.running && <><p>{t(task.phase)} · {progress}%</p><progress max={100} value={progress} /><button onClick={() => run('cancel_pack')}>{t("取消任务")}</button></>}<div className="dialog-actions"><button onClick={() => setPackDialog(false)}>{task.running ? t('后台运行') : t('返回查看预览')}</button><button className="primary" disabled={starting || task.running || scanning || changed || !plan?.entries.length || !output || (blockers.length > 0 && !skip)} onClick={() => void start()}>{starting ? t('处理中…') : t('开始打包')}</button></div></Modal>}
  </main></I18nProvider>;
}
function ReportView({ report, reveal }: { report: Report | null; reveal: (path: string) => void }) {
  const { t } = useI18n();
  if (!report) return <p className="empty">{t("打包完成、失败或取消后，这里会显示本机结果报告。")}</p>;
  return <div className="report"><h2 className={report.delivered ? '' : 'warning'}>{report.delivered ? t('压缩包已生成') : report.status === 'cancelled' ? t('任务已取消 · 未交付') : t('任务失败 · 未交付')}</h2><p>{report.delivered ? t('文件写入完成，源文件和收集清单已保留。') : t('下列写入数仅表示临时写入，不代表已交付。')}</p><div className="report-counts"><span>{t("写入 ")}<b>{report.written.length}</b></span><span>{t("跳过 ")}<b>{report.skipped.length}</b></span><span>{t("失败 ")}<b>{report.failed.length}</b></span><span>{t("未执行 ")}<b>{report.pending.length}</b></span></div><p>{t("空目录：")}{report.emptyDirectories}</p>{report.error && <p className="error">{t(report.error)}</p>}<p className="mapping">{report.output}</p>{report.delivered && <button onClick={() => reveal(report.output)}>{t("打开输出所在目录")}</button>}{([[t('写入明细'), report.written], [t('跳过明细'), report.skipped], [t('失败明细'), report.failed], [t('未执行明细'), report.pending]] as const).map(([label, paths]) => <details key={label}><summary>{label} ({paths.length})</summary>{paths.map((p, i) => <p className="mapping" key={i}>{p}</p>)}</details>)}<details><summary>{t("问题明细 (")}{report.issues?.length ?? 0})</summary>{report.issues?.map((issue, i) => <p className="mapping" key={i}>{issue.source}<br />{t(issue.message)}</p>)}</details><details><summary>{t("重命名映射 (")}{report.renames.length})</summary>{report.renames.map((r, i) => <p className="mapping" key={i}>{r.source}<br />→ {r.destination}</p>)}</details><p className="hint">{t("报告保留在本机应用数据目录，不写入共享压缩包。")}</p></div>;
}
createRoot(document.getElementById('root')!).render(<App />);


