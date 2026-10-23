import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {resolve, join, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';

const collector = resolve('scripts/collect-artifacts.mjs');
const fixture = await mkdtemp(join(tmpdir(), 'gatherpack-collector-'));
const version = '9.8.7-alpha.1';
const targets = {
  'x86_64-pc-windows-msvc': [`GatherPack_${version}_x64-setup.exe`],
  'aarch64-apple-darwin': [`GatherPack_${version}_aarch64.dmg`],
  'x86_64-apple-darwin': [`GatherPack_${version}_x64.dmg`],
  'x86_64-unknown-linux-gnu': [`GatherPack_${version}_amd64.deb`, `GatherPack_${version}_amd64.AppImage`],
};
const env = {...process.env, GITHUB_SHA:'1'.repeat(40), GITHUB_RUN_ID:'1'};
try {
  for (const [target, expected] of Object.entries(targets)) {
    const cwd = join(fixture, target);
    await mkdir(join(cwd, 'src-tauri'), {recursive:true});
    await mkdir(join(cwd, 'docs/installer-notices'), {recursive:true});
    const bundle = join(cwd, 'bundle');
    await mkdir(bundle);
    await writeFile(join(cwd, 'package.json'), JSON.stringify({version}));
    await writeFile(join(cwd, 'src-tauri/tauri.conf.json'), JSON.stringify({productName:'GatherPack'}));
    for (const name of ['LICENSE','docs/THIRD_PARTY_NOTICES.md','docs/third-party.md','docs/license-audit.json','docs/installer-notices/Rust-COPYRIGHT-library.html']) await writeFile(join(cwd,name),'fixture');
    for (const name of [...expected, `rw.12345.GatherPack_${version}_x64.dmg`, 'GatherPack_0.1.0-alpha.10_x64.dmg', `GatherPack_${version}_wrong-arch.dmg`]) await writeFile(join(bundle,name),name);
    execFileSync(process.execPath,[collector,target,bundle],{cwd,env,stdio:'pipe'});
    const out = join(cwd,'artifacts',target);
    const packages = (await readdir(out)).filter(name=>/\.(exe|dmg|deb|AppImage)$/.test(name));
    assert.deepEqual(packages.sort(), expected.map(name=>`gatherpack-${version}-${target}-${name}`).sort());
    const sums = await readFile(join(out,'SHA256SUMS.txt'),'utf8');
    assert.equal(sums.trim().split('\n').length,expected.length);
    assert.ok(!sums.includes('rw.12345'));
    await mkdir(join(bundle,'duplicate'));
    await writeFile(join(bundle,'duplicate',expected[0]),'conflicting final package');
    const duplicate = spawnSync(process.execPath,[collector,target,bundle],{cwd,env,encoding:'utf8'});
    assert.notEqual(duplicate.status,0);
    assert.match(duplicate.stderr,/Duplicate final installer/);
    await rm(join(bundle,'duplicate'),{recursive:true});
    await rm(join(bundle,expected[0]));
    const missing = spawnSync(process.execPath,[collector,target,bundle],{cwd,env,encoding:'utf8'});
    assert.notEqual(missing.status,0);
    assert.match(missing.stderr,/Missing final installers/);
  }
  console.log('Installer collection: final filenames only; temporary DMGs, old versions and other architectures excluded; missing and duplicate finals rejected.');
} finally {
  assert.equal(dirname(fixture),resolve(tmpdir()));
  assert.ok(basename(fixture).startsWith('gatherpack-collector-'));
  await rm(fixture,{recursive:true,force:true});
}
