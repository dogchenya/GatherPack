#!/bin/bash
# Native Ubuntu x64 release build. Install build deps and matching deb-src first.
set -euo pipefail
runtime=${XDG_CACHE_HOME:-$HOME/.cache}/tauri/easy-pack-runtime-x86_64
bash scripts/download-appimage-runtime-linux.sh "$runtime"
export LDAI_RUNTIME_FILE="$runtime"
pnpm tauri build --bundles deb,appimage -- --locked
version=$(node -p 'require("./package.json").version')
bundle="${CARGO_TARGET_DIR:-target}/release/bundle"
bash scripts/finalize-appimage-linux.sh "$bundle" "artifacts/x86_64-unknown-linux-gnu/easy_pack-$version-x86_64-unknown-linux-gnu-corresponding-source.tar"
node scripts/collect-artifacts.mjs x86_64-unknown-linux-gnu "$bundle"
