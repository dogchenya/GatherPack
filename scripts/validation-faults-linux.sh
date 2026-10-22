#!/bin/bash
set -euo pipefail
mkdir -p /tmp/easy-pack-full
mount -t tmpfs -o size=64k,mode=0777 tmpfs /tmp/easy-pack-full
trap 'umount /tmp/easy-pack-full' EXIT
runuser -u easypack-test -- env EASY_PACK_DISK_FULL_DIR=/tmp/easy-pack-full python3 /work/scripts/test-linux-faults.py /var/cache/easy-pack/target/debug/examples/pack-probe
