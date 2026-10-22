#!/bin/bash
set -euo pipefail
export DISPLAY=:88 XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 LC_ALL=C.UTF-8 LANG=C.UTF-8
if [ "${1:-selection}" = native ]; then export DISPLAY=:89; fi
if [ "${1:-selection}" = gnome ]; then export DISPLAY=:90 XDG_CURRENT_DESKTOP=GNOME XDG_SESSION_DESKTOP=gnome GNOME_SHELL_SESSION_MODE=user; fi
export XDG_RUNTIME_DIR=/tmp/gatherpack-runtime-2000
export GTK_A11Y=atspi NO_AT_BRIDGE=0 WEBKIT_DISABLE_DMABUF_RENDERER=1
export GIO_USE_VFS=local GIO_USE_VOLUME_MONITOR=unix
export ACCESSIBILITY_ENABLED=1
export APPIMAGE_EXTRACT_AND_RUN=1
if [ -n "${2:-}" ]; then export GATHERPACK_TEST_EXECUTABLE="$2"; fi
unset WAYLAND_DISPLAY
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
dbus-update-activation-environment DISPLAY XDG_SESSION_TYPE GDK_BACKEND XDG_RUNTIME_DIR GTK_A11Y NO_AT_BRIDGE
Xvfb "$DISPLAY" -screen 0 1280x900x24 -nolisten tcp >/work/artifacts/validation/xvfb.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
for i in $(seq 1 50); do if xdpyinfo >/dev/null 2>&1; then break; fi; sleep .1; done
if [ "${1:-selection}" = gnome ]; then
  gsettings set org.gnome.desktop.interface enable-animations false
  gnome-shell --x11 --replace >/work/artifacts/validation/gnome-shell.log 2>&1 &
  shell_pid=$!
  sleep 3
  kill -0 "$shell_pid"
else
  openbox >/work/artifacts/validation/openbox.log 2>&1 &
fi
if [ "${1:-selection}" = migration ]; then
  cd /work
  node scripts/test-profile-migration.mjs "${2:-/var/cache/easy-pack/target/release/gatherpack}"
elif [ "${1:-selection}" = native ]; then
  cd /work
  export APPIMAGE_EXTRACT_AND_RUN=1
  node scripts/test-native.mjs "${2:-/var/cache/easy-pack/target/release/gatherpack}"
else
  python3 /work/scripts/test-linux-selection.py
fi
