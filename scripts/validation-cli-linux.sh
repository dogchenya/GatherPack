#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/noble
source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$rootfs/opt/tauri-cli"
tar -C "$source/node_modules/@tauri-apps/cli" --exclude=node_modules -cf - . | tar -C "$rootfs/opt/tauri-cli" -xf -
tar -C "$rootfs/opt/tauri-cli" --strip-components=1 -xzf "$source/artifacts/validation/tauri-cli-linux.tgz"
