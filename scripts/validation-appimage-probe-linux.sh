#!/bin/bash
set -euo pipefail
export APPIMAGE_EXTRACT_AND_RUN=1
runuser -u easypack-test -- env APPIMAGE_EXTRACT_AND_RUN=1 /var/cache/easy-pack/target/release/bundle/appimage/easy_pack_0.1.0-alpha.3_amd64.AppImage --probe-selection
