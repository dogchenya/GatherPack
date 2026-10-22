import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.platform, 'linux', 'This startup test uses isolated Linux XDG directories');
execFileSync('xdotool', ['--version'], {stdio: 'ignore'});
const executable = resolve(process.argv[2]);
await mkdir('artifacts/validation', { recursive: true });
const root = await mkdtemp(resolve('artifacts/validation/migration-'));
const data = join(root, 'data');
const legacy = join(data, 'io.github.easy-pack.prototype');
const current = join(data, 'io.github.dogchenya.gatherpack');
const bridge = join(data, 'nautilus-python/extensions/gatherpack_selection.py');
const systemBridge = '/usr/share/nautilus-python/extensions/gatherpack_selection.py';
const bridgeSource = await readFile('src-tauri/scripts/gatherpack_selection.py', 'utf8');
let systemBridgeReady = false;
try { systemBridgeReady = await readFile(systemBridge, 'utf8') === bridgeSource; } catch (error) { if (error.code !== 'ENOENT') throw error; }
const source = join(root, 'source.txt');
await mkdir(join(legacy, 'reports'), { recursive: true });
await mkdir(join(root, 'config'), { recursive: true });
await writeFile(source, 'source bytes are preserved');
const state = JSON.stringify({ paths: [source], settings: { format: 'SevenZip', shortcut: 'Control+Alt+Shift+G', lastDirectory: root, autostart: false } });
const report = JSON.stringify({ status: 'success', output: join(root, 'old.zip'), written: [source], skipped: [], failed: [], pending: [], emptyDirectories: 0, renames: [], error: null, delivered: true, issues: [] });
await writeFile(join(legacy, 'state.json'), state);
await writeFile(join(legacy, 'last-report.json'), report);
await writeFile(join(legacy, 'reports/old.json'), report);
async function startAndInspect(inspect) {
  let stderr = '';
  const child = spawn(executable, [], { env: { ...process.env, XDG_DATA_HOME: data, XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache') }, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
  const exited = new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  try {
    let ready = false, readinessError = '';
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('Ordinary startup exited early: ' + stderr);
      try {
        await access(join(current, 'state.json'));
        if (!systemBridgeReady) assert.equal(await readFile(bridge, 'utf8'), bridgeSource);
        // frontend_ready shows this window after normal setup has completed.
        // Debian installs the bridge system-wide, so a user bridge is optional.
        assert.ok(execFileSync('xdotool', ['search', '--onlyvisible', '--name', '^GatherPack · 文件收集与打包$'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
        ready = true; break;
      } catch (error) { readinessError = String(error); await delay(100); }
    }
    assert.ok(ready, 'Ordinary startup must load its profile, prepare a bridge and show its window: ' + readinessError + '\n' + stderr);
    await inspect();
  } finally {
    // AppImage may launch the real executable as a descendant of its wrapper.
    const stop = signal => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    stop('SIGTERM');
    const timer = setTimeout(() => stop('SIGKILL'), 5000);
    timer.unref();
    try { await exited; } finally { clearTimeout(timer); stop('SIGKILL'); child.stderr.destroy(); }
  }
}
await startAndInspect(async () => {
  assert.equal(await readFile(join(current, 'state.json'), 'utf8'), state);
  assert.equal(await readFile(join(current, 'last-report.json'), 'utf8'), report);
  assert.equal(await readFile(join(current, 'reports/old.json'), 'utf8'), report);
});
const updated = JSON.stringify({ paths: [], settings: { format: 'TarGz', shortcut: 'Control+Alt+Shift+E', lastDirectory: root, autostart: false } });
await writeFile(join(current, 'state.json'), updated);
await writeFile(join(current, 'reports/old.json'), 'newer report');
if (!systemBridgeReady) await unlink(bridge);
await startAndInspect(async () => {
  assert.equal(await readFile(join(current, 'state.json'), 'utf8'), updated);
  assert.equal(await readFile(join(current, 'reports/old.json'), 'utf8'), 'newer report');
});
assert.equal(await readFile(join(legacy, 'state.json'), 'utf8'), state);
assert.equal(await readFile(join(legacy, 'last-report.json'), 'utf8'), report);
assert.equal(await readFile(source, 'utf8'), 'source bytes are preserved');
const result = { passed: true, executableSHA256: createHash('sha256').update(await readFile(executable)).digest('hex'), checks: ['Ordinary startup imports legacy collection, settings and reports through the real Tauri data path', 'Ordinary restart preserves existing new state and report records', 'Legacy records and source bytes remain unchanged'] };
await writeFile('artifacts/validation/profile-migration-report.json', JSON.stringify(result, null, 2) + '\n');
console.log('Ordinary application startup migration: all 3 checks passed.');
