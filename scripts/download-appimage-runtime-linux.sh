#!/bin/bash
set -euo pipefail
runtime=${1:-${XDG_CACHE_HOME:-$HOME/.cache}/tauri/easy-pack-runtime-x86_64}
mkdir -p "$(dirname "$runtime")"
expected=617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46
if ! echo "$expected  $runtime" | sha256sum -c - >/dev/null 2>&1; then
  curl -4 -fL --retry 2 --connect-timeout 10 --max-time 45 https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64 -o "$runtime"
fi
echo "$expected  $runtime" | sha256sum -c -
chmod +x "$runtime"
"$runtime" --appimage-version 2>&1 | grep -q '/fedfad5$'
