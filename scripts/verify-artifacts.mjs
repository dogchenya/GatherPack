import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const validationRoot = resolve(process.env.GATHERPACK_VALIDATION_DIR ?? 'artifacts/validation');
const audit = JSON.parse(await readFile('docs/license-audit.json', 'utf8'));
assert.equal(audit.missingLicenseText.length, 0);
const checks = [];
for (const target of process.argv.slice(2)) {
  assert.match(target, /^[a-z0-9_-]+$/i);
  const root = resolve('artifacts', target);
  const provenance = JSON.parse(await readFile(resolve(root, target + '-provenance.json'), 'utf8'));
  assert.equal(provenance.version, version);
  assert.equal(provenance.target, target);
  const rustNotice = await readFile(resolve(root, audit.rustStandardLibrary.file));
  assert.equal(createHash('sha256').update(rustNotice).digest('hex'), audit.rustStandardLibrary.sha256);
  const lines = (await readFile(resolve(root, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line.trim());
    assert.ok(match, 'Invalid checksum record');
    const [, expected, name] = match;
    assert.ok(name.includes(version) && name.includes(target));
    const file = resolve(root, name);
    assert.ok(file.startsWith(root + sep), 'Artifact path escaped its directory');
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    assert.equal(hash.digest('hex'), expected, 'Checksum mismatch: ' + name);
    if (name.endsWith('.AppImage')) {
      const gui = JSON.parse(await readFile(resolve(validationRoot, 'linux/linux-appimage-gui-report.json'), 'utf8'));
      assert.ok(gui.passed && gui.checks.every(check => check.passed));
      assert.equal(gui.executableSHA256, expected, 'GUI test did not run this AppImage');
    }
    if (name.endsWith('.deb')) {
      const gui = JSON.parse(await readFile(resolve(validationRoot, 'linux/linux-deb-gui-report.json'), 'utf8'));
      assert.ok(gui.passed && gui.checks.every(check => check.passed));
      assert.equal(gui.packageSHA256, expected, 'GUI test did not run this deb package');
    }
    if (name.endsWith('.exe')) {
      const installation = JSON.parse((await readFile(resolve(validationRoot, 'windows-install-report.json'), 'utf8')).replace(/^\uFEFF/, ''));
      assert.ok(installation.passed);
      assert.equal(installation.installerSHA256, expected, 'Installation test did not run this installer');
    }
    checks.push({ target, file: name, sha256: expected, passed: true });
  }
}
await writeFile(resolve(validationRoot, 'release-checks.json'), JSON.stringify({ passed: true, version, licensePackages: audit.packages, checks }, null, 2) + '\n');
console.log('Verified', checks.length, 'release artifacts, provenance versions and license audit.');
