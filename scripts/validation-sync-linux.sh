#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/noble
source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
grep -q '^VERSION_CODENAME=noble$' "$rootfs/etc/os-release"
mkdir -p "$rootfs/work"
tar -C "$source" --exclude=./.git --exclude=./node_modules --exclude=./target --exclude=./artifacts --exclude='*.log' -cf - . | tar -C "$rootfs/work" -xf -
