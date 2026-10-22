import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
const commit = process.argv[3];
assert.match(commit ?? '', /^[a-f0-9]{40}$/);
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const audit = JSON.parse(await readFile('docs/license-audit.json', 'utf8'));
const results = [];
async function hash(path) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
}
async function reports(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await reports(path));
    else if (/^native-(core|restore)\.json$/.test(entry.name)) files.push(path);
  }
  return files;
}
for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu']) {
  const directory = join(root, target);
  const provenance = JSON.parse(await readFile(join(directory, target + '-provenance.json'), 'utf8'));
  assert.equal(provenance.commit, commit);
  assert.equal(provenance.version, version);
  assert.equal(provenance.target, target);
  assert.ok(provenance.rust.includes('host: ' + target + '\n'), 'Validation must run on the matching native host');
  const license = JSON.parse(await readFile(join(directory, 'license-audit.json'), 'utf8'));
  assert.deepEqual(license.missingLicenseText, []);
  assert.equal(await hash(join(directory, audit.rustStandardLibrary.file)), audit.rustStandardLibrary.sha256);
  const artifacts = [];
  for (const line of (await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line.trim());
    assert.ok(match);
    const [, expected, name] = match;
    assert.equal(basename(name), name);
    assert.ok(name.includes(version) && name.includes(target));
    assert.equal(await hash(join(directory, name)), expected);
    artifacts.push({ name, sha256: expected });
  }
  assert.ok(artifacts.length > 0);
  if (target.includes('apple-darwin')) {
    const installation = JSON.parse(await readFile(join(root, 'installed-' + target, 'macos-install-' + target + '.json'), 'utf8'));
    assert.equal(installation.passed, true);
    assert.equal(installation.commit, commit);
    assert.equal(installation.target, target);
  } else if (target.includes('windows')) {
    const installation = JSON.parse((await readFile(join(root, 'windows-installed-report.json'), 'utf8')).replace(/^\uFEFF/, ''));
    assert.equal(installation.passed, true);
    assert.ok(artifacts.some(file => file.name.endsWith('.exe') && file.sha256 === installation.installerSHA256));
  } else {
    for (const [kind, extension] of [['deb', '.deb'], ['appimage', '.AppImage']]) {
      const gui = JSON.parse(await readFile(join(root, 'linux-installed', 'linux-' + kind + '-gui-report.json'), 'utf8'));
      assert.equal(gui.passed, true);
      assert.ok(gui.checks.length >= 70);
      assert.ok(gui.checks.every(check => check.passed));
      for (const name of ['file graph exploration preserves the collection and pack settings', 'expanded panel moves from its broad sticky header', 'dragging compact icon does not expand panel', 're-register button restores actual foreground collection hotkey']) assert.ok(gui.checks.some(check => check.name === name && check.passed), name);
      const testedSHA = kind === 'deb' ? gui.packageSHA256 : gui.executableSHA256;
      assert.ok(artifacts.some(file => file.name.endsWith(extension) && file.sha256 === testedSHA));
    }
    const source = JSON.parse(await readFile(join(root, 'linux-installed', 'source-archive-report.json'), 'utf8'));
    assert.equal(source.passed, true);
    const migration = JSON.parse(await readFile(join(root, 'linux-installed', 'profile-migration-report.json'), 'utf8'));
    assert.equal(migration.passed, true);
    assert.equal(migration.checks.length, 3);
    assert.ok(artifacts.some(file => file.name.endsWith('.AppImage') && file.sha256 === migration.executableSHA256));
    const shortcuts = JSON.parse(await readFile(join(root, 'linux-installed', 'shortcut-recovery-report.json'), 'utf8'));
    assert.equal(shortcuts.passed, true); assert.ok(shortcuts.checks.every(check => check.passed));
    assert.ok(artifacts.some(file => file.name.endsWith('.AppImage') && file.sha256 === shortcuts.executableSHA256));
  }
  const validation = await reports(join(root, 'native-' + target));
  assert.equal(validation.length, 2);
  let assertions = 0;
  for (const path of validation) {
    const report = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(report.passed, true);
    assert.equal(report.nativeVerification.passed, true);
    assert.ok(report.checks.every(check => check.passed));
    assert.equal(report.checks.length, basename(path) === 'native-core.json' ? 22 : 5);
    assertions += report.checks.length;
  }
  results.push({ target, run: provenance.run, nativeAssertions: assertions, artifacts });
}
await writeFile(join(root, 'ci-verification.json'), JSON.stringify({ passed: true, version, commit, results }, null, 2) + '\n');
console.log('Verified all four native targets: installer/source hashes, commit provenance, licenses and 27 IPC assertions each.');
