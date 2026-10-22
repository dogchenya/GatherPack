"""Reproduce first-install bridge loading and conflicting app shortcut recovery.

Runs only in the disposable GNOME/X11 test session, never the user's desktop.
"""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
from collections import deque
from file_hash import sha256_stream

assert os.getuid() == 2000 and os.environ.get("XDG_SESSION_TYPE") == "x11"
assert not Path("/usr/share/nautilus-python/extensions/gatherpack_selection.py").exists(), "Run after Debian removal to reproduce a fresh user bridge"
evidence = Path("/work/artifacts/validation")
root = Path(tempfile.mkdtemp(prefix="shortcut-recovery-", dir=Path.home()))
source = root / "shortcut-source"
source.mkdir()
(source / "one.txt").write_bytes(b"first original")
(source / "two.txt").write_bytes(b"second original")
executable = os.environ["GATHERPACK_TEST_EXECUTABLE"]
checks, processes, logs = [], [], []


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=15).strip()


def check(value, name):
    checks.append({"name": name, "passed": bool(value)})
    if not value:
        raise AssertionError(name)


def wait(predicate, description):
    for _ in range(150):
        try:
            value = predicate()
            if value:
                return value
        except (subprocess.CalledProcessError, FileNotFoundError, ProcessLookupError):
            pass
        time.sleep(.1)
    raise RuntimeError(description)


def environment(name):
    data = root / name
    data.mkdir()
    return {**os.environ, "XDG_DATA_HOME": str(data), "XDG_CONFIG_HOME": str(data / "config"), "XDG_CACHE_HOME": str(data / "cache")}, data


def launch(args, env, name):
    log = (evidence / (name + ".log")).open("w")
    logs.append(log)
    child = subprocess.Popen(args, env=env, stdout=log, stderr=log, start_new_session=True)
    processes.append(child)
    return child


def stop(child):
    try:
        os.killpg(child.pid, signal.SIGTERM)
        child.wait(timeout=5)
    except ProcessLookupError:
        pass
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=5)


def app_window(child):
    windows = command("xdotool", "search", "--onlyvisible", "--name", "^GatherPack").splitlines()
    for window in windows:
        pid = re.search(r"=\s*(\d+)", command("xprop", "-id", window, "_NET_WM_PID"))
        if pid and os.getpgid(int(pid.group(1))) == child.pid:
            return window


def focus(window):
    command("xdotool", "key", "Escape")
    command("xdotool", "windowactivate", "--sync", window)
    time.sleep(.3)


def geometry(window):
    return {k: int(v) for k, v in (line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())}


def expand(window):
    command("xdotool", "windowmove", window, "20", "40")
    focus(window)
    bounds = geometry(window)
    command("xdotool", "mousemove", str(bounds["X"] + 52), str(bounds["Y"] + 44), "click", "1")
    wait(lambda: geometry(window)["WIDTH"] > 700, "Compact click must open the panel")


def app_widgets():
    import pyatspi
    queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
    items = []
    while queue and len(items) < 15000:
        item = queue.popleft()
        items.append(item)
        queue.extend(list(item))
    return items


def app_text():
    text = []
    for item in app_widgets():
        text.append(item.name or "")
        try:
            text.append(item.queryText().getText(0, -1))
        except (NotImplementedError, AttributeError, RuntimeError):
            pass
    return "\n".join(text)


def button(window, name):
    focus(window)
    matches = [item for item in app_widgets() if item.name == name and item.getRoleName() == "push button"]
    check(len(matches) == 1, "Recovery UI exposes one " + name + " button")
    matches[0].queryAction().doAction(0)
    time.sleep(.4)


def files_window():
    window = wait(lambda: command("xdotool", "search", "--onlyvisible", "--name", "^shortcut-source$").splitlines()[0], "Nautilus must open the isolated source folder")
    command("xdotool", "windowmove", window, "500", "40")
    time.sleep(1)
    return window


