"""Inspect compositor pixels around the actual GTK/WebKit window, not a browser mock."""
import json
import hashlib
import os
import signal
from pathlib import Path
import subprocess
import tempfile
import time
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk

background = Gtk.Window()
background.set_decorated(False)
background.set_default_size(1280, 900)
background.move(0, 0)
background.set_keep_below(True)
background.set_name("gatherpack-corner-background")
style = Gtk.CssProvider()
style.load_from_data(b"#gatherpack-corner-background { background-color: #400d73; }")
background.get_style_context().add_provider(style, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
background.show_all()


def pump():
    while Gtk.events_pending():
        Gtk.main_iteration_do(False)


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def settle():
    for _ in range(30):
        pump()
        time.sleep(.03)


checks = []
executable = os.environ.get("GATHERPACK_TEST_EXECUTABLE", "/var/cache/easy-pack/target/release/gatherpack")
with tempfile.TemporaryDirectory(prefix="gatherpack-corners-") as directory:
    env = {**os.environ, "XDG_DATA_HOME": directory, "XDG_CONFIG_HOME": directory, "XDG_CACHE_HOME": directory}
    system = Path("/usr/share/nautilus-python/extensions/gatherpack_selection.py")
    shadow = Path(directory) / "nautilus-python/extensions/gatherpack_selection.py"
    if system.exists():
        shadow.parent.mkdir(parents=True)
        shadow.write_text("# gatherpack managed Nautilus selection bridge v1\nraise RuntimeError('old incompatible bridge')\n")
    app = subprocess.Popen([executable], env=env, start_new_session=True)
    try:
        for _ in range(100):
            pump()
            # AppImage's extracting runtime may own the parent PID. This
            # disposable desktop has exactly one GatherPack instance.
            windows = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", "^GatherPack"], capture_output=True, text=True).stdout.splitlines()
            if windows:
                window = windows[-1]
                break
            time.sleep(.1)
        else:
            raise AssertionError("Native app did not map")
        command("xdotool", "windowmove", window, "300", "80")
        command("xdotool", "key", "Escape")
        for _ in range(8):
            settle()
        if system.exists():
            assert not shadow.exists(), "An old AppImage extension must not hide the installed deb bridge"
            checks.append({"managedUserShadowRemoved": True})
        settle()

        def pixels(mode):
            geometry = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())
            x, y, w, h = [int(geometry[key]) for key in ("X", "Y", "WIDTH", "HEIGHT")]
            root = Gdk.get_default_root_window()
            image = Gdk.pixbuf_get_from_window(root, 0, 0, 1280, 900)
            data, stride, channels = image.get_pixels(), image.get_rowstride(), image.get_n_channels()

            def rgb(px, py):
                offset = py * stride + px * channels
                return list(data[offset:offset + 3])

            corners = [rgb(x + dx, y + dy) for dx, dy in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]]
            image.savev(f"/work/artifacts/validation/linux-corners-{mode}.png", "png", [], [])
            # The purple window behind must remain visible through every corner.
            assert all(color[2] > color[0] and color[0] > color[1] and color[0] < 100 for color in corners), (mode, geometry, corners)
            if mode != "compact":
                assert min(rgb(x + w // 2, y + 15)) > 200, "Shelf interior must stay opaque"
            checks.append({"mode": mode, "corners": corners, "width": w, "height": h})
            image.savev(f"/work/artifacts/validation/linux-corners-{mode}.png", "png", [], [])

        pixels("compact")
        command("xdotool", "mousemove", "--sync", "350", "125")
        command("xdotool", "click", "1")
        settle()
        pixels("expanded")

        def geometry():
            return {key: int(value) for key, value in (line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())}

        def click_button(name):
            import pyatspi
            from collections import deque
            command("xdotool", "windowactivate", "--sync", window)
            queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
            matches = []
            while queue:
                item = queue.popleft()
                if item.name == name and item.getRoleName() in {"push button", "toggle button"}:
                    matches.append(item)
                queue.extend(list(item))
            assert len(matches) == 1, (name, len(matches))
            bounds = matches[0].queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
            command("xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2))
            time.sleep(.15)
            command("xdotool", "click", "1")
            settle()

        transitions = []
        position_report = {"passed": False, "executableSHA256": hashlib.sha256(Path(executable).read_bytes()).hexdigest(), "packageSHA256": os.environ.get("GATHERPACK_TEST_PACKAGE_SHA256"), "transitions": transitions}
        for phase, x, y, cycles in [("normal", 200, 80, 12), ("right-edge", 780, 90, 4), ("moved-down", 120, 200, 4), ("resized", 200, 100, 4)]:
            command("xdotool", "windowmove", window, str(x), str(y))
            if phase == "resized":
                command("xdotool", "windowsize", window, "440", "600")
            settle()
            baseline = geometry()
            for cycle in range(cycles):
                for name, width in [("文件关系图", 900), ("收集清单", 440)]:
                    click_button(name)
                    current = geometry()
                    transitions.append({"phase": phase, "cycle": cycle, "view": name, "baseline": baseline, **current})
                    Path("/work/artifacts/validation/linux-panel-position-report.json").write_text(json.dumps(position_report, indent=2))
                    assert current["Y"] == baseline["Y"], ("view switch must not move the panel vertically", baseline, current)
                    assert current["HEIGHT"] == baseline["HEIGHT"], ("view switch must preserve panel height", baseline, current)
                    assert current["WIDTH"] == width, ("view width must follow the selected tab", name, current)
                    expected_x = min(baseline["X"], 1280 - 900)
                    assert current["X"] == expected_x, ("only initial right-edge fitting may move the panel horizontally", baseline, current)
        position_report["passed"] = True
        Path("/work/artifacts/validation/linux-panel-position-report.json").write_text(json.dumps(position_report, indent=2))
        Path("/work/artifacts/validation/linux-corners-report.json").write_text(json.dumps({"passed": True, "executable": executable, "executableSHA256": hashlib.sha256(Path(executable).read_bytes()).hexdigest(), "packageSHA256": os.environ.get("GATHERPACK_TEST_PACKAGE_SHA256"), "checks": checks}, indent=2))
        print(json.dumps(checks))
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        app.wait(timeout=10)
        background.destroy()
