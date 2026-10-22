#!/bin/bash
set -euo pipefail
if ! id -u easypack-test >/dev/null 2>&1; then useradd -m -u 2000 -s /bin/bash easypack-test; fi
mkdir -p /home/easypack-test/.local/share/nautilus-python/extensions /work/artifacts/validation /tmp/.X11-unix
cp /work/src-tauri/scripts/easy_pack_selection.py /home/easypack-test/.local/share/nautilus-python/extensions/
chown -R easypack-test:easypack-test /home/easypack-test/.local
chmod 1777 /tmp/.X11-unix
chmod 777 /work/artifacts/validation
if [ "${1:-selection}" = gnome ]; then
  mkdir -p /run/dbus
  export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/easy-pack-validation-system-bus
  system_bus_pid=$(dbus-daemon --system --fork --nopidfile --address="$DBUS_SYSTEM_BUS_ADDRESS" --print-pid)
  # The disposable chroot has no logind session. Let GNOME use its supported
  # non-systemd session path; restore the empty marker directory after testing.
  rmdir /run/systemd/seats
  trap 'kill "$system_bus_pid" 2>/dev/null || true; mkdir -p /run/systemd/seats' EXIT
fi
runuser -u easypack-test -- env -u XDG_RUNTIME_DIR dbus-run-session -- /bin/bash /work/scripts/validation-desktop-session-linux.sh "$@"
