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
from gi.repository import GLib

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
        except (subprocess.CalledProcessError, FileNotFoundError, ProcessLookupError, GLib.Error):
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
    wait(lambda: "展开收集面板" in app_text(), "The real WebView must finish mounting before the compact click")
    command("xdotool", "windowmove", window, "20", "40")
    focus(window)
    bounds = geometry(window)
    command("xdotool", "mousemove", str(bounds["X"] + 52), str(bounds["Y"] + 44), "click", "1")
    wait(lambda: geometry(window)["WIDTH"] >= 420, "Compact click must open the panel")


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
        try:
            text.append(item.name or "")
            text.append(item.queryText().getText(0, -1))
        except (NotImplementedError, AttributeError, RuntimeError, GLib.Error):
            pass
    return "\n".join(text)


def button(window, name):
    # The new dialogs correctly close on Escape; activation must preserve them.
    command("xdotool", "windowactivate", "--sync", window)
    time.sleep(.3)
    matches = [item for item in app_widgets() if item.name == name and item.getRoleName() == "push button"]
    check(len(matches) == 1, "Recovery UI exposes one " + name + " button")
    import pyatspi
    component = matches[0].queryComponent()
    component.scrollTo(pyatspi.SCROLL_ANYWHERE)
    component.grabFocus()
    bounds = component.getExtents(pyatspi.DESKTOP_COORDS)
    command("xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2))
    time.sleep(.15)
    command("xdotool", "click", "1")
    time.sleep(.4)


def files_window():
    window = wait(lambda: command("xdotool", "search", "--onlyvisible", "--name", "^shortcut-source$").splitlines()[0], "Nautilus must open the isolated source folder")
    command("xdotool", "windowmove", window, "500", "40")
    time.sleep(1)
    return window


def collect(window, clear_modifiers=True):
    # Keep the always-on-top panel from covering a coordinate in Nautilus.
    panels = [item for item in app_widgets() if item.name == "收起面板" and item.getRoleName() == "push button"]
    for item in panels:
        item.queryAction().doAction(0)
    time.sleep(.3)
    focus(window)
    bounds = geometry(window)
    command("xdotool", "mousemove", str(bounds["X"] + 280), str(bounds["Y"] + 120), "click", "1")
    check(command("xdotool", "getactivewindow") == window, "recovery shortcut starts in the real foreground file manager")
    command("xdotool", "key", "--clearmodifiers", "ctrl+a")
    time.sleep(.3)
    if clear_modifiers:
        command("xdotool", "key", "--clearmodifiers", "ctrl+alt+shift+e")
    else:
        command("xdotool", "key", "ctrl+alt+shift+e")


try:
    primary_env, primary_data = environment("primary")
    first_nautilus = launch(["nautilus", "--new-window", str(source)], primary_env, "shortcut-nautilus-first")
    files = files_window()
    check(command("gdbus", "call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus", "--method", "org.freedesktop.DBus.NameHasOwner", "io.github.dogchenya.gatherpack.NautilusSelection") == "(false,)", "fresh Nautilus starts before the user bridge exists")
    primary = launch([executable], primary_env, "shortcut-primary")
    primary_window = wait(lambda: app_window(primary), "Primary app must start normally")
    expand(primary_window)
    wait(lambda: "nautilus -q" in app_text(), "First-install UI must explain exiting the background process")
    check("已安装，无需重复安装" in app_text(), "installed loader is diagnosed without asking to install it again")
    check(True, "first installation explains that the running Nautilus must load its new bridge")
    collect(files)
    wait(lambda: "桥接尚未加载" in app_text(), "Missing bridge must be visible instead of a silent hotkey")
    check("已安装，无需重复安装" in app_text() and "sudo apt install" not in app_text(), "actual hotkey reports an unloaded bridge separately from missing dependencies")
    check(not (primary_data / "io.github.dogchenya.gatherpack/state.json").exists(), "unloaded bridge cannot collect stale or unrelated paths")
    # Restart only the file-manager process created by this isolated test.
    stop(first_nautilus)
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
    button(secondary_window, "设置")
    wait(lambda: "保存设置" in app_text(), "Settings dialog must mount before conflict recovery")
    wait(lambda: "快捷键注册失败" in app_text(), "A second app shortcut conflict must be reported")
    check(True, "shortcut conflict with another running instance is visible")
    stop(primary)
    button(secondary_window, "保存设置")
    (source / "retry.txt").write_bytes(b"retry original")
    time.sleep(.5)
    collect(files)
    secondary_state = second_data / "io.github.dogchenya.gatherpack/state.json"
    wait(lambda: len(json.loads(secondary_state.read_text())["paths"]) == 3, "Same-key retry must recover after the conflicting instance exits")
    check(True, "saving the unchanged shortcut restores real collection after conflict removal")
    expand(secondary_window)
    button(secondary_window, "本地收集 · 快捷键已注册")
    button(secondary_window, "重新注册")
    button(secondary_window, "完成")
    (source / "retry-again.txt").write_bytes(b"retry again original")
    time.sleep(.5)
    collect(files)
    wait(lambda: len(json.loads(secondary_state.read_text())["paths"]) == 4, "Explicit re-registration must preserve a working shortcut")
    check(True, "explicit re-registration preserves actual foreground collection")
    (source / "caps.txt").write_bytes(b"caps original")
    time.sleep(.5)
    command("xdotool", "key", "Caps_Lock")
    try:
        import gi
        gi.require_version("Gdk", "3.0")
        from gi.repository import Gdk
        Gdk.init([])
        check(Gdk.Keymap.get_default().get_caps_lock_state(), "Caps Lock is actually enabled during the shortcut test")
        collect(files, clear_modifiers=False)
        wait(lambda: len(json.loads(secondary_state.read_text())["paths"]) == 5, "Caps Lock must not disable the shortcut")
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
    for log in logs:
        log.close()
print(json.dumps(report, ensure_ascii=False))
