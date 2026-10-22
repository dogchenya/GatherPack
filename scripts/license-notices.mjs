import { readFile, readdir, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const cargo = process.env.CARGO ?? 'cargo';
const result = spawnSync(cargo, ['metadata', '--locked', '--offline', '--format-version', '1'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (result.status !== 0) throw new Error(result.stderr || 'cargo metadata failed');
const metadata = JSON.parse(result.stdout);
const sections = [];
const unresolved = [];
const canonicalTermsFallback = [];
const inheritedLicenseFiles = [];
const sources = [];
const rustStandardLibrary = { version: '1.98.1', file: 'Rust-COPYRIGHT-library.html', sha256: '68129500b616d5838629e68f55ff3aed5e096dacf60ce9eb41bbe599a563afa6', source: 'Original share/doc/rust/COPYRIGHT-library.html from the official Rust 1.98.1 toolchain; includes standard-library and third-party license texts.' };
if (createHash('sha256').update(await readFile('docs/installer-notices/' + rustStandardLibrary.file)).digest('hex') !== rustStandardLibrary.sha256) throw new Error('Rust standard-library notice provenance mismatch');
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
async function shippedTexts(directory, licenseFile) {
  const files = (await readdir(directory)).filter(n => /^(licen[cs]es?|copying|copyright|notice|third.?party.?notices?)([._-]|$)/i.test(n));
  if (licenseFile && !files.includes(licenseFile)) files.push(licenseFile);
  let text = '';
  for (const name of files.sort()) {
    try { text += '\n' + name + '\n\n' + await readFile(join(directory, name), 'utf8') + '\n'; }
    catch {
      try {
        for (const child of await readdir(join(directory, name))) {
          text += '\n' + name + '/' + child + '\n\n' + await readFile(join(directory, name, child), 'utf8') + '\n';
        }
      } catch { /* No readable license text in this entry. */ }
    }
  }
  return text;
}
async function copyrightLines(directory) {
  const lines = new Set();
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'target'].includes(entry.name)) continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) { await walk(child); continue; }
      if (!/\.(rs|c|h|cpp|js|ts|md|txt)$/i.test(entry.name)) continue;
      const text = await readFile(child, 'utf8');
      for (const match of text.matchAll(/^.*(?:Copyright|SPDX-FileCopyrightText).*$/gm)) {
        if (match[0].length < 2000) lines.add(match[0].trim());
      }
    }
  }
  await walk(directory);
  return [...lines].sort();
}
function preferredLicense(expression) {
  if (typeof expression !== 'string' || /\bAND\b|\bWITH\b/.test(expression)) return null;
  const alternatives = expression.replace(/[()]/g, '').split(/\s+OR\s+|\//).map(s => s.trim());
  return ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'MPL-2.0'].find(id => alternatives.includes(id)) ?? null;
}
async function notice(p, directory, inherited) {
  const key = p.name + '@' + p.version;
  let text = await shippedTexts(directory, p.license_file);
  let origin = 'files shipped in the locked dependency';
  if (!text && inherited) {
    text = await shippedTexts(inherited.directory, inherited.license_file);
    if (text) { origin = 'shared upstream package: ' + inherited.name + '@' + inherited.version; inheritedLicenseFiles.push({ package: key, inheritedFrom: inherited.name + '@' + inherited.version }); }
  }
  if (!text) {
    const id = preferredLicense(p.license);
    if (id) {
      const terms = await readFile('docs/license-terms/' + id + '.txt', 'utf8');
      const attribution = await copyrightLines(directory);
      text = 'Declared license expression: ' + p.license + '\nSelected permitted license: ' + id + '\n\nCanonical terms (template placeholders are retained; no copyright holder is invented):\n\n' + terms;
      if (attribution.length) text += '\nAttribution lines retained verbatim from packaged source:\n' + attribution.join('\n') + '\n';
      const source = 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/' + id + '.txt';
      canonicalTermsFallback.push({ package: key, selectedLicense: id, termsSource: source, attributionLines: attribution.length });
      origin = 'canonical SPDX terms for the upstream-declared license, with available source attribution';
      sources.push({ id, source, sha256: createHash('sha256').update(terms).digest('hex') });
    } else unresolved.push(key);
  }
  const sourceUrl = p.source?.startsWith('registry+') ? 'https://crates.io/api/v1/crates/' + p.name + '/' + p.version + '/download' : null;
  sections.push('## ' + p.name + ' ' + p.version + '\n\nLicense expression: ' + (typeof p.license === 'object' ? JSON.stringify(p.license) : p.license || 'See supplied text') + '\n\nAuthors/maintainers metadata (not a substituted copyright statement): ' + JSON.stringify(p.authors ?? p.author ?? []) + '\n\nUpstream: ' + JSON.stringify(p.repository ?? p.homepage ?? null) + (sourceUrl ? '\n\nUnmodified dependency source: ' + sourceUrl : '') + '\n\nText origin: ' + origin + '\n\n' + (text ? '<details><summary>License and notices</summary>\n\n<pre>' + escape(text) + '</pre>\n\n</details>' : 'MISSING: supply applicable license text before distribution.') + '\n');
}
for (const p of metadata.packages.filter(p => p.source).sort((a, b) => a.name.localeCompare(b.name))) {
  await notice(p, dirname(p.manifest_path));
}
const store = resolve('node_modules/.pnpm');
const npm = new Map();
for (const item of await readdir(store, { withFileTypes: true })) {
  if (!item.isDirectory()) continue;
  const directory = join(store, item.name, 'node_modules');
  let names; try { names = await readdir(directory, { withFileTypes: true }); } catch { continue; }
  for (const child of names) {
    const paths = child.name.startsWith('@') ? (await readdir(join(directory, child.name))).map(n => join(directory, child.name, n)) : [join(directory, child.name)];
    for (const path of paths) {
      try { const p = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')); npm.set(p.name + '@' + p.version, { ...p, directory: path }); }
      catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; }
    }
  }
}
for (const p of [...npm.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const parent = p.name.startsWith('@esbuild/') ? 'esbuild' : p.name.startsWith('@rollup/rollup-') ? 'rollup' : p.name.startsWith('@tauri-apps/cli-') ? '@tauri-apps/cli' : null;
  await notice({ ...p, name: 'npm: ' + p.name }, p.directory, parent ? npm.get(parent + '@' + p.version) : null);
}
await mkdir('docs', { recursive: true });
const installerNotice = await readFile('docs/installer-notices/NSIS-COPYING.txt', 'utf8');
await writeFile('docs/THIRD_PARTY_NOTICES.md', '# Third-party dependency notices\n\nGenerated from the locked Cargo dependency metadata and installed pnpm packages by scripts/license-notices.mjs. All available shipped notices are preserved. For dependencies that declare a standard SPDX license but omit a standalone license file, the permitted license choice, complete canonical terms, package authors/source URL, and available source copyright lines are supplied explicitly; these are not presented as an original upstream license file. Includes build tools and platform-specific dependencies. Original easy_pack code is MIT; third-party components retain their own licenses. See third-party.md for installer/runtime notices.\n\n' + sections.join('\n') + '\n## NSIS installer tooling\n\nOriginal COPYING shipped with the Tauri-downloaded NSIS toolchain:\n\n<pre>' + escape(installerNotice) + '</pre>\n');
await appendFile('docs/THIRD_PARTY_NOTICES.md', '\n## Rust standard library\n\nRust 1.98.1 standard-library and runtime copyright/license texts are preserved in the accompanying original [Rust-COPYRIGHT-library.html](Rust-COPYRIGHT-library.html). SHA256: ' + rustStandardLibrary.sha256 + '. This is separate from the Cargo/npm package count.\n');
await writeFile('docs/license-audit.json', JSON.stringify({ packages: sections.length, missingLicenseText: unresolved, rustStandardLibrary, canonicalTermsFallback, inheritedLicenseFiles, canonicalTerms: [...new Map(sources.map(s => [s.id, s])).values()] }, null, 2) + '\n');
console.log('Notices:', sections.length, '; missing applicable license text:', unresolved.length, '; canonical terms supplied:', canonicalTermsFallback.length, '; shared upstream notices:', inheritedLicenseFiles.length);
if (unresolved.length) process.exitCode = 1;
