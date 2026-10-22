#!/bin/bash
set -euo pipefail
rootfs=/opt/easy-pack-validation/jammy
mkdir -p /opt/easy-pack-validation
export WGETRC=/opt/easy-pack-validation/jammy-wgetrc
printf '%s\n' 'inet4_only = on' 'timeout = 20' 'tries = 3' > "$WGETRC"
if [ ! -f "$rootfs/etc/os-release" ]; then
  debootstrap --variant=minbase jammy "$rootfs" http://archive.ubuntu.com/ubuntu
fi
grep -q '^VERSION_CODENAME=jammy$' "$rootfs/etc/os-release"
for target in dev proc sys; do
  if ! mountpoint -q "$rootfs/$target"; then
    if [ "$target" = proc ]; then mount -t proc proc "$rootfs/proc";
    else mount --bind "/$target" "$rootfs/$target"; fi
  fi
done
cp /etc/resolv.conf "$rootfs/etc/resolv.conf"
cat > "$rootfs/etc/apt/sources.list" <<'SOURCES'
deb http://archive.ubuntu.com/ubuntu jammy main universe restricted multiverse
deb http://archive.ubuntu.com/ubuntu jammy-updates main universe restricted multiverse
deb http://security.ubuntu.com/ubuntu jammy-security main universe restricted multiverse
deb-src http://archive.ubuntu.com/ubuntu jammy main universe restricted multiverse
deb-src http://archive.ubuntu.com/ubuntu jammy-updates main universe restricted multiverse
deb-src http://security.ubuntu.com/ubuntu jammy-security main universe restricted multiverse
SOURCES
chroot "$rootfs" /usr/bin/env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l /bin/bash -s <<'INSTALL'
set -euo pipefail
apt-get update
apt-get install -y --no-install-recommends build-essential curl ca-certificates pkg-config file libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libfuse2 python3-pyatspi python3-nautilus python3-yaml gir1.2-gtk-3.0 gir1.2-gtk-4.0 nautilus gnome-shell xvfb openbox xdotool x11-utils xclip dbus-x11 xauth locales nodejs git fonts-noto-cjk
INSTALL
