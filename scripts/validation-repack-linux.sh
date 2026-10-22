#!/bin/bash
set -euo pipefail
cd /work
version=$(node -p 'require("./package.json").version')
bash scripts/repack-appimage-linux.sh /var/cache/easy-pack/target/release/bundle/appimage/GatherPack.AppDir "/var/cache/easy-pack/target/release/bundle/appimage/GatherPack_${version}_amd64.AppImage" /root/.cache/tauri/easy-pack-runtime-x86_64 /var/cache/easy-pack/corresponding-source/appimage-runtime/notices
