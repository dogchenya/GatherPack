import { invoke } from '@tauri-apps/api/core';

type Context = { root: string; scenario: string };
type Plan = { sources: string[]; files: number; entries: { destination: string }[]; issues: { blocking: boolean; source: string }[]; renames: { destination: string }[] };
type Report = { delivered: boolean; status: string; written: string[]; issues: { source: string }[] };
type Snapshot = { entries: { path: string; status: string }[]; settings: { format: string; shortcut: string; autostart: boolean; lastDirectory: string | null }; task: { running: boolean; phase: string; bytes: number; report: Report | null } };

/** Explicit CLI-only validation profile. Calls the real Rust IPC implementation. */
export async function runNativeValidation(context: Context) {
  const checks: { name: string; passed: boolean }[] = [];
  const check = (condition: unknown, name: string) => { checks.push({ name, passed: !!condition }); if (!condition) throw new Error(name); };
  const separator = context.root.includes(String.fromCharCode(92)) ? String.fromCharCode(92) : '/';
  const path = (...parts: string[]) => [context.root, ...parts].join(separator);
  const snap = () => invoke<Snapshot>('snapshot');
  const prepare = () => invoke<Plan>('prepare');
  const add = (...paths: string[]) => invoke('validation_add', { paths });
  async function reject(command: string, args: Record<string, unknown>, name: string) {
    let rejected = false; try { await invoke(command, args); } catch { rejected = true; } check(rejected, name);
  }
  async function waitFor(predicate: (s: Snapshot) => boolean) {
    for (let i = 0; i < 1000; i++) {
      const s = await snap(); if (predicate(s)) return s;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('native task did not reach expected state');
  }
  try {
    if (context.scenario === 'restore') {
      const restored = await snap();
      check(restored.entries.length === 2, 'real process restart restores collection');
      check(restored.entries.some(e => e.status !== '可用'), 'restart marks missing source unavailable');
      check(restored.settings.format === 'SevenZip', 'restart restores saved default format');
      check(restored.settings.lastDirectory === context.root, 'restart restores output directory');
      check(restored.task.report?.delivered, 'restart restores local result report');
    } else {
      check((await snap()).entries.length === 0, 'isolated profile starts empty');
      const a = path('fixtures', 'A', 'report.txt');
      const b = path('fixtures', 'B', 'report.txt');
      const bundle = path('fixtures', 'Bundle');
      const overlap = path('fixtures', 'Bundle', 'nested', 'file.txt');
      const next = path('fixtures', 'new.txt');
      const slow = path('fixtures', 'slow.bin');
      await add(a, b, bundle, overlap, a);
      check((await snap()).entries.length === 4, 'real collection de-duplicates repeated paths');
      await invoke('validation_relink', { path: b, replacement: next });
      check((await snap()).entries[1].path === next, 'relink replaces the reference in place through production implementation');
      await invoke('undo_collection');
      check((await snap()).entries[1].path === b && (await snap()).entries.length === 4, 'undo relink restores original reference without keeping the replacement');
      await reject('validation_relink', { path: b, replacement: a }, 'relink rejects an already collected source');
      await invoke('remove_entry', { path: b });
      await add(next);
      await invoke('undo_collection');
      check((await snap()).entries.length === 5, 'undo restores removed source while preserving subsequent collection');
      check((await snap()).entries[1].path === b, 'undo preserves original collection order and rename precedence');
      await invoke('remove_entry', { path: next });
      await invoke('clear_entries');
      await invoke('undo_collection');
      check((await snap()).entries.length === 4, 'clear undo restores collection references without changing source files');
      await invoke('set_pinned', { pinned: false });
      await invoke('set_pinned', { pinned: true });
      await invoke('set_panel_wide', { wide: true });
      await invoke('set_panel_wide', { wide: false });
      let plan = await prepare();
      check(plan.files === 4, 'recursive preview de-duplicates overlapping sources');
      check(plan.renames.some(r => r.destination === 'report (2).txt'), 'final rename map is exposed by real IPC');
      for (const [format, filename] of [['Zip', 'out.zip'], ['SevenZip', 'out.7z'], ['TarGz', 'out.tar.gz']]) {
        plan = await prepare();
        await invoke('start_pack', { output: path(filename), format, skipIssues: false, expectedPlan: plan });
        const report = (await snap()).task.report;
        check(report?.delivered && report.written.length === 4, 'real ' + format + ' archive delivered with expected file count');
      }
      const settings = (await snap()).settings;
      await invoke('save_settings', { ...settings, format: 'SevenZip' });
      check((await snap()).settings.format === 'SevenZip', 'default format is saved through production command');
      await add(slow);
      plan = await prepare();
      const running = invoke('start_pack', { output: path('frozen.zip'), format: 'Zip', skipIssues: false, expectedPlan: plan });
      await waitFor(s => s.task.running);
      await invoke('clear_entries');
      await add(next);
      const nextPlan = await prepare();
      await reject('start_pack', { output: path('second.zip'), format: 'Zip', skipIssues: false, expectedPlan: nextPlan }, 'second concurrent task rejected');
      await running;
      const frozen = await snap();
      check(frozen.task.report?.delivered && frozen.task.report.written.length === 5, 'in-flight native task keeps its frozen plan');
      check(frozen.entries.length === 1 && frozen.entries[0].path.endsWith('new.txt'), 'clear and add during native task affect next collection only');
      check(frozen.settings.format === 'SevenZip', 'temporary format override preserves global default');
      await invoke('clear_entries'); await add(slow); plan = await prepare();
      const cancelling = invoke('start_pack', { output: path('cancel.7z'), format: 'SevenZip', skipIssues: false, expectedPlan: plan });
      await waitFor(s => s.task.running && s.task.bytes > 0);
      await invoke('cancel_pack'); await cancelling;
      const cancelled = await snap();
      check(cancelled.task.report?.status === 'cancelled' && !cancelled.task.report.delivered, 'streaming native task cancellation is not reported as delivery');
      check(cancelled.entries.length === 1, 'cancel preserves public collection');
      plan = await prepare();
      await reject('start_pack', { output: path('out.zip'), format: 'Zip', skipIssues: false, expectedPlan: plan }, 'existing output cannot be overwritten');
      await invoke('clear_entries'); await add(bundle); plan = await prepare();
      await reject('start_pack', { output: path('fixtures', 'Bundle', 'blocked.zip'), format: 'Zip', skipIssues: false, expectedPlan: plan }, 'output inside a source folder is rejected');
      const stale = plan; await add(next);
      await reject('start_pack', { output: path('stale.zip'), format: 'Zip', skipIssues: false, expectedPlan: stale }, 'changed collection requires new confirmation');
      await invoke('clear_entries'); await add(next, a);
      await invoke('validation_remove_source', { path: next });
      check((await snap()).entries.some(e => e.status !== '可用'), 'missing source is reported by real filesystem inspection');
      plan = await prepare();
      check(plan.issues.some(i => i.blocking), 'missing source appears in preflight problem list');
      await reject('start_pack', { output: path('skipped.zip'), format: 'Zip', skipIssues: false, expectedPlan: plan }, 'unacknowledged blocking issue prevents native packing');
      plan = await prepare();
      await invoke('start_pack', { output: path('skipped.zip'), format: 'Zip', skipIssues: true, expectedPlan: plan });
      const skipped = await snap();
      check(skipped.task.report?.delivered && skipped.task.report.written.length === 1 && skipped.task.report.issues.length > 0, 'explicit skip delivers readable file and retains problem details');
      check(skipped.entries.length === 2, 'success keeps collection for reuse');
    }
    await invoke('validation_done', { result: { passed: true, scenario: context.scenario, checks } });
  } catch (error) {
    await invoke('validation_done', { result: { passed: false, scenario: context.scenario, error: String(error), checks } });
  }
}
