import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const [directory, target, commit] = process.argv.slice(2);
assert.match(target ?? '', /^[a-z0-9_-]+$/);
assert.match(commit ?? '', /^[a-f0-9]{40}$/);
const root = resolve(directory);
const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const provenance = await read(target + '-provenance.json');
assert.equal(provenance.commit, commit);
assert.equal(provenance.target, target);
assert.equal(provenance.dirty, false);
assert.equal(provenance.version, JSON.parse(await readFile('package.json', 'utf8')).version);
const audit = await read('license-audit.json');
assert.deepEqual(audit.missingLicenseText, []);
async function hash(name) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(join(root, name))) digest.update(bytes);
  return digest.digest('hex');
}
assert.equal(await hash(audit.rustStandardLibrary.file), audit.rustStandardLibrary.sha256);
const names = [];
for (const line of (await readFile(join(root, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line.trim());
  assert.ok(match, 'Invalid checksum record');
  const [, expected, name] = match;
  assert.equal(basename(name), name);
  assert.ok(!name.includes('\\') && name.startsWith(`gatherpack-${provenance.version}-${target}-`));
  assert.ok(!names.includes(name), 'Duplicate checksum record');
  assert.equal(await hash(name), expected, 'Download bytes changed: ' + name);
  names.push(name);
}
const payloads = (await readdir(root)).filter(name => /\.(exe|dmg|deb|AppImage|tar)$/.test(name));
assert.deepEqual([...names].sort(), payloads.sort());
const extensions = target === 'x86_64-unknown-linux-gnu' ? ['.deb', '.AppImage', '-corresponding-source.tar'] : [target.includes('windows') ? '.exe' : '.dmg'];
assert.equal(names.length, extensions.length);
for (const extension of extensions) assert.equal(names.filter(name => name.endsWith(extension)).length, 1);
console.log(`Verified ${names.length} unchanged download file(s), provenance and licenses for ${target}.`);
