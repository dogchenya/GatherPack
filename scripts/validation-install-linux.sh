#!/bin/bash
set -euo pipefail
cd /work
deb=/var/cache/easy-pack/target/release/bundle/deb/easy_pack_0.1.0-alpha.3_amd64.deb
export EASY_PACK_TEST_PACKAGE_SHA256=$(sha256sum "$deb" | cut -d ' ' -f 1)
if dpkg-query -W -f='${Status}' easy-pack 2>/dev/null | grep -q 'install ok installed'; then
  echo 'Refusing to replace an existing installation' >&2
  exit 1
fi
dpkg -i "$deb"
dpkg-query -L easy-pack > /work/artifacts/validation/linux-installed-files.txt
test -f /usr/bin/easy-pack
cmp /usr/share/nautilus-python/extensions/easy_pack_selection.py src-tauri/scripts/easy_pack_selection.py
notice=$(dpkg-query -L easy-pack | grep '/licenses/THIRD_PARTY_NOTICES.md$')
test -n "$notice"
grep -q 'NSIS installer tooling' "$notice"
rust_notice=$(dpkg-query -L easy-pack | grep '/licenses/Rust-COPYRIGHT-library.html$')
cmp "$rust_notice" docs/installer-notices/Rust-COPYRIGHT-library.html
/bin/bash scripts/validation-desktop-linux.sh native /usr/bin/easy-pack
/bin/bash scripts/validation-desktop-linux.sh gnome /usr/bin/easy-pack
cp artifacts/validation/linux-selection-report.json artifacts/validation/linux-deb-gui-report.json
dpkg --remove easy-pack
test ! -e /usr/bin/easy-pack
test ! -e /usr/share/nautilus-python/extensions/easy_pack_selection.py
printf '%s\n' '{"passed":true,"checks":["deb dependencies installed","system Nautilus bridge matches source","installed licenses complete","installed binary native IPC and restart passed","package removal removes binary and bridge"]}' > artifacts/validation/linux-install-report.json
cat artifacts/validation/linux-install-report.json
