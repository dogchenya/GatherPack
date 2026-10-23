#!/bin/bash
set -euo pipefail
cd /work
version=$(node -p 'require("./package.json").version')
deb=${1:-/var/cache/easy-pack/target/release/bundle/deb/GatherPack_${version}_amd64.deb}
export GATHERPACK_TEST_PACKAGE_SHA256=$(sha256sum "$deb" | cut -d ' ' -f 1)
package=$(dpkg-deb -f "$deb" Package)
test "$package" = gather-pack
if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
  echo 'Refusing to replace an existing installation' >&2
  exit 1
fi
dpkg -i "$deb"
dpkg-query -L "$package" > /work/artifacts/validation/linux-installed-files.txt
test -f /usr/bin/gatherpack
desktop=$(dpkg-query -L "$package" | grep '/applications/GatherPack.desktop$')
grep -Fxq 'Name=GatherPack' "$desktop"
grep -Fq 'Exec=gatherpack' "$desktop"
cmp /usr/share/nautilus-python/extensions/gatherpack_selection.py src-tauri/scripts/gatherpack_selection.py
notice=$(dpkg-query -L "$package" | grep '/licenses/THIRD_PARTY_NOTICES.md$')
test -n "$notice"
grep -q 'NSIS installer tooling' "$notice"
rust_notice=$(dpkg-query -L "$package" | grep '/licenses/Rust-COPYRIGHT-library.html$')
cmp "$rust_notice" docs/installer-notices/Rust-COPYRIGHT-library.html
/bin/bash scripts/validation-desktop-linux.sh native /usr/bin/gatherpack
/bin/bash scripts/validation-desktop-linux.sh gnome /usr/bin/gatherpack
cp artifacts/validation/linux-selection-report.json artifacts/validation/linux-deb-gui-report.json
GATHERPACK_TEST_SYSTEM_UPGRADE=1 /bin/bash scripts/validation-desktop-linux.sh shortcuts /usr/bin/gatherpack
cp artifacts/validation/shortcut-recovery-report.json artifacts/validation/linux-deb-upgrade-report.json
dpkg --remove "$package"
test ! -e /usr/bin/gatherpack
test ! -e /usr/share/nautilus-python/extensions/gatherpack_selection.py
printf '%s\n' '{"passed":true,"checks":["deb dependencies installed","desktop launcher uses the GatherPack name and executable","system Nautilus bridge matches source","installed licenses complete","installed binary native IPC and restart passed","package removal removes binary and bridge"]}' > artifacts/validation/linux-install-report.json
cat artifacts/validation/linux-install-report.json
