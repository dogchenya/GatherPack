import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';

const root = resolve(process.argv[2] ?? '');
const commit = process.argv[3];
assert.match(commit ?? '', /^[a-f0-9]{40}$/);
const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const hash = async path => { const value = createHash('sha256'); for await (const chunk of createReadStream(path)) value.update(chunk); return value.digest('hex'); };
const base = await read(join(root, 'ci-verification.json'));
assert.equal(base.passed, true); assert.equal(base.commit, commit);
const build = await read(join(root, 'build-run.json'));
assert.equal(build.headSha, commit); assert.equal(build.conclusion, 'success');
const linux = base.results.find(result => result.target === 'x86_64-unknown-linux-gnu');
const artifact = extension => { const file = linux.artifacts.find(file => file.name.endsWith(extension)); assert.ok(file); return file; };
const binarySHA256 = await hash(join(root, 'extracted-deb/usr/bin/gatherpack'));
const requiredDesktop = ['file graph exploration preserves the collection and pack settings', 'native WebView exposes one accessible 文件夹：selected-folder button', 'native WebView exposes one accessible 文件：.hidden button', 'expanded panel moves from its broad sticky header', 'dragging the whole compact icon moves the native window', 'dragging compact icon does not expand panel', 'clicking the compact icon reopens the collection panel', 're-register button restores actual foreground collection hotkey'];
const requiredRecovery = ['fresh Nautilus starts before the user bridge exists', 'first installation explains that the running Nautilus must load its new bridge', 'actual hotkey recovers after the new bridge loads without restarting the app', 'shortcut conflict with another running instance is visible', 'saving the unchanged shortcut restores real collection after conflict removal', 'explicit re-registration preserves actual foreground collection', 'Caps Lock is actually enabled during the shortcut test', 'real collection shortcut works with Caps Lock enabled', 'recovery preserves original source bytes'];
function passed(report, minimum, required = []) {
  assert.equal(report.passed, true); assert.ok(report.checks.length >= minimum);
  assert.ok(report.checks.every(check => check.passed));
  for (const name of required) assert.ok(report.checks.some(check => check.name === name && check.passed), name);
}
async function nativeReports(directory) {
  const paths = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await nativeReports(path));
    else if (/^native-(core|restore)\.json$/.test(entry.name)) paths.push(path);
  }
  return paths;
}
const systems = [];
for (const [version, local] of [['22.04', 'jammy-installed'], ['24.04', 'linux-installed']]) {
  const ci = join(root, 'ubuntu-' + version), desktop = join(root, local);
  const glibc = await read(join(ci, 'glibc-installed.json'));
  assert.equal(glibc.passed, true); assert.equal(glibc.maximumAllowedGLIBC, '2.35'); assert.deepEqual(glibc.failures, []);
  assert.ok(!(await readFile(join(ci, 'ldd-installed.txt'), 'utf8')).includes('not found'));
  const migration = await read(join(ci, 'profile-migration-report.json'));
  assert.equal(migration.passed, true); assert.equal(migration.checks.length, 3); assert.equal(migration.executableSHA256, binarySHA256);
  const native = await nativeReports(ci); assert.equal(native.length, 2);
  for (const path of native) { const report = await read(path); passed(report, basename(path) === 'native-core.json' ? 22 : 5); assert.equal(report.nativeVerification.passed, true); }
  const gui = {};
  for (const [kind, extension] of [['deb', '.deb'], ['appimage', '.AppImage']]) {
    const report = await read(join(desktop, `linux-${kind}-gui-report.json`));
    passed(report, 91, requiredDesktop);
    assert.equal(kind === 'deb' ? report.packageSHA256 : report.executableSHA256, artifact(extension).sha256);
    gui[kind] = report;
  }
  const startup = await read(join(desktop, 'profile-migration-report.json'));
  assert.equal(startup.passed, true); assert.equal(startup.checks.length, 3); assert.equal(startup.executableSHA256, artifact('.AppImage').sha256);
  const recovery = await read(join(desktop, 'shortcut-recovery-report.json'));
  passed(recovery, 18, requiredRecovery); assert.equal(recovery.executableSHA256, artifact('.AppImage').sha256);
  const source = await read(join(desktop, 'source-archive-report.json')); assert.equal(source.passed, true);
  systems.push({ubuntu: version, installedExecutableSHA256: binarySHA256, glibc, nativeAssertions: 27, installedStartupMigration: migration, desktop: gui, appImageStartupMigration: startup, shortcutRecovery: recovery, correspondingSource: source});
}
const appImageGLIBC = await read(join(root, 'native-x86_64-unknown-linux-gnu/glibc-appimage.json'));
assert.equal(appImageGLIBC.passed, true); assert.deepEqual(appImageGLIBC.failures, []);
const summary = {...base, supportedUbuntuVersions: ['22.04', '24.04'], glibcLimit: '2.35', appImageELFFilesChecked: appImageGLIBC.checkedELFFiles, ubuntuRuntimeChecks: systems, windowsInstalled: await read(join(root, 'windows-installed-report.json')), macOSPackages: await Promise.all(['aarch64-apple-darwin', 'x86_64-apple-darwin'].map(target => read(join(root, 'installed-' + target, 'macos-install-' + target + '.json')))), limitations: ['Linux desktop results apply to isolated GNOME/X11 sessions; Wayland remains unverified', 'Full Windows Explorer/macOS Finder desktop acceptance remains unverified']};
await writeFile(join(root, 'ubuntu-verification.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('Same Debian and AppImage bytes verified on Ubuntu 22.04/24.04: 91 desktop assertions per format, 18 shortcut recovery assertions per system, ABI, startup migration and source checks.');
