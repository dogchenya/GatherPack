#!/bin/bash
set -euo pipefail
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
cd /work
version=$(node -p 'require("./package.json").version')
python3 scripts/download-appimage-sources-linux.py artifacts/validation/appimage-libraries.json /var/cache/easy-pack/corresponding-source
python3 scripts/hash-source-tree.py /var/cache/easy-pack/corresponding-source
node scripts/collect-artifacts.mjs x86_64-unknown-linux-gnu /var/cache/easy-pack/target/release/bundle
tar -C /var/cache/easy-pack -cf artifacts/x86_64-unknown-linux-gnu/gatherpack-${version}-x86_64-unknown-linux-gnu-corresponding-source.tar corresponding-source
cd artifacts/x86_64-unknown-linux-gnu
sha256sum *corresponding-source.tar >> SHA256SUMS.txt
