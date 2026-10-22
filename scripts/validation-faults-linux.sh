#!/bin/bash
set -euo pipefail
mkdir -p /tmp/gatherpack-full
mount -t tmpfs -o size=64k,mode=0777 tmpfs /tmp/gatherpack-full
trap 'umount /tmp/gatherpack-full' EXIT
runuser -u easypack-test -- env GATHERPACK_DISK_FULL_DIR=/tmp/gatherpack-full python3 /work/scripts/test-linux-faults.py /var/cache/easy-pack/target/debug/examples/pack-probe
