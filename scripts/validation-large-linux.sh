#!/bin/bash
set -euo pipefail
export CARGO_TARGET_DIR=/var/cache/easy-pack/target CARGO_BUILD_JOBS=3 LC_ALL=C.UTF-8
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
cd /work
cargo test --locked --offline --release -p easy-pack-collection -- --ignored
