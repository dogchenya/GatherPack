#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/noble
source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
grep -q '^VERSION_CODENAME=noble$' "$rootfs/etc/os-release"
mkdir -p "$rootfs/work"
tar -C "$source" --exclude=./.git --exclude=./node_modules --exclude=./target --exclude=./artifacts --exclude='*.log' -cf - . | tar -C "$rootfs/work" -xf -
bash "$source/scripts/validation-enter-linux.sh" /usr/bin/env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /bin/bash -s <<'PREPARE'
set -euo pipefail
rustup toolchain install 1.98.1 --profile minimal --component rustfmt
rustup default 1.98.1
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
mkdir -p /var/cache/easy-pack/target
cd /work
cargo --version
rustc --version
nautilus --version
node --version
PREPARE
