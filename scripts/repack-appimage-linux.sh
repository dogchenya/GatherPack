#!/bin/bash
set -euo pipefail
appdir=$(realpath "$1")
output=$(realpath -m "$2")
runtime=$(realpath "$3")
notices=$(realpath "$4")
"$runtime" --appimage-version 2>&1 | grep -q '/fedfad5$'
python3 scripts/appimage-notices-linux.py "$appdir"
test -f "$notices/type2-runtime-LICENSE"
test -f "$notices/libfuse-LGPL2.txt"
test -f "$notices/squashfuse-LICENSE"
test -f "$notices/musl-COPYRIGHT"
test -f "$notices/zstd-LICENSE"
test -f "$notices/zlib-LICENSE"
test -f "$notices/AppRun-upstream-source.c"
mkdir -p "$appdir/usr/share/doc/easy-pack/appimage-runtime"
cp "$notices/"* "$appdir/usr/share/doc/easy-pack/appimage-runtime/"
"$runtime" --appimage-help > "$appdir/usr/share/doc/easy-pack/appimage-runtime/runtime-help.txt"
"$runtime" --appimage-version > "$appdir/usr/share/doc/easy-pack/appimage-runtime/runtime-version.txt" 2>&1
temporary=$(mktemp -d /tmp/easy-pack-appimage-tools-XXXXXX)
trap 'test -n "$temporary" && rm -rf -- "$temporary"' EXIT
plugin=${XDG_CACHE_HOME:-$HOME/.cache}/tauri/linuxdeploy-plugin-appimage.AppImage
(cd "$temporary"; "$plugin" --appimage-extract > /dev/null)
export PATH="$temporary/squashfs-root/appimagetool-prefix/usr/bin:$PATH"
ARCH=x86_64 "$temporary/squashfs-root/appimagetool-prefix/usr/bin/appimagetool" --runtime-file "$runtime" "$appdir" "$output"
