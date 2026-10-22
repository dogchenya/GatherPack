"""Fast native-window regression for the disposable GNOME/X11 session."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from collections import deque

assert os.getuid() == 2000 and os.environ.get("XDG_SESSION_TYPE") == "x11"
evidence = Path("/work/artifacts/validation")
root = Path(tempfile.mkdtemp(prefix="window-drag-", dir=Path.home()))
log = (evidence / "window-drag-app.log").open("w")
app = subprocess.Popen([os.environ["GATHERPACK_TEST_EXECUTABLE"]], env={**os.environ, "XDG_DATA_HOME": str(root)}, stdout=log, stderr=log)

def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=10).strip()

def geometry(window):
    return {key: int(value) for key, value in (line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())}

def text():
    import pyatspi
    queue = deque(item for item in pyatspi.Registry.getDesktop(0) if "gatherpack" in (item.name or "").lower())
    result = []
    while queue:
        item = queue.popleft(); result.append(item.name or ""); queue.extend(list(item))
        try: result.append(item.queryText().getText(0, -1))
        except (NotImplementedError, AttributeError, RuntimeError): pass
    return "\n".join(result)

try:
    command("xdotool", "key", "Escape"); time.sleep(.4)
    for _ in range(150):
        try:
            window = command("xdotool", "search", "--onlyvisible", "--name", "^GatherPack").splitlines()[0]
            break
        except (subprocess.CalledProcessError, IndexError): time.sleep(.1)
    command("xdotool", "windowmove", window, "300", "200")
    command("xdotool", "windowactivate", "--sync", window)
    time.sleep(.5)
    before = geometry(window)
    x, y = before["X"] + 52, before["Y"] + 48
    (evidence / "window-drag-inventory.txt").write_text(command("xwininfo", "-root", "-tree"))
    command("xdotool", "mousemove", str(x), str(y)); time.sleep(.3)
    (evidence / "window-drag-pointer.txt").write_text(command("xdotool", "getmouselocation", "--shell") + "\n" + command("xprop", "-id", window, "_GTK_FRAME_EXTENTS", "_NET_FRAME_EXTENTS"))
    command("python3", "/work/scripts/validation-screenshot-linux.py", str(evidence / "window-drag-before.png"))
    command("xdotool", "mousemove", str(x), str(y), "mousedown", "1")
    time.sleep(.15)
    for i in range(1, 7):
        command("xdotool", "mousemove", str(x + 7 * i), str(y + 4 * i)); time.sleep(.08)
    command("xdotool", "mouseup", "1"); time.sleep(.4)
    after = geometry(window)
    (evidence / "window-drag-geometry.json").write_text(json.dumps({"before": before, "after": after}, indent=2))
    (evidence / "window-drag-accessibility.txt").write_text(text())
    assert after["X"] > before["X"] + 20 and after["Y"] > before["Y"] + 10, "whole icon must move the native window"
    assert after["WIDTH"] == 104 and after["HEIGHT"] == 112, "drag must not expand"
    command("xdotool", "mousemove", str(after["X"] + 52), str(after["Y"] + 44), "click", "1")
    for _ in range(100):
        if geometry(window)["WIDTH"] >= 700: break
        time.sleep(.1)
    assert geometry(window)["WIDTH"] >= 700, "ordinary icon click must still expand"
    print("Native compact icon drag, click separation and ordinary expansion passed.")
finally:
    app.terminate(); app.wait(timeout=10); log.close()
