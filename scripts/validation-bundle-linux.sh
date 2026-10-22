#!/bin/bash
set -euo pipefail
export CARGO_TARGET_DIR=/var/cache/easy-pack/target
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
export LC_ALL=C.UTF-8 APPIMAGE_EXTRACT_AND_RUN=1
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
cd /work
node /opt/tauri-cli/tauri.js bundle --bundles deb,appimage --ci --verbose
