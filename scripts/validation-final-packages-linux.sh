#!/bin/bash
set -euo pipefail
cd /work
bash scripts/validation-check-scripts-linux.sh
bash scripts/validation-install-linux.sh
cp artifacts/validation/linux-selection.png artifacts/validation/linux-deb-gui.png
image=/var/cache/easy-pack/target/release/bundle/appimage/easy_pack_0.1.0-alpha.3_amd64.AppImage
bash scripts/validation-desktop-linux.sh native "$image"
bash scripts/validation-desktop-linux.sh gnome "$image"
cp artifacts/validation/linux-selection-report.json artifacts/validation/linux-appimage-gui-report.json
cp artifacts/validation/linux-selection.png artifacts/validation/linux-appimage-gui.png
temporary=$(mktemp -d /tmp/easy-pack-license-check-XXXXXX)
trap 'test -n "$temporary" && rm -rf -- "$temporary"' EXIT
(cd "$temporary"; "$image" --appimage-extract 'usr/lib/easy_pack/licenses/Rust-COPYRIGHT-library.html' >/dev/null)
cmp "$temporary/squashfs-root/usr/lib/easy_pack/licenses/Rust-COPYRIGHT-library.html" docs/installer-notices/Rust-COPYRIGHT-library.html
python3 scripts/verify-source-archive.py artifacts/x86_64-unknown-linux-gnu/easy_pack-0.1.0-alpha.3-x86_64-unknown-linux-gnu-corresponding-source.tar
printf '%s\n' '{"passed":true,"checks":["final deb native IPC and full GUI passed","final AppImage native IPC and full GUI passed","original Rust runtime notice verified inside AppImage","corresponding source archive checksums verified"]}' > artifacts/validation/linux-packages-report.json
cat artifacts/validation/linux-packages-report.json
