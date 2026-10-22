#!/bin/bash
set -euo pipefail
rootfs=${GATHERPACK_VALIDATION_ROOTFS:-/opt/easy-pack-validation/noble}
case "$rootfs" in /opt/easy-pack-validation/noble|/opt/easy-pack-validation/jammy) ;; *) exit 1 ;; esac
source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
grep -q "^VERSION_CODENAME=${rootfs##*/}$" "$rootfs/etc/os-release"
mkdir -p "$rootfs/work"
tar -C "$source" --exclude=./.git --exclude=./node_modules --exclude=./target --exclude=./artifacts --exclude='*.log' -cf - . | tar -C "$rootfs/work" -xf -
