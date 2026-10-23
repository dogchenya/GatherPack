import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from './i18n';

type Diagnostic = {summary: string; details: string; connected: boolean; canRestart: boolean};
export function LinuxConnection() {
  const {t} = useI18n();
  const [report, setReport] = useState<Diagnostic | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function inspect(restartConfirmed: boolean) {
    setBusy(true); setError('');
    try { setReport(await invoke<Diagnostic>('linux_connection_diagnostics', {restartConfirmed})); setConfirm(false); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(report!.summary + '\n' + report!.details); }
    catch { setError(t('请选中下方诊断内容手动复制。')); }
  }
  return <section className="connection-card linux-connection" aria-label={t('Linux 连接修复')}>
    <strong>{t('Linux 连接修复')}</strong>
    <p>{t('检查当前文件管理器进程、扩展加载器和桌面会话。检查不会关闭窗口。')}</p>
    <button disabled={busy} onClick={() => void inspect(false)}>{t(busy ? '检查中…' : '检查文件管理器连接')}</button>
    {report && <><p role="status">{t(report.summary)}</p>{report.canRestart && !report.connected && <button disabled={busy} onClick={() => setConfirm(true)}>{t('重新连接文件管理器')}</button>}<button disabled={busy} onClick={() => void copy()}>{t('复制诊断信息')}</button><details><summary>{t('诊断详情')}</summary><textarea readOnly aria-label={t('诊断详情')} value={report.details} /></details></>}
    {confirm && <div role="group" aria-label={t('确认重连')}><p className="warning">{t('将关闭并重新打开文件管理器窗口，请先完成复制、移动等操作。不会删除原文件。')}</p><button disabled={busy} onClick={() => setConfirm(false)}>{t('取消')}</button><button className="primary" disabled={busy} onClick={() => void inspect(true)}>{t('已结束文件操作，继续重连')}</button></div>}
    {error && <p role="alert" className="error">{t(error)}</p>}
  </section>;
}
