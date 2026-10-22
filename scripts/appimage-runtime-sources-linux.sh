#!/bin/bash
set -euo pipefail
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
repository_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
directory=${1:-/var/cache/easy-pack/corresponding-source/appimage-runtime}
mkdir -p "$directory"
cd "$directory"
fetch() { if [ ! -s "$2" ]; then curl -4 -fL --retry 2 --connect-timeout 10 --max-time 45 "$1" -o "$2"; fi; }
fetch https://codeload.github.com/AppImage/type2-runtime/tar.gz/fedfad5 type2-runtime-fedfad5.tar.gz
tar -xzf type2-runtime-fedfad5.tar.gz
fetch https://github.com/libfuse/libfuse/releases/download/fuse-3.15.0/fuse-3.15.0.tar.xz fuse-3.15.0.tar.xz
echo '70589cfd5e1cff7ccd6ac91c86c01be340b227285c5e200baa284e401eea2ca0  fuse-3.15.0.tar.xz' | sha256sum -c -
fetch https://codeload.github.com/vasi/squashfuse/tar.gz/0.5.2 squashfuse-0.5.2.tar.gz
echo 'db0238c5981dabbd80ee09ae15387f390091668ca060a7bc38047912491443d3  squashfuse-0.5.2.tar.gz' | sha256sum -c -
tar -xf fuse-3.15.0.tar.xz
tar -xf squashfuse-0.5.2.tar.gz
mkdir -p notices
cp type2-runtime-fedfad5/LICENSE notices/type2-runtime-LICENSE
cp fuse-3.15.0/LGPL2.txt notices/libfuse-LGPL2.txt
cp squashfuse-0.5.2/LICENSE notices/squashfuse-LICENSE
cp "$repository_root/docs/installer-notices/musl-COPYRIGHT" notices/musl-COPYRIGHT
echo 'b870108ec5e7790e9f9919064f1b9421d62d5f9b0e6c230c6adf7ea2da62e97b  notices/musl-COPYRIGHT' | sha256sum -c -
fetch https://raw.githubusercontent.com/facebook/zstd/dev/LICENSE notices/zstd-LICENSE
fetch https://raw.githubusercontent.com/madler/zlib/master/LICENSE notices/zlib-LICENSE
fetch https://raw.githubusercontent.com/AppImage/AppImageKit/master/src/AppRun.c notices/AppRun-upstream-source.c
printf '%s\n' 'AppRun executable: Tauri mirror https://github.com/tauri-apps/binary-releases/releases/tag/apprun-old of AppImageKit continuous. The original upstream AppRun MIT copyright/license header is preserved in AppRun-upstream-source.c; this is an upstream source reference, not an assertion that this HEAD is the mirrored binary exact commit.' > notices/AppRun-origin.txt
fetch https://raw.githubusercontent.com/linuxdeploy/linuxdeploy/master/LICENSE.txt notices/linuxdeploy-LICENSE.txt
fetch https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gtk/master/LICENSE.txt notices/linuxdeploy-plugin-gtk-LICENSE.txt
grep -q 'Permission' notices/musl-COPYRIGHT
grep -q 'Redistribution and use' notices/zstd-LICENSE
grep -q 'must not be misrepresented' notices/zlib-LICENSE
grep -q 'Permission' notices/AppRun-upstream-source.c
(cd notices; find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt)
