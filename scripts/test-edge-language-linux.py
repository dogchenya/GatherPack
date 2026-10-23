"""Real GNOME/X11 edge hiding, language preview, save, restart and opt-out."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
from collections import deque
import pyatspi

assert os.getuid() == 2000 and os.environ.get("XDG_SESSION_TYPE") == "x11"
root = Path(tempfile.mkdtemp(prefix="edge-language-", dir=Path.home()))
evidence = Path("/work/artifacts/validation")
executable = os.environ["GATHERPACK_TEST_EXECUTABLE"]
environment = {**os.environ, "XDG_DATA_HOME": str(root), "XDG_CONFIG_HOME": str(root / "config")}
state_file = root / "io.github.dogchenya.gatherpack/state.json"
checks, processes, logs = [], [], []
capture_directory = None
capture_frames = []
if os.environ.get('GATHERPACK_CAPTURE_EDGE') == '1':
    import gi
    gi.require_version('Gdk', '3.0')
    from gi.repository import Gdk
    Gdk.init([])
    subprocess.run(['gsettings','set','org.gnome.desktop.interface','enable-animations','true'],check=True)
    capture_directory = Path(tempfile.mkdtemp(prefix='edge-motion-', dir=evidence))


def capture_for(seconds):
    if capture_directory is None: return
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        root_window = Gdk.get_default_root_window()
        frame = Gdk.pixbuf_get_from_window(root_window,0,160,104,112)
        name = capture_directory / f'{len(capture_frames):04d}.png'
        frame.savev(str(name),'png',[],[])
        capture_frames.append(str(name))
        time.sleep(.03)


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=10).strip()


def wait(test, message, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            result = test()
            if result:
                return result
        except (OSError, ValueError, subprocess.CalledProcessError, IndexError):
            pass
        time.sleep(.1)
    raise AssertionError(message)


def check(result, message):
    assert result, message
    checks.append(message)


def launch():
    log = (evidence / f"features-app-{len(processes)}.log").open("w")
    logs.append(log)
    process = subprocess.Popen([executable], env=environment, stdout=log, stderr=log, start_new_session=True)
    processes.append(process)
    window = wait(lambda: command("xdotool", "search", "--onlyvisible", "--name", "^GatherPack").splitlines()[0], "App must map")
    command("xdotool", "key", "Escape")
    time.sleep(2)
    bounds = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())
    command("xdotool", "mousemove", "--sync", str(int(bounds["X"]) + int(bounds["WIDTH"]) // 2), str(int(bounds["Y"]) + 40))
    wait(lambda: "展开收集面板" in text() or "Open collection panel" in text(), "hover reveals the startup icon")
    return process, window


def stop(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    process.wait(timeout=10)


def geometry():
    return {key: int(value) for key, value in (line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())}


def widgets():
    queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
    result = []
    while queue and len(result) < 15000:
        item = queue.popleft()
        result.append(item)
        queue.extend(list(item))
    return result


def text():
    return "\n".join(item.name or "" for item in widgets())


def control(name, roles):
    matches = [item for item in widgets() if item.name == name and item.getRoleName() in roles]
    assert len(matches) == 1, (name, len(matches))
    return matches[0]


def click(name):
    command("xdotool", "windowactivate", "--sync", window)
    item = control(name, {"push button", "toggle button", "check box"})
    component = item.queryComponent()
    component.scrollTo(pyatspi.SCROLL_ANYWHERE)
    component.grabFocus()
    time.sleep(.25)
    bounds = component.getExtents(pyatspi.DESKTOP_COORDS)
    with (evidence / "features-clicks.jsonl").open("a") as trace:
        trace.write(json.dumps({"name": name, "bounds": list(bounds)}, ensure_ascii=False) + "\n")
    command("xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2))
    time.sleep(.15)
    command("xdotool", "click", "1")
    time.sleep(.3)


def choose_language(label, key):
    item = control(label, {"combo box"})
    item.queryComponent().grabFocus()
    command("xdotool", "key", key)
    command("xdotool", "key", "Return")
    time.sleep(.5)


try:
    process, window = launch()
    check("展开收集面板" in text(), "fresh profile starts in Simplified Chinese")
    command("xdotool", "windowmove", window, "0", "160")
    command("xdotool", "mousemove", "--sync", "7", "165")
    time.sleep(1.5)
    check(geometry()["WIDTH"] == 104, "pointer inside the edge icon prevents hiding")
    capture_for(.3)
    command("xdotool", "mousemove", "--sync", "600", "500")
    capture_for(1.5)
    wait(lambda: geometry()["WIDTH"] == 10, "left edge must become a 10px handle")
    hidden = geometry()
    check(hidden["X"] == 0 and hidden["HEIGHT"] == 112, "left handle stays fully on screen")
    motion_reveal_start = len(capture_frames)
    command("xdotool", "mousemove", "--sync", "5", str(hidden["Y"] + 40))
    capture_for(.35)
    if capture_directory is not None:
        command("xdotool", "mousemove", "7", "165")
    capture_for(.3)
    wait(lambda: geometry()["WIDTH"] == 104, "hover must restore compact icon")
    check(geometry()["X"] == 0, "left edge reveal preserves its anchor")
    command("xdotool", "windowmove", window, "300", "160")
    command("xdotool", "mousemove", "--sync", "600", "500")
    time.sleep(2)
    check(geometry()["WIDTH"] == 104, "moving away from an edge detaches auto-hide")
    command("xdotool", "windowmove", window, "1176", "160")
    wait(lambda: geometry()["WIDTH"] == 10 and geometry()["X"] == 1270, "right edge must hide at the screen boundary")
    hidden = geometry()
    check(hidden["X"] == 1270, "right handle remains reachable on screen")
    command("xdotool", "mousemove", "--sync", "1275", str(hidden["Y"] + 40))
    wait(lambda: geometry()["WIDTH"] == 104 and geometry()["X"] == 1176, "right hover must restore")
    check(geometry()["X"] == 1176, "right edge reveal preserves its anchor")
    click("展开收集面板")
    wait(lambda: geometry()["WIDTH"] == 440, "compact icon must open normally after reveal")
    command("xdotool", "windowmove", window, "0", "80")
    command("xdotool", "mousemove", "--sync", "700", "500")
    wait(lambda: geometry()["WIDTH"] == 10, "expanded collection must slide out at the edge")
    hidden = geometry()
    check(hidden["HEIGHT"] == 112, "expanded panel leaves only a compact edge wake-up target")
    command("xdotool", "mousemove", "--sync", "5", str(hidden["Y"] + 40))
    wait(lambda: geometry()["WIDTH"] == 440 and geometry()["HEIGHT"] == 760, "hover must restore expanded panel dimensions")
    check(geometry()["Y"] == 80, "expanded reveal preserves the original panel position")
    time.sleep(.4)
    click("设置")
    command("xdotool", "mousemove", "700", "500")
    time.sleep(1.5)
    check(geometry()["WIDTH"] == 440, "settings suspend edge hiding while the pointer is outside")
    choose_language("界面语言", "End")
    wait(lambda: "Save settings" in text(), "language change must preview immediately")
    check("App settings" in text() and "Auto-hide at screen edges" in text(), "settings controls preview in English")
    click("Cancel")
    wait(lambda: "设置" in text(), "cancel must restore Chinese")
    check(not state_file.exists(), "cancelled language preview does not write preferences")
    click("设置")
    choose_language("界面语言", "End")
    click("Save settings")
    wait(lambda: json.loads(state_file.read_text())["settings"]["language"] == "en", "English must persist")
    check("Collect and pack files" in command("xdotool", "getwindowname", window), "native window title follows the saved language")
    stop(process)
    process, window = launch()
    wait(lambda: "Open collection panel" in text(), "saved English must survive restart")
    check(True, "English persists across a real process restart")
    click("Open collection panel")
    click("Settings")
    click("Auto-hide at screen edges")
    choose_language("Interface language", "Home")
    click("保存设置")
    saved = wait(lambda: json.loads(state_file.read_text())["settings"], "settings must save")
    check(saved["language"] == "zh-CN" and not saved["edgeHide"], "Chinese and auto-hide opt-out persist together")
    click("收起面板")
    wait(lambda: geometry()["WIDTH"] == 104, "collapse must restore normal icon size")
    command("xdotool", "windowmove", window, "0", "160")
    command("xdotool", "mousemove", "--sync", "600", "500")
    time.sleep(2)
    check(geometry()["WIDTH"] == 104, "disabling auto-hide keeps the edge icon visible")
    report = {"passed": True, "executableSHA256": hashlib.sha256(Path(executable).read_bytes()).hexdigest(), "packageSHA256": os.environ.get("GATHERPACK_TEST_PACKAGE_SHA256"), "checks": checks, "motionFrames":str(capture_directory) if capture_directory else None, "motionRevealStart":motion_reveal_start}
except Exception as error:
    report = {"passed": False, "error": str(error), "checks": checks}
    try:
        report["geometry"] = geometry()
        (evidence / "features-accessibility.txt").write_text(text())
        command("python3", "/work/scripts/validation-screenshot-linux.py", str(evidence / "features-failure.png"))
    except Exception:
        pass
    raise
finally:
    (evidence / "edge-language-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    for process in reversed(processes):
        stop(process)
    for log in logs:
        log.close()
print(json.dumps(report, ensure_ascii=False))
