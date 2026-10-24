import assert from 'node:assert/strict';
import {readdir, readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename, join} from 'node:path';
const [root, output] = process.argv.slice(2);
assert.ok(root && output && /^[a-f0-9]{40}$/.test(process.env.BUILD_COMMIT || ''));
const files = [];
async function walk(dir) { for (const item of await readdir(dir, {withFileTypes: true})) { const path = join(dir, item.name); if (item.isDirectory()) await walk(path); else files.push(path); } }
await walk(root); await mkdir(output, {recursive: true});
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const targets = ['x86_64-pc-windows-msvc', 'aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu'];
let version, windowsInstallerEvidence;
for (const target of targets) {
  const matches = files.filter(path => basename(path) === target + '-provenance.json');
  assert.equal(matches.length, 1);
  const provenance = await json(matches[0]);
  assert.equal(provenance.commit, process.env.BUILD_COMMIT); assert.equal(provenance.dirty, false);
  assert.equal(provenance.target, target); assert.equal(String(provenance.run), process.env.BUILD_RUN_ID);
  version ??= provenance.version; assert.equal(provenance.version, version);
  await copyFile(matches[0], join(output, basename(matches[0])));
  if (target.endsWith('apple-darwin')) {
    const evidence = files.filter(path => basename(path) === 'macos-install-' + target + '.json');
    assert.equal(evidence.length, 1);
    const report = await json(evidence[0]); assert.equal(report.passed, true); assert.equal(report.commit, process.env.BUILD_COMMIT); assert.equal(report.target, target);
    await copyFile(evidence[0], join(output, basename(evidence[0])));
  }
}
assert.match(version, /^\d+\.\d+\.\d+(?:-alpha\.\d+)?$/);
if (!version.includes('-')) {
  const evidence = files.filter(path => path.includes('native-validation-x86_64-pc-windows-msvc') && basename(path) === 'windows-installer-report.json');
  assert.equal(evidence.length, 1, 'stable release requires Windows desktop evidence');
  const report = await json(evidence[0]);
  windowsInstallerEvidence = report;
  assert.equal(report.passed, true); assert.equal(report.desktopValidation.commit, process.env.BUILD_COMMIT);
  assert.equal(report.desktopValidation.passed, true);
  assert.equal(report.desktopValidation.checks.length, 26); assert.ok(report.desktopValidation.checks.every(c => c.passed));
  await copyFile(evidence[0], join(output, 'windows-installer-validation.json'));
}
const hashes = new Map();
for (const path of files.filter(p => basename(p) === 'SHA256SUMS.txt')) {
  for (const line of (await readFile(path, 'utf8')).trim().split('\n')) {
    const match = /^([a-f0-9]{64})\s+([^/\\]+)$/.exec(line.trim()); assert.ok(match);
    assert.ok(!hashes.has(match[2]) || hashes.get(match[2]) === match[1]); hashes.set(match[2], match[1]);
  }
}
const packages = files.filter(path => /\.(exe|dmg|deb|AppImage)$/.test(path) || path.endsWith('-corresponding-source.tar'));
assert.equal(packages.length, 6); assert.equal(new Set(packages.map(path => basename(path))).size, 6);
for (const [extension, count] of [['.exe',1],['.dmg',2],['.deb',1],['.AppImage',1],['-corresponding-source.tar',1]]) assert.equal(packages.filter(path => path.endsWith(extension)).length, count);
const sums = [];
for (const path of packages) {
  const name = basename(path); assert.ok(name.includes('gatherpack-' + version + '-'));
  const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes);
  const actual = hash.digest('hex'); assert.equal(actual, hashes.get(name), 'Checksum mismatch: ' + name);
  if (name.endsWith('.exe') && windowsInstallerEvidence) assert.equal(actual, windowsInstallerEvidence.installerSHA256, 'Windows installed-test package differs from release payload');
  sums.push(actual + '  ' + name); await copyFile(path, join(output, name));
}
for (const name of ['LICENSE','THIRD_PARTY_NOTICES.md','third-party.md','license-audit.json','Rust-COPYRIGHT-library.html']) {
  const path = files.find(p => p.includes('gatherpack-linux-x64-checksums-and-licenses') && basename(p) === name); assert.ok(path);
  if (name === 'license-audit.json') assert.deepEqual((await json(path)).missingLicenseText, []);
  await copyFile(path, join(output, name));
}
await writeFile(join(output, 'SHA256SUMS.txt'), sums.sort().join('\n') + '\n');
await writeFile(join(output, 'release-tag.txt'), 'v' + version);
await writeFile(join(output, 'release-prerelease.txt'), String(version.includes('-')));
await writeFile(join(output, 'release-notes.md'), [
  '首个稳定版。悬浮图标和展开面板支持上下左右四边滑动隐藏，部分拖出屏幕也能识别；鼠标移开约 0.8 秒后缩为唤回条，悬停恢复。修正 Windows 额外白框、150% 缩放首次尺寸和已收起弹窗仍阻止隐藏的问题。文件画布支持移除文件、目录及子项并撤销，原文件保留原处。中英文 README 与下载入口同步更新。',
  '', 'Windows x64、macOS 14+ Apple Silicon / Intel、Linux x86_64。Ubuntu 22.04 / 24.04 安装验证通过。',
  '', '只需下载对应平台的 .exe / .dmg / .deb / .AppImage；Linux 对应源码和 SHA256 校验材料单独提供。升级前请退出旧版应用。',
  '', '安装包尚未签名，macOS 尚未公证。Linux 快捷键使用 GNOME/X11/Nautilus；提示桥接未加载时，打开“本地收集连接”检查实际连接，结束复制、移动后确认重连；仍失败可复制诊断。',
  '', '源码提交：' + process.env.BUILD_COMMIT,
  '', '[构建与 Ubuntu 安装验证](https://github.com/' + process.env.GH_REPO + '/actions/runs/' + process.env.BUILD_RUN_ID + ') · [macOS DMG 安装验证](https://github.com/' + process.env.GH_REPO + '/actions/runs/' + process.env.MACOS_RUN_ID + ')',
  '', '[界面与交互更新](https://github.com/' + process.env.GH_REPO + '/blob/master/docs/ui-redesign.md)',
].join('\n') + '\n');
console.log('Verified six packages/source archives, four targets and both delivered DMGs for ' + version);
