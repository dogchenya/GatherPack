#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/noble
test "$rootfs" = /opt/easy-pack-validation/noble
grep -q '^VERSION_CODENAME=noble$' "$rootfs/etc/os-release"
for target in dev proc sys; do
  if ! mountpoint -q "$rootfs/$target"; then
    if [ "$target" = proc ]; then mount -t proc proc "$rootfs/proc";
    else mount --bind "/$target" "$rootfs/$target"; fi
  fi
done
cp /etc/resolv.conf "$rootfs/etc/resolv.conf"
cat > "$rootfs/etc/apt/sources.list" <<'SOURCES'
deb http://archive.ubuntu.com/ubuntu noble main universe restricted multiverse
deb http://archive.ubuntu.com/ubuntu noble-updates main universe restricted multiverse
deb http://security.ubuntu.com/ubuntu noble-security main universe restricted multiverse
SOURCES
chroot "$rootfs" /bin/bash -s <<'INSTALL'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends build-essential curl ca-certificates pkg-config file libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libfuse2t64 python3-pyatspi python3-nautilus python3-yaml gir1.2-gtk-4.0 nautilus gnome-shell xvfb openbox xdotool x11-utils xclip dbus-x11 xauth locales rustup nodejs npm git fonts-noto-cjk
INSTALL
