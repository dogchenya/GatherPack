#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/noble
grep -q '^VERSION_CODENAME=noble$' "$rootfs/etc/os-release"
for target in dev proc sys; do
  if ! mountpoint -q "$rootfs/$target"; then
    if [ "$target" = proc ]; then mount -t proc proc "$rootfs/proc";
    else mount --bind "/$target" "$rootfs/$target"; fi
  fi
done
exec chroot "$rootfs" "$@"
