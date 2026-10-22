import { readdir, mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

const target = process.argv[2];
if (!target || !/^[a-z0-9_-]+$/i.test(target)) throw new Error('Pass a Rust target triple');
const root = process.argv[3] ? resolve(process.argv[3]) : resolve('target', target, 'release', 'bundle');
const out = resolve('artifacts', target);
await mkdir(out, { recursive: true });
const checksums = [];
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
let commit = process.env.GITHUB_SHA ?? null;
if (!commit) { try { commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { commit = 'uncommitted'; } }
await writeFile(join(out, `${target}-provenance.json`), JSON.stringify({ version, commit, target, rust: execFileSync('rustc', ['-vV'], { encoding: 'utf8' }), run: process.env.GITHUB_RUN_ID ?? null }, null, 2));
for (const name of ['LICENSE', 'docs/THIRD_PARTY_NOTICES.md', 'docs/third-party.md', 'docs/license-audit.json', 'docs/installer-notices/Rust-COPYRIGHT-library.html']) {
  await copyFile(name, join(out, name.split('/').pop()));
}
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/\.(exe|dmg|deb|AppImage)$/.test(item.name)) {
      if (!item.name.includes(version)) continue;
      const artifactName = `easy_pack-${version}-${target}-${item.name}`;
      await copyFile(path, join(out, artifactName));
      const checksum = await hashFile(path);
      checksums.push(`${checksum}  ${artifactName}`);
    }
  }
}
await walk(root);
if (!checksums.length) throw new Error(`No installers under ${root}`);
const installers = checksums.length;
for (const item of await readdir(out)) {
  if (item.includes(version) && item.endsWith('-corresponding-source.tar')) {
    checksums.push(`${await hashFile(join(out, item))}  ${item}`);
  }
}
await writeFile(join(out, 'SHA256SUMS.txt'), `${checksums.sort().join('\n')}\n`);
console.log(`${installers} installer(s) and ${checksums.length - installers} corresponding-source archive(s) collected for ${target}`);
