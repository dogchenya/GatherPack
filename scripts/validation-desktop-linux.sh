#!/bin/bash
set -euo pipefail
if ! id -u easypack-test >/dev/null 2>&1; then useradd -m -u 2000 -s /bin/bash easypack-test; fi
mkdir -p /home/easypack-test/.local/share/nautilus-python/extensions /work/artifacts/validation /tmp/.X11-unix
cp /work/src-tauri/scripts/gatherpack_selection.py /home/easypack-test/.local/share/nautilus-python/extensions/
chown -R easypack-test:easypack-test /home/easypack-test/.local
chmod 1777 /tmp/.X11-unix
chmod 777 /work/artifacts/validation
if [[ "${1:-selection}" = gnome || "${1:-selection}" = shortcuts || "${1:-selection}" = drag || "${1:-selection}" = layout || "${1:-selection}" = features || "${1:-selection}" = connection ]]; then
  mkdir -p /run/dbus
  export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/gatherpack-validation-system-bus
  system_bus_pid=$(dbus-daemon --system --fork --nopidfile --address="$DBUS_SYSTEM_BUS_ADDRESS" --print-pid)
  # The disposable chroot has no logind session. Let GNOME use its supported
  # non-systemd session path; restore the empty marker directory after testing.
  had_seats=0
  if [ -d /run/systemd/seats ]; then rmdir /run/systemd/seats; had_seats=1; fi
  trap 'kill "$system_bus_pid" 2>/dev/null || true; if [ "$had_seats" = 1 ]; then mkdir -p /run/systemd/seats; fi' EXIT
fi
runuser -u easypack-test -- env -u XDG_RUNTIME_DIR dbus-run-session -- /bin/bash /work/scripts/validation-desktop-session-linux.sh "$@"
