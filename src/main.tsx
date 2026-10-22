import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FileGraph } from './FileGraph';
import { useWindowDrag } from './windowDrag';
import './style.css';
import './desktop.css';

type Format = 'Zip' | 'SevenZip' | 'TarGz';
type Entry = { path: string; name: string; isDirectory: boolean; size: number | null; status: string };
type Settings = { format: Format; shortcut: string; lastDirectory: string | null; autostart: boolean };
type Report = { status: string; output: string; written: string[]; skipped: string[]; failed: string[]; pending: string[]; emptyDirectories: number; renames: { source: string; destination: string }[]; error: string | null; delivered: boolean; issues: { source: string; message: string; blocking: boolean }[] };
type Task = { running: boolean; phase: string; bytes: number; totalBytes: number; report: Report | null };
type Snapshot = { entries: Entry[]; message: string; shortcutStatus: string; shortcutLastTriggered?: number | null; settings: Settings; platform: string; task: Task; expanded: boolean; trayAvailable: boolean; validation?: { root: string; scenario: string } | null };
type Plan = { sources: string[]; entries: { source: string; destination: string; directory: boolean; size: number }[]; issues: { source: string; message: string; blocking: boolean; file: boolean }[]; renames: { source: string; destination: string }[]; totalBytes: number; files: number; emptyDirectories: number };
const formats: { value: Format; label: string; extension: string }[] = [{ value: 'Zip', label: 'ZIP', extension: 'zip' }, { value: 'SevenZip', label: '7z', extension: '7z' }, { value: 'TarGz', label: 'tar.gz', extension: 'tar.gz' }];
const empty: Snapshot = { entries: [], message: '', shortcutStatus: '请使用桌面程序连接系统能力', settings: { format: 'Zip', shortcut: 'Control+Alt+Shift+E', lastDirectory: null, autostart: false }, platform: '界面预览', task: { running: false, phase: '', bytes: 0, totalBytes: 0, report: null }, expanded: !isTauri(), trayAvailable: false };
function folderBytes(path: string, plan: Plan) { const prefix = path.replaceAll(String.fromCharCode(92), '/') + '/'; return plan.entries.filter(e => !e.directory && e.source.replaceAll(String.fromCharCode(92), '/').startsWith(prefix)).reduce((total, e) => total + e.size, 0); }
function size(n: number) { if (n < 1024) return n + ' B'; const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4); return (n / 1024 ** i).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]; }
function FormatSelect({ value, change }: { value: Format; change: (v: Format) => void }) { return <select aria-label="压缩格式" value={value} onChange={e => change(e.target.value as Format)}>{formats.map(f => <option key={f.value} value={f.value}>{f.label} (.{f.extension})</option>)}</select>; }
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
  const [visible, setVisible] = useState(300);
  const generation = useRef(0);
  const desktop = isTauri();
  const drag = useWindowDrag(setError);
  useEffect(() => { document.documentElement.dataset.compact = String(!state.expanded); }, [state.expanded]);
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
      const initial = await invoke<Snapshot>('snapshot'); if (!disposed && !updated) setState(initial);
      await invoke('frontend_ready');
      if (initial.validation) { const { runNativeValidation } = await import('./validation'); await runNativeValidation(initial.validation); }
    })().catch(e => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; stops.forEach(stop => stop()); };
  }, [desktop]);
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const id = ++generation.current; setScanning(true);
    try { const next = await invoke<Plan>('prepare'); if (id === generation.current) { setPlan(next); setSkip(false); setVisible(300); } }
    catch (e) { if (id === generation.current) setError(String(e)); }
    finally { if (id === generation.current) setScanning(false); }
  }, [desktop]);
  const signature = JSON.stringify(state.entries.map(e => [e.path, e.status, e.size]));
  useEffect(() => { setPlan(null); if (state.validation) return; const timer = setTimeout(() => { void refresh(); }, 200); return () => { clearTimeout(timer); generation.current++; }; }, [signature, refresh, state.validation?.root]);
  async function openPack() {
    setOutput(''); setSkip(false); setFormat(state.settings.format); setPackDialog(true); setTab('preview'); await refresh();
  }
  async function choose() { try { const p = await act('choose_output', { format }); if (typeof p === 'string') setOutput(p); } catch { /* shown inline */ } }
  async function start() {
    setStarting(true);
    try { await act('start_pack', { output, format, skipIssues: skip, expectedPlan: plan }); setPackDialog(false); setTab('report'); }
    catch { await refresh(); }
    finally { setStarting(false); }
  }
  const task = state.task;
  const blockers = plan?.issues.filter(i => i.blocking) ?? [];
  const changed = plan !== null && JSON.stringify(plan.sources) !== JSON.stringify(state.entries.map(e => e.path));
  const progress = task.totalBytes ? Math.min(100, Math.round(task.bytes / task.totalBytes * 100)) : 0;
  const preventWebDrop = (event: DragEvent<HTMLElement>) => { event.preventDefault(); if (!event.dataTransfer.files.length) setError('仅支持本地真实文件和文件夹，文本或网页链接不会加入清单。'); };
  if (!state.expanded) return <div className="compact" onMouseDown={e => drag.down(e)} onMouseMove={drag.move} onMouseUp={drag.end} onDragOver={e => e.preventDefault()} onDrop={preventWebDrop}>
    <div className="handle" title="按住悬浮框任意空白或图标拖动"><i /><i /><i /></div>
    <button className="orb" data-drag-click onClick={event => { if (event.detail === 0 || !drag.wasDragged()) run('set_expanded', { expanded: true }); }} aria-label="展开收集面板" title={error || state.message || (state.shortcutStatus !== '快捷键已注册' ? state.shortcutStatus : '点击展开 · 按住拖动 · 拖入收集')}><span>GP</span><b>{state.entries.length}</b></button>
    <small role="status" title={error || state.message}>{error || (state.message ? state.message.split('\n')[0] : '拖入收集')}</small>
  </div>;
  return <main onDragOver={e => e.preventDefault()} onDrop={preventWebDrop}>
    <header onMouseDown={e => drag.down(e, true)} title="按住标题栏空白区域拖动"><span className="logo">GP</span><div className="brand"><h1>GatherPack</h1><p>把分散的文件收集到一起，一次打包带走。</p></div>
      <button aria-label="设置" onClick={() => setSettings({ ...state.settings })}>设置</button>
      <button aria-label="收起面板" onClick={() => run('set_expanded', { expanded: false })}>收起</button>
      <div className="menu-wrap"><button aria-label="应用菜单" aria-expanded={menu} onClick={() => setMenu(!menu)}>···</button>{menu && <div className="menu"><button disabled={!state.trayAvailable} onClick={() => { setMenu(false); run('hide_window'); }}>隐藏收集栏</button><button onClick={() => run('exit_app')}>退出 GatherPack</button></div>}</div>
    </header>
    {!desktop && <p className="message">这是浏览器界面预览。系统拖拽、快捷键、收集和打包请在桌面程序中使用。</p>}
    <section className="drop-area"><div className="drop-symbol">＋</div><div><h2>拖入文件或整个文件夹</h2><p>从不同目录继续收集，源文件保留原处</p></div><div className="add-actions"><button onClick={() => run('pick_entries', { directories: false })}>添加文件</button><button onClick={() => run('pick_entries', { directories: true })}>添加文件夹</button></div></section>
    <div className="shortcut"><kbd>{state.settings.shortcut.replaceAll('Control', 'Ctrl').replaceAll('Command', '⌘')}</kbd><span>{state.shortcutStatus === '快捷键已注册' ? state.shortcutLastTriggered ? `最近触发 ${new Date(state.shortcutLastTriggered).toLocaleTimeString()} · 在文件管理器中选中后收集` : '在文件管理器中选中后直接收集' : state.shortcutStatus}</span><button className="shortcut-retry" disabled={!desktop} onClick={() => run('retry_shortcut')}>重新注册</button><span title={state.shortcutStatus} className="status-dot" data-ok={state.shortcutStatus === '快捷键已注册'} /></div>
    {error && <p role="alert" className="error">{error}<button aria-label="关闭错误提示" onClick={() => setError('')}>×</button></p>}
    {state.message && <p role="status" className="message">{state.message}</p>}
    <div className="stats"><div><strong>{state.entries.length}</strong><span>顶层项目</span></div><div><strong>{scanning ? '计算中…' : plan?.files ?? '—'}</strong><span>递归文件</span></div><div><strong>{scanning ? '计算中…' : plan ? size(plan.totalBytes) : '—'}</strong><span>可读取总大小</span></div></div>
    {task.running && <section className="task" role="status"><div><strong>{task.phase}</strong><span>{size(task.bytes)} / {size(task.totalBytes)}</span><button onClick={() => run('cancel_pack')}>取消任务</button></div><progress max={100} value={progress} /><small>公共清单可继续操作，变更用于下次任务。</small></section>}
    <nav aria-label="内容视图">{([['collection', '收集清单'], ['graph', '文件关系图'], ['preview', '目录与问题'], ['report', '结果报告']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}{key === 'preview' && blockers.length > 0 && <b className="count">{blockers.length}</b>}</button>)}</nav>
    <section className="content">
      {tab === 'graph' && (scanning || changed ? <p className="empty">正在更新文件关系图…</p> : plan && state.entries.length ? <FileGraph key={signature} plan={plan} reveal={path => run('reveal', { path })} /> : <div className="empty"><span>⌘</span><h2>先收集，再看全貌</h2><p>添加文件或文件夹后，在这里查看可展开的文件关系图。</p></div>)}
      {tab === 'collection' && <><div className="section-heading"><p>仅记录路径，打包时读取当前内容</p><button disabled={!state.entries.length} onClick={() => run('clear_entries')}>清空清单</button></div>{!state.entries.length ? <div className="empty"><span>▤</span><h2>从第一份文件开始</h2><p>拖入，或在文件管理器中选中后按收集快捷键。</p></div> : <ul>{state.entries.map(entry => <li key={entry.path}><span className="file-icon">{entry.isDirectory ? '▣' : '▤'}</span><div className="file-info"><strong>{entry.name}</strong><span title={entry.path}>{entry.path}</span><small className={entry.status !== '可用' ? 'warning' : ''}>{entry.isDirectory ? '文件夹 · ' + (scanning ? '计算中…' : plan ? size(folderBytes(entry.path, plan)) : '待扫描') + ' · 包含隐藏内容' : entry.size === null ? '未知大小' : size(entry.size)} · {entry.status}</small></div><button onClick={() => run('reveal', { path: entry.path })}>定位</button><button aria-label={'移除 ' + entry.name} onClick={() => run('remove_entry', { path: entry.path })}>移除</button></li>)}</ul>}</>}
      {tab === 'preview' && <><div className="section-heading"><p>只读预览 · 保留目录结构及空文件夹</p><button disabled={scanning} onClick={() => void refresh()}>{scanning ? '扫描中…' : '重新检查'}</button></div>{plan && <><p className="hint">{plan.files} 个文件 · {plan.emptyDirectories} 个空目录 · {plan.renames.length} 处改名</p>{plan.issues.length > 0 && <div className="issues"><h3>打包前问题检查</h3>{plan.issues.map((issue, i) => <div className="issue" key={i}><strong>{issue.blocking ? '需处理' : '已去重'} · {issue.message}</strong><span>{issue.source}</span><button onClick={() => run('reveal', { path: issue.source })}>定位来源</button></div>)}</div>}{plan.renames.length > 0 && <details><summary>查看重命名映射 ({plan.renames.length})</summary>{plan.renames.map((r, i) => <p className="mapping" key={i}>{r.source}<br />→ {r.destination}</p>)}</details>}<div className="tree" aria-label="压缩包目录树">{plan.entries.slice(0, visible).map(entry => <div key={entry.destination} style={{ paddingLeft: 12 + 16 * (entry.destination.split('/').length - 1) }} title={entry.source}><span>{entry.directory ? '▣' : '▤'}</span>{entry.destination.split('/').pop()}{!entry.directory && <small>{size(entry.size)}</small>}</div>)}</div>{plan.entries.length > visible && <button onClick={() => setVisible(v => v + 300)}>继续显示（剩余 {plan.entries.length - visible} 项）</button>}{!plan.entries.length && <p className="empty">没有可打包内容。</p>}</>}{!plan && <p className="empty">{scanning ? '正在扫描文件和权限…' : '请先添加文件。'}</p>}</>}
      {tab === 'report' && <ReportView report={task.report} reveal={path => run('reveal', { path })} />}
    </section>
    <footer><div><strong>准备好一起带走？</strong><span>默认 {formats.find(f => f.value === state.settings.format)?.label} · 成功后保留清单</span></div><button className="primary" disabled={!desktop || !state.entries.length || task.running || starting} onClick={() => void openPack()}>检查并打包 →</button></footer>
    {settings && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-label="应用设置"><h2>应用设置</h2><label>默认压缩格式<FormatSelect value={settings.format} change={format => setSettings({ ...settings, format })} /></label><label>全局收集快捷键<input value={settings.shortcut} onChange={e => setSettings({ ...settings, shortcut: e.target.value })} /></label><p className="hint">例如 Control+Alt+Shift+E；冲突时保留原快捷键。</p><label className="checkbox"><input type="checkbox" checked={settings.autostart} onChange={e => setSettings({ ...settings, autostart: e.target.checked })} />开机启动</label><p className="hint">{state.platform} · {state.shortcutStatus}</p>{error && <p className="error">{error}</p>}<div className="dialog-actions"><button onClick={() => setSettings(null)}>取消</button><button className="primary" onClick={() => { void act('save_settings', { format: settings.format, shortcut: settings.shortcut, autostart: settings.autostart }).then(() => setSettings(null)).catch(() => {}); }}>保存设置</button></div></section></div>}
    {packDialog && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-label="确认打包"><h2>确认本次打包</h2><p>当前预览：{plan?.files ?? 0} 个文件，{size(plan?.totalBytes ?? 0)}。开始前再次检查来源。</p><label>本次格式（不修改默认设置）<FormatSelect value={format} change={value => { setFormat(value); setOutput(''); }} /></label><div className="output-field"><label htmlFor="output-path">保存到</label><div className="output"><input id="output-path" aria-label="输出路径" value={output} readOnly placeholder="选择保存位置和包名" /><button aria-label="选择保存位置" disabled={starting} onClick={() => void choose()}>选择…</button></div></div>{blockers.length > 0 && <label className="checkbox warning"><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />明确跳过目录与问题页列出的 {blockers.length} 项问题，其余内容继续打包</label>}<details><summary>本次问题明细 ({plan?.issues.length ?? 0})</summary>{plan?.issues.map((issue, i) => <p className="mapping" key={i}>{issue.source}<br />{issue.message}</p>)}</details><p className="hint">已有同名包不会被覆盖。文件夹按整项管理，普通隐藏内容一并包含。</p>{error && <p role="alert" className="error">{error}</p>}{task.running && <><p>{task.phase} · {progress}%</p><progress max={100} value={progress} /><button onClick={() => run('cancel_pack')}>取消任务</button></>}<div className="dialog-actions"><button onClick={() => setPackDialog(false)}>{task.running ? '后台运行' : '返回查看预览'}</button><button className="primary" disabled={starting || task.running || scanning || changed || !plan?.entries.length || !output || (blockers.length > 0 && !skip)} onClick={() => void start()}>{starting ? '处理中…' : '开始打包'}</button></div></section></div>}
  </main>;
}
function ReportView({ report, reveal }: { report: Report | null; reveal: (path: string) => void }) {
  if (!report) return <p className="empty">打包完成、失败或取消后，这里会显示本机结果报告。</p>;
  return <div className="report"><h2 className={report.delivered ? '' : 'warning'}>{report.delivered ? '压缩包已生成' : report.status === 'cancelled' ? '任务已取消 · 未交付' : '任务失败 · 未交付'}</h2><p>{report.delivered ? '文件写入完成，源文件和收集清单已保留。' : '下列写入数仅表示临时写入，不代表已交付。'}</p><div className="report-counts"><span>写入 <b>{report.written.length}</b></span><span>跳过 <b>{report.skipped.length}</b></span><span>失败 <b>{report.failed.length}</b></span><span>未执行 <b>{report.pending.length}</b></span></div><p>空目录：{report.emptyDirectories}</p>{report.error && <p className="error">{report.error}</p>}<p className="mapping">{report.output}</p>{report.delivered && <button onClick={() => reveal(report.output)}>打开输出所在目录</button>}{([['写入明细', report.written], ['跳过明细', report.skipped], ['失败明细', report.failed], ['未执行明细', report.pending]] as const).map(([label, paths]) => <details key={label}><summary>{label} ({paths.length})</summary>{paths.map((p, i) => <p className="mapping" key={i}>{p}</p>)}</details>)}<details><summary>问题明细 ({report.issues?.length ?? 0})</summary>{report.issues?.map((issue, i) => <p className="mapping" key={i}>{issue.source}<br />{issue.message}</p>)}</details><details><summary>重命名映射 ({report.renames.length})</summary>{report.renames.map((r, i) => <p className="mapping" key={i}>{r.source}<br />→ {r.destination}</p>)}</details><p className="hint">报告保留在本机应用数据目录，不写入共享压缩包。</p></div>;
}
createRoot(document.getElementById('root')!).render(<App />);


