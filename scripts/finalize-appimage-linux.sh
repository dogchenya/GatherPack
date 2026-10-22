#!/bin/bash
# Run after tauri build, on the same Ubuntu host with matching deb-src indexes.
set -euo pipefail
bundle=$(realpath "$1")
source_archive=$(realpath -m "$2")
version=$(node -p 'require("./package.json").version')
image="$bundle/appimage/GatherPack_${version}_amd64.AppImage"
appdir="$bundle/appimage/GatherPack.AppDir"
temporary=$(mktemp -d /tmp/gatherpack-appimage-source-XXXXXX)
trap 'test -n "$temporary" && rm -rf -- "$temporary"' EXIT
offset=$("$image" --appimage-offset)
head -c "$offset" "$image" > "$temporary/runtime"
chmod +x "$temporary/runtime"
"$temporary/runtime" --appimage-version 2>&1 | grep -q '/fedfad5$'
python3 scripts/appimage-notices-linux.py "$appdir"
sources=$(realpath -m "${GATHERPACK_SOURCE_CACHE:-$temporary/corresponding-source}")
python3 scripts/download-appimage-sources-linux.py artifacts/validation/appimage-libraries.json "$sources"
bash scripts/appimage-runtime-sources-linux.sh "$sources/appimage-runtime"
bash scripts/repack-appimage-linux.sh "$appdir" "$image" "$temporary/runtime" "$sources/appimage-runtime/notices"
python3 scripts/hash-source-tree.py "$sources"
mkdir -p "$(dirname "$source_archive")"
tar -C "$sources" --transform='flags=rh;s,^\.,corresponding-source,' -cf "$source_archive" .
