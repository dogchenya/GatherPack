#!/bin/bash
set -euo pipefail
rootfs=${GATHERPACK_VALIDATION_ROOTFS:-/opt/easy-pack-validation/noble}
case "$rootfs" in /opt/easy-pack-validation/noble|/opt/easy-pack-validation/jammy) ;; *) exit 1 ;; esac
grep -q "^VERSION_CODENAME=${rootfs##*/}$" "$rootfs/etc/os-release"
for target in dev proc sys; do
  if ! mountpoint -q "$rootfs/$target"; then
    if [ "$target" = proc ]; then mount -t proc proc "$rootfs/proc";
    else mount --bind "/$target" "$rootfs/$target"; fi
  fi
done
exec chroot "$rootfs" "$@"
