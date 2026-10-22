#!/bin/bash
set -euo pipefail
cd /work
export APPIMAGE_EXTRACT_AND_RUN=1
version=$(node -p 'require("./package.json").version')
runuser -u easypack-test -- env APPIMAGE_EXTRACT_AND_RUN=1 "/var/cache/easy-pack/target/release/bundle/appimage/GatherPack_${version}_amd64.AppImage" --probe-selection
