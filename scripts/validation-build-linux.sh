#!/bin/bash
set -euo pipefail
export CARGO_TARGET_DIR=/var/cache/easy-pack/target
export CARGO_BUILD_JOBS=3
export LC_ALL=C.UTF-8
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
cd /work
cargo test --locked --offline -p gatherpack-collection
cargo build --locked --offline --example pack-probe -p gatherpack-collection
cargo build --locked --offline --release -p gatherpack --features custom-protocol
cargo test --locked --offline --release -p gatherpack
