#!/bin/bash
set -euo pipefail
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
curl -4 --fail --location --retry 2 --connect-timeout 10 --max-time 45 https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64 -o /root/.cache/tauri/easy-pack-runtime-x86_64
sha256sum /root/.cache/tauri/easy-pack-runtime-x86_64
