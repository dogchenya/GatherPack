#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/noble
test -n "${GATHERPACK_CARGO_CACHE:-}"
test -d "$GATHERPACK_CARGO_CACHE/cache"
mkdir -p "$rootfs/root/.cargo/registry"
cp -a "$GATHERPACK_CARGO_CACHE/cache" "$rootfs/root/.cargo/registry/"
cp -a "$GATHERPACK_CARGO_CACHE/index" "$rootfs/root/.cargo/registry/"
printf 'Public locked crate archives and sparse metadata copied; Cargo checksums remain enforced.\n'