def collect(window):
    focus(window)
    bounds = geometry(window)
    command("xdotool", "mousemove", str(bounds["X"] + 280), str(bounds["Y"] + 120), "click", "1")
    command("xdotool", "key", "--clearmodifiers", "ctrl+a")
    time.sleep(.3)
    command("xdotool", "key", "--clearmodifiers", "ctrl+alt+shift+e")


try:
    primary_env, primary_data = environment("primary")
    launch(["nautilus", "--new-window", str(source)], primary_env, "shortcut-nautilus-first")
    files = files_window()
    check(command("gdbus", "call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus", "--method", "org.freedesktop.DBus.NameHasOwner", "io.github.dogchenya.gatherpack.NautilusSelection") == "(false,)", "fresh Nautilus starts before the user bridge exists")
    primary = launch([executable], primary_env, "shortcut-primary")
    primary_window = wait(lambda: app_window(primary), "Primary app must start normally")
    expand(primary_window)
    wait(lambda: "重新打开 Nautilus" in app_text(), "First-install UI must explain loading the bridge")
    check(True, "first installation explains that the running Nautilus must load its new bridge")
    collect(files)
    wait(lambda: "桥接尚未加载" in app_text(), "Missing bridge must be visible instead of a silent hotkey")
    check(not (primary_data / "io.github.dogchenya.gatherpack/state.json").exists(), "unloaded bridge cannot collect stale or unrelated paths")
    command("nautilus", "--quit")
    time.sleep(1)
    launch(["nautilus", "--new-window", str(source)], primary_env, "shortcut-nautilus-reloaded")
    files = files_window()
    collect(files)
    primary_state = primary_data / "io.github.dogchenya.gatherpack/state.json"
    wait(lambda: set(json.loads(primary_state.read_text())["paths"]) == {str(source / "one.txt"), str(source / "two.txt")}, "The same app hotkey must collect after Nautilus reload")
    check(True, "actual hotkey recovers after the new bridge loads without restarting the app")
    second_env, second_data = environment("secondary")
    secondary = launch([executable], second_env, "shortcut-secondary")
    secondary_window = wait(lambda: app_window(secondary), "Conflicting second instance must start")
    expand(secondary_window)
    wait(lambda: "快捷键注册失败" in app_text(), "A second app shortcut conflict must be reported")
    check(True, "shortcut conflict with another running instance is visible")
    stop(primary)
    button(secondary_window, "重新注册")
    (source / "retry.txt").write_bytes(b"retry original")
    time.sleep(.5)
    collect(files)
    secondary_state = second_data / "io.github.dogchenya.gatherpack/state.json"
    wait(lambda: len(json.loads(secondary_state.read_text())["paths"]) == 3, "Same-key retry must recover after the conflicting instance exits")
    check(True, "same-key retry restores real foreground collection after conflict removal")
    (source / "caps.txt").write_bytes(b"caps original")
    time.sleep(.5)
    command("xdotool", "key", "Caps_Lock")
    try:
        collect(files)
        wait(lambda: len(json.loads(secondary_state.read_text())["paths"]) == 4, "Caps Lock must not disable the shortcut")
    finally:
        command("xdotool", "key", "Caps_Lock")
    check(True, "real collection shortcut works with Caps Lock enabled")
    check((source / "one.txt").read_bytes() == b"first original" and (source / "two.txt").read_bytes() == b"second original", "recovery preserves original source bytes")
    with open(executable, "rb") as stream:
        sha = sha256_stream(stream)
    report = {"passed": True, "executableSHA256": sha, "checks": checks}
except Exception as error:
    report = {"passed": False, "error": str(error), "checks": checks}
    (evidence / "shortcut-recovery-accessibility.txt").write_text(app_text())
    raise
finally:
    (evidence / "shortcut-recovery-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    for child in reversed(processes):
        stop(child)
    subprocess.run(["nautilus", "--quit"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    for log in logs:
        log.close()
print(json.dumps(report, ensure_ascii=False))
