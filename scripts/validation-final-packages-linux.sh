#!/bin/bash
set -euo pipefail
cd /work
bash scripts/validation-check-scripts-linux.sh
deb=/var/cache/easy-pack/target/release/bundle/deb/GatherPack_0.1.0-alpha.4_amd64.deb
image=/var/cache/easy-pack/target/release/bundle/appimage/GatherPack_0.1.0-alpha.4_amd64.AppImage
source_archive=artifacts/x86_64-unknown-linux-gnu/gatherpack-0.1.0-alpha.4-x86_64-unknown-linux-gnu-corresponding-source.tar
if [ "$#" -gt 0 ]; then
  directory=$(realpath "$1")
  shopt -s nullglob
  debs=("$directory"/*.deb)
  images=("$directory"/*.AppImage)
  sources=("$directory"/*-corresponding-source.tar)
  test "${#debs[@]}" -eq 1
  test "${#images[@]}" -eq 1
  test "${#sources[@]}" -eq 1
  deb=${debs[0]}
  image=${images[0]}
  source_archive=${sources[0]}
  chmod +x "$image"
fi
bash scripts/validation-install-linux.sh "$deb"
cp artifacts/validation/linux-selection.png artifacts/validation/linux-deb-gui.png
bash scripts/validation-desktop-linux.sh native "$image"
bash scripts/validation-desktop-linux.sh migration "$image"
bash scripts/validation-desktop-linux.sh gnome "$image"
cp artifacts/validation/linux-selection-report.json artifacts/validation/linux-appimage-gui-report.json
cp artifacts/validation/linux-selection.png artifacts/validation/linux-appimage-gui.png
temporary=$(mktemp -d /tmp/gatherpack-license-check-XXXXXX)
trap 'test -n "$temporary" && rm -rf -- "$temporary"' EXIT
(cd "$temporary"; "$image" --appimage-extract 'usr/lib/GatherPack/licenses/Rust-COPYRIGHT-library.html' >/dev/null)
cmp "$temporary/squashfs-root/usr/lib/GatherPack/licenses/Rust-COPYRIGHT-library.html" docs/installer-notices/Rust-COPYRIGHT-library.html
python3 scripts/verify-source-archive.py "$source_archive"
printf '%s\n' '{"passed":true,"checks":["final deb native IPC and full GUI passed","final AppImage native IPC and full GUI passed","original Rust runtime notice verified inside AppImage","corresponding source archive checksums verified"]}' > artifacts/validation/linux-packages-report.json
cat artifacts/validation/linux-packages-report.json
