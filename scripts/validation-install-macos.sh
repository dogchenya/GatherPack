#!/bin/bash
# Validate the delivered read-only DMG without modifying /Applications.
set -euo pipefail
directory=$(cd "$1" && pwd)
target=$2
commit=$3
case "$(uname -m):$target" in
  arm64:aarch64-apple-darwin|x86_64:x86_64-apple-darwin) ;;
  *) echo 'DMG validation requires its matching native Mac architecture' >&2; exit 1 ;;
esac
node --input-type=module - "$directory" "$target" "$commit" <<'JS'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const [directory, target, commit] = process.argv.slice(2);
const p = JSON.parse(await readFile(join(directory, target + '-provenance.json'), 'utf8'));
assert.equal(p.target, target);
assert.equal(p.commit, commit);
assert.equal(p.version, JSON.parse(await readFile('package.json', 'utf8')).version);
assert.ok(p.rust.includes('host: ' + target + '\n'));
const audit = JSON.parse(await readFile(join(directory, 'license-audit.json'), 'utf8'));
assert.deepEqual(audit.missingLicenseText, []);
JS
(cd "$directory"; shasum -a 256 -c SHA256SUMS.txt)
shopt -s nullglob
images=("$directory"/*.dmg)
test "${#images[@]}" -eq 1
mount=$(mktemp -d /tmp/easy-pack-dmg-XXXXXX)
mounted=0
cleanup() {
  if [ "$mounted" -eq 1 ]; then hdiutil detach "$mount" >/dev/null || return; fi
  rmdir "$mount"
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "${images[0]}" >/dev/null
mounted=1
apps=("$mount"/*.app)
test "${#apps[@]}" -eq 1
app=${apps[0]}
test -x "$app/Contents/MacOS/easy-pack"
for name in LICENSE THIRD_PARTY_NOTICES.md third-party.md license-audit.json Rust-COPYRIGHT-library.html; do
  test -s "$app/Contents/Resources/licenses/$name"
done
cmp docs/installer-notices/Rust-COPYRIGHT-library.html "$app/Contents/Resources/licenses/Rust-COPYRIGHT-library.html"
plutil -lint "$app/Contents/Info.plist"
node scripts/test-native.mjs "$app/Contents/MacOS/easy-pack"
hdiutil detach "$mount" >/dev/null
mounted=0
EASY_PACK_VALIDATION_TARGET="$target" EASY_PACK_VALIDATION_COMMIT="$commit" node --input-type=module <<'JS'
import { writeFile } from 'node:fs/promises';
const target = process.env.EASY_PACK_VALIDATION_TARGET;
await writeFile('artifacts/validation/macos-install-' + target + '.json', JSON.stringify({passed: true, target, commit: process.env.EASY_PACK_VALIDATION_COMMIT, checks: ['DMG SHA256 and build provenance match', 'DMG mounts read-only on matching native architecture', 'Bundled executable and license resources exist', 'Original Rust standard-library notice bytes match', 'Bundled executable passes 22 core and 5 restart native IPC assertions', 'DMG detaches after the application exits']}, null, 2) + '\n');
JS
