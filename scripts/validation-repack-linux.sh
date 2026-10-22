#!/bin/bash
set -euo pipefail
cd /work
bash scripts/repack-appimage-linux.sh /var/cache/easy-pack/target/release/bundle/appimage/GatherPack.AppDir /var/cache/easy-pack/target/release/bundle/appimage/GatherPack_0.1.0-alpha.4_amd64.AppImage /root/.cache/tauri/easy-pack-runtime-x86_64 /var/cache/easy-pack/corresponding-source/appimage-runtime/notices
