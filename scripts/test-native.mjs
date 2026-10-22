import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const executable = resolve(process.argv[2] ?? ('target/release/easy-pack' + (process.platform === 'win32' ? '.exe' : '')));
await mkdir('artifacts/validation', { recursive: true });
const root = await mkdtemp(resolve('artifacts/validation/native-'));
for (const scenario of ['core', 'restore']) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--validation-dir=' + root, '--validation-scenario=' + scenario], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.resume(); child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-8000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Native validation timeout: ' + scenario + '\n' + stderr)); }, 120000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); if (code !== 0) console.error(stderr); resolve(code); });
  });
  const report = JSON.parse(await readFile(join(root, 'native-' + scenario + '.json'), 'utf8').catch(() => '{}'));
  assert.equal(code, 0, JSON.stringify(report));
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.nativeVerification.passed, true);
  console.log('Native IPC ' + scenario + ': ' + report.checks.length + ' assertions passed; source protection, formats, cleanup and persisted disk records verified.');
}
console.log('Evidence directory: ' + root);
