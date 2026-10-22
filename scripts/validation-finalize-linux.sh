#!/bin/bash
set -euo pipefail
export CARGO_TARGET_DIR=/var/cache/easy-pack/target
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
export LC_ALL=C.UTF-8 EASY_PACK_SOURCE_CACHE=/var/cache/easy-pack/corresponding-source
export LDAI_RUNTIME_FILE=/root/.cache/tauri/easy-pack-runtime-x86_64 APPIMAGE_EXTRACT_AND_RUN=1
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
cd /work
node /opt/tauri-cli/tauri.js bundle --bundles deb,appimage --ci
bash scripts/finalize-appimage-linux.sh /var/cache/easy-pack/target/release/bundle artifacts/x86_64-unknown-linux-gnu/easy_pack-0.1.0-alpha.3-x86_64-unknown-linux-gnu-corresponding-source.tar
node scripts/collect-artifacts.mjs x86_64-unknown-linux-gnu /var/cache/easy-pack/target/release/bundle
