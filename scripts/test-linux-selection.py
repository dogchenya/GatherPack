"""Real Nautilus/X11 selection tests in an isolated desktop session."""
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import zipfile
import hashlib
from collections import deque
from file_hash import sha256_stream

evidence = Path("/work/artifacts/validation")
checks = []
executable = os.environ.get("GATHERPACK_TEST_EXECUTABLE", "/var/cache/easy-pack/target/release/gatherpack")
root = Path(tempfile.mkdtemp(prefix="selection-", dir=Path.home()))
first, second = root / "first", root / "second"
first.mkdir(); second.mkdir()
(first / "a.txt").write_text("first", encoding="utf-8")
(first / "folder").mkdir(); (first / "folder/child.txt").write_text("nested")
(second / "b.txt").write_text("second", encoding="utf-8")
log = (evidence / "nautilus.log").open("w")

def command(*args):
    result = subprocess.run(list(args), check=True, capture_output=True, text=True, timeout=15)
    return result.stdout.strip()

def check(condition, name):
    checks.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)

def wait_window(title):
    for _ in range(600):
        result = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", "^" + title + "$"], capture_output=True, text=True)
        windows = result.stdout.split()
        if len(windows) == 1:
            return windows[0]
        time.sleep(.1)
    raise RuntimeError("Nautilus window not found: " + title)

def capture():
    output = command("python3", "/work/src-tauri/scripts/selection-linux.py")
    (evidence / "linux-selection-latest.json").write_text(output)
    return json.loads(output)

def focus(window):
    command("xdotool", "windowactivate", "--sync", window)
    time.sleep(.3)

def keys(chord):
    command("xdotool", "key", "--clearmodifiers", chord)
    time.sleep(.3)

def click_content(window, blank=False):
    geometry = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", window).splitlines())
    extents = command("xprop", "-id", window, "_GTK_FRAME_EXTENTS")
    numbers = re.findall(r"\d+", extents.split("=", 1)[-1]) if "=" in extents else []
    left, top = (int(numbers[0]), int(numbers[2])) if len(numbers) == 4 else (0, 0)
    x = int(geometry["X"]) + left + (500 if blank else 280)
    y = int(geometry["Y"]) + top + (400 if blank else 120)
    with (evidence / "linux-selection-coordinates.jsonl").open("a") as trace:
        trace.write(json.dumps({"window": window, "geometry": geometry, "x": x, "y": y, "blank": blank}) + "\n")
    command("xdotool", "mousemove", str(x), str(y), "click", "1")
    time.sleep(.2)
    return x, y

def screenshot():
    import gi
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk
    Gdk.init([])
    window = Gdk.get_default_root_window()
    image = Gdk.pixbuf_get_from_window(window, 0, 0, window.get_width(), window.get_height())
    image.savev(str(evidence / "linux-selection.png"), "png", [], [])

def click_app_button(name):
    import pyatspi
    focus(app_window)
    desktop = pyatspi.Registry.getDesktop(0)
    apps = [app for app in desktop if "gatherpack" in (app.name or "").lower()]
    queue, matches, trace = deque(apps), [], []
    while queue and len(trace) < 10000:
        widget = queue.popleft()
        trace.append([widget.getRoleName(), widget.name])
        if widget.name == name and widget.getRoleName() in {"push button", "toggle button"}: matches.append(widget)
        queue.extend(list(widget))
    (evidence / "linux-app-accessibility.json").write_text(json.dumps(trace, ensure_ascii=False))
    check(len(matches) == 1, "native WebView exposes one accessible " + name + " button")
    component = matches[0].queryComponent()
    component.scrollTo(pyatspi.SCROLL_ANYWHERE)
    component.grabFocus()
    time.sleep(.2)
    bounds = component.getExtents(pyatspi.DESKTOP_COORDS)
    check(bounds.width > 0 and bounds.height > 0, "UI button has a visible interaction target")
    with (evidence / "linux-button-coordinates.jsonl").open("a") as trace_file:
        trace_file.write(json.dumps({"name": name, "x": bounds.x, "y": bounds.y, "width": bounds.width, "height": bounds.height}) + "\n")
    command("xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2))
    time.sleep(.15)
    command("xdotool", "click", "1")

def wait_native_dialog(title):
    for _ in range(300):
        result = subprocess.run(["xdotool", "search", "--onlyvisible", "--class", "gatherpack"], capture_output=True, text=True)
        inventory = [{"window": window, "title": command("xdotool", "getwindowname", window)} for window in result.stdout.split()]
        (evidence / "linux-native-window-inventory.json").write_text(json.dumps(inventory, ensure_ascii=False))
        windows = [item["window"] for item in inventory if item["title"] == title]
        if len(windows) == 1:
            focus(windows[0])
            return windows[0]
        time.sleep(.1)
    raise RuntimeError("Native chooser not found: " + title)

def toggle_autostart():
    import pyatspi
    queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
    matches = []
    while queue:
        widget = queue.popleft()
        if widget.name == "开机启动" and widget.getRoleName() == "check box": matches.append(widget)
        queue.extend(list(widget))
    check(len(matches) == 1, "settings exposes one native-accessible autostart checkbox")
    matches[0].queryAction().doAction(0)
    time.sleep(.2)

def enter_native_path(dialog, path):
    import pyatspi
    if path.is_dir():
        # GTK's Recent projection only lists recent locations. Enter the real
        # filesystem browser through its visible Home sidebar before navigation.
        queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
        homes = []
        while queue:
            widget = queue.popleft()
            if widget.name == "Home" and widget.getRoleName() == "label" and widget.getState().contains(pyatspi.STATE_SHOWING): homes.append(widget)
            queue.extend(list(widget))
        check(len(homes) == 1, "folder chooser exposes its visible filesystem Home location")
        bounds = homes[0].queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
        command("xdotool", "mousemove", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2), "click", "1")
        time.sleep(.5)
    keys("ctrl+l")
    queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
    focused = []
    while queue:
        widget = queue.popleft()
        if widget.getState().contains(pyatspi.STATE_FOCUSED):
            try:
                widget.queryEditableText()
                focused.append(widget)
            except (NotImplementedError, AttributeError):
                pass
        queue.extend(list(widget))
    check(len(focused) == 1, "native chooser focuses one editable location field")
    # Do not append a separator: GTK would complete to the first child folder.
    value = str(path)
    check(focused[0].queryEditableText().setTextContents(value), "native chooser accepts the full location through accessibility input")
    # Keep the caret away from GTK's inline child-directory completion.
    focused[0].queryText().setCaretOffset(0)
    (evidence / "linux-native-location.txt").write_text(focused[0].queryText().getText(0, -1))
    entry_action = focused[0].queryAction()
    names = [entry_action.getName(i) for i in range(entry_action.nActions)]
    check("activate" in names, "native location entry exposes its activate action")
    entry_action.doAction(names.index("activate"))
    time.sleep(.5)
    def chooser_visible():
        visible = subprocess.run(["xdotool", "search", "--onlyvisible", "--class", "gatherpack"], capture_output=True, text=True)
        return dialog in visible.stdout.split()
    still_open = chooser_visible()
    if still_open:
        for _ in range(30):
            if not chooser_visible(): return
            queue = deque(app for app in pyatspi.Registry.getDesktop(0) if "gatherpack" in (app.name or "").lower())
            buttons = []
            trace = []
            while queue:
                widget = queue.popleft()
                trace.append({"role": widget.getRoleName(), "name": widget.name, "states": widget.getState().getStates()})
                if widget.getRoleName() == "push button" and (widget.name or "").replace("_", "").casefold() in {"open", "select", "save", "打开", "选择", "保存"}:
                    if widget.getState().contains(pyatspi.STATE_ENABLED): buttons.append(widget)
                queue.extend(list(widget))
            if len(buttons) == 1:
                buttons[0].queryAction().doAction(0)
                time.sleep(.3)
                return
            time.sleep(.1)
        (evidence / "linux-native-confirmation-tree.json").write_text(json.dumps(trace, ensure_ascii=False, default=str))
        raise RuntimeError("Native chooser confirmation is not uniquely enabled")

process = subprocess.Popen(["nautilus", "--new-window", str(first)], stdout=log, stderr=log)
try:
    first_window = wait_window("first")
    focus(first_window)
    # A window title is available before Nautilus finishes populating its view.
    time.sleep(1.5)
    click_content(first_window)
    keys("ctrl+a")
    result = capture()
    for _ in range(5):
        if result["error"] is None: break
        focus(first_window); click_content(first_window); keys("ctrl+a")
        result = capture()
    (evidence / "linux-selection-first.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    check(result["error"] is None, "Nautilus live selection bridge returns successfully")
    check(set(result["paths"]) == {str(first / "a.txt"), str(first / "folder")}, "mixed file/folder selection is read directly")
    command("nautilus", "--new-window", str(second))
    second_window = wait_window("second")
    focus(second_window); time.sleep(1)
    click_content(second_window)
    keys("ctrl+a")
    result = capture()
    check(result["error"] is None and result["paths"] == [str(second / "b.txt")], "foreground second window excludes background selection")
    keys("ctrl+t"); keys("alt+Up"); wait_window(root.name); time.sleep(1.5)
    click_content(second_window); keys("Return")
    time.sleep(1); click_content(second_window); keys("ctrl+a")
    result = capture()
    check(result["error"] is None and set(result["paths"]) == {str(first / "a.txt"), str(first / "folder")}, "new current tab reads its own selection")
    keys("ctrl+Page_Up")
    result = capture()
    check(result["error"] is None and result["paths"] == [str(second / "b.txt")], "switching tabs does not reuse the prior tab selection")
    click_content(second_window, blank=True)
    result = capture()
    check(result["error"] is not None and not result["paths"], "empty current selection does not reuse previous paths")
    focus(first_window); keys("ctrl+a")
    before = command("xdotool", "getactivewindow")
    capture()
    check(command("xdotool", "getactivewindow") == before, "selection query preserves foreground focus")
    app_log = (evidence / "linux-app.log").open("w")
    app_data = root / "app-data"
    app = subprocess.Popen([executable], env={**os.environ, "XDG_DATA_HOME": str(app_data)}, stdout=app_log, stderr=app_log)
    try:
        time.sleep(1.5)
        state_file = app_data / "io.github.dogchenya.gatherpack/state.json"
        # This is a dedicated test account; no personal application data is used.
        check(not state_file.exists(), "global shortcut test starts with a fresh isolated profile")
        subprocess.run(["xclip", "-selection", "clipboard"], input=b"unrelated clipboard sentinel", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        focus(first_window); click_content(first_window); keys("ctrl+a")
        before = command("xdotool", "getactivewindow")
        keys("ctrl+alt+shift+e")
        for _ in range(100):
            if state_file.exists() and len(json.loads(state_file.read_text())["paths"]) == 2: break
            time.sleep(.1)
        saved = json.loads(state_file.read_text())
        check(set(saved["paths"]) == {str(first / "a.txt"), str(first / "folder")}, "real global hotkey appends Nautilus mixed selection through Rust")
        check(command("xdotool", "getactivewindow") == before, "real collection hotkey does not steal focus")
        check(command("xclip", "-o", "-selection", "clipboard") == "unrelated clipboard sentinel", "collection preserves unrelated clipboard contents")
        focus(second_window); click_content(second_window); keys("ctrl+a"); keys("ctrl+alt+shift+e")
        for _ in range(100):
            if len(json.loads(state_file.read_text())["paths"]) == 3: break
            time.sleep(.1)
        check(len(json.loads(state_file.read_text())["paths"]) == 3, "real hotkey appends a second source directory")
        click_content(second_window, blank=True); keys("ctrl+alt+shift+e"); time.sleep(.5)
        check(len(json.loads(state_file.read_text())["paths"]) == 3, "empty hotkey capture leaves the collection unchanged")
        drag_source = second / "drag-only.txt"
        drag_source.write_bytes(b"native drag source remains intact")
        time.sleep(.7)
        app_window = command("xdotool", "search", "--onlyvisible", "--name", "^GatherPack").splitlines()[0]
        # The initial edge icon may already be hidden; reveal it before moving.
        dock = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        command("xdotool", "mousemove", "--sync", str(int(dock["X"]) + int(dock["WIDTH"]) // 2), str(int(dock["Y"]) + 40))
        time.sleep(.5)
        command("xdotool", "windowmove", app_window, "1120", "50")
        time.sleep(.5)
        app_geometry = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        focus(second_window); sx, sy = click_content(second_window); keys("ctrl+a")
        command("xdotool", "mousemove", str(sx), str(sy), "mousedown", "1")
        command("xdotool", "mousemove", str(sx + 30), str(sy + 30))
        time.sleep(.2)
        tx = int(app_geometry["X"]) + int(app_geometry["WIDTH"]) // 2
        ty = int(app_geometry["Y"]) + int(app_geometry["HEIGHT"]) // 2
        for i in range(1, 11):
            command("xdotool", "mousemove", str(sx + (tx - sx) * i // 10), str(sy + (ty - sy) * i // 10))
            time.sleep(.05)
        time.sleep(.5)
        screenshot()
        command("xdotool", "mouseup", "1")
        for _ in range(100):
            if len(json.loads(state_file.read_text())["paths"]) == 4: break
            time.sleep(.1)
        check(str(drag_source) in json.loads(state_file.read_text())["paths"], "native Nautilus file drag is received by the Tauri window")
        check(drag_source.read_bytes() == b"native drag source remains intact", "native drag preserves source bytes")
        # Drag the same selection onto the hidden strip: restoration alone must
        # not consume the native drop, and existing sources must stay unique.
        time.sleep(.5)
        click_app_button("收起面板")
        time.sleep(.4)
        command("xdotool", "windowmove", app_window, "1176", "50")
        command("xdotool", "mousemove", "600", "500")
        for _ in range(100):
            dock = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
            if int(dock["WIDTH"]) == 10 and int(dock["X"]) == 1270: break
            time.sleep(.1)
        check(int(dock["WIDTH"]) == 10 and int(dock["X"]) == 1270, "collection icon hides before a real Nautilus drag")
        focus(second_window); sx, sy = click_content(second_window); keys("ctrl+a")
        command("xdotool", "mousemove", str(sx), str(sy), "mousedown", "1")
        tx, ty = 1275, int(dock["Y"]) + 40
        for i in range(1, 11):
            command("xdotool", "mousemove", str(sx + (tx - sx) * i // 10), str(sy + (ty - sy) * i // 10))
            time.sleep(.05)
        time.sleep(.6)
        command("xdotool", "mouseup", "1")
        for _ in range(100):
            current = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
            if int(current["WIDTH"]) == 440: break
            time.sleep(.1)
        check(int(current["WIDTH"]) == 440, "a native drop on the hidden strip restores and opens the collection")
        check(len(json.loads(state_file.read_text())["paths"]) == 4, "dropping existing files on the edge strip does not duplicate sources")
        time.sleep(1)
        screenshot()
        picked_source = root / "picker-only.txt"
        picked_source.write_bytes(b"native picker source")
        focus(app_window)
        app_geometry = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        app_extents = command("xprop", "-id", app_window, "_GTK_FRAME_EXTENTS")
        values = re.findall(r"\d+", app_extents.split("=", 1)[-1]) if "=" in app_extents else []
        left, right, top, bottom = map(int, values) if len(values) == 4 else (0, 0, 0, 0)
        px = int(app_geometry["X"]) + int(app_geometry["WIDTH"]) - right - 88
        py = int(app_geometry["Y"]) + top + 144
        (evidence / "linux-picker-geometry.json").write_text(json.dumps({"geometry": app_geometry, "extents": app_extents, "click": [px, py]}))
        click_app_button("添加文件")
        # Match UTF-8 titles after class lookup: X11 WM_NAME may be compound text.
        dialog = wait_native_dialog("选择文件")
        title = command("xdotool", "getwindowname", dialog)
        command("python3", "/work/scripts/validation-screenshot-linux.py", str(evidence / "linux-picker.png"))
        (evidence / "linux-picker-dialog.txt").write_text(title)
        check(dialog != app_window and any(s in title.lower() for s in ("open", "file", "打开", "选择")), "add files opens a native file picker")
        enter_native_path(dialog, picked_source)
        for _ in range(100):
            if str(picked_source) in json.loads(state_file.read_text())["paths"]: break
            time.sleep(.1)
        check(str(picked_source) in json.loads(state_file.read_text())["paths"], "native picker selection reaches the persistent collection")
        check(picked_source.read_bytes() == b"native picker source", "native picker does not modify its source")
        for _ in range(30):
            if "_NET_WM_STATE_ABOVE" in command("xprop", "-id", app_window, "_NET_WM_STATE"): break
            time.sleep(.1)
        check("_NET_WM_STATE_ABOVE" in command("xprop", "-id", app_window, "_NET_WM_STATE"), "floating window returns to always-on-top after picker closes")
        click_app_button("置顶窗口")
        time.sleep(.4)
        check("_NET_WM_STATE_ABOVE" not in command("xprop", "-id", app_window, "_NET_WM_STATE"), "pin button disables the actual native always-on-top state")
        picked_folder = root / "selected-folder"
        picked_folder.mkdir(); (picked_folder / "child.txt").write_bytes(b"picked folder child")
        (picked_folder / ".hidden").write_bytes(b"hidden child"); (picked_folder / "empty").mkdir()
        click_app_button("添加文件夹")
        folder_dialog = wait_native_dialog("选择文件夹")
        check(folder_dialog != app_window, "add folder opens its native folder chooser")
        enter_native_path(folder_dialog, picked_folder)
        for _ in range(100):
            if str(picked_folder) in json.loads(state_file.read_text())["paths"]: break
            time.sleep(.1)
        check(str(picked_folder) in json.loads(state_file.read_text())["paths"], "native folder chooser adds the whole folder")
        time.sleep(.4)
        check("_NET_WM_STATE_ABOVE" not in command("xprop", "-id", app_window, "_NET_WM_STATE"), "closing a native chooser preserves the user's unpinned preference")
        click_app_button("置顶窗口")
        time.sleep(.5)
        before_graph = state_file.read_bytes()
        click_app_button("文件关系图")
        click_app_button("文件夹：selected-folder")
        click_app_button("文件：.hidden")
        click_app_button("放大关系图")
        click_app_button("适应画布")
        screenshot()
        (evidence / "linux-graph.png").write_bytes((evidence / "linux-selection.png").read_bytes())
        check(state_file.read_bytes() == before_graph, "file graph exploration preserves the collection and pack settings")
        click_app_button("文件夹：selected-folder")
        click_app_button("收集清单")
        click_app_button("检查并打包 →"); time.sleep(.5)
        click_app_button("选择保存位置")
        save_dialog = wait_native_dialog("保存压缩包")
        output = root / "native-ui.zip"
        check(save_dialog != app_window, "pack confirmation opens a native save dialog")
        enter_native_path(save_dialog, output)
        time.sleep(.5); click_app_button("开始打包")
        report_file = app_data / "io.github.dogchenya.gatherpack/last-report.json"
        for _ in range(150):
            if output.exists() and report_file.exists(): break
            time.sleep(.1)
        report = json.loads(report_file.read_text())
        check(report["delivered"] and report["output"] == str(output), "complete native UI flow delivers the selected ZIP output")
        with zipfile.ZipFile(output) as archive:
            expected = {"a.txt": b"first", "folder/child.txt": b"nested", "b.txt": b"second", "drag-only.txt": b"native drag source remains intact", "picker-only.txt": b"native picker source", "selected-folder/child.txt": b"picked folder child", "selected-folder/.hidden": b"hidden child"}
            check(all(archive.read(name) == content for name, content in expected.items()) and "selected-folder/empty/" in archive.namelist(), "UI-created ZIP restores all selected content, hidden files and empty folder")
        check(len(report["written"]) == 7 and not report["failed"] and not report["skipped"], "native UI result report matches the seven archived files")
        check(len(json.loads(state_file.read_text())["paths"]) == 6, "native UI packing retains the six public collection entries")
        relocated = root / "relocated-picker-only.txt"
        picked_source.rename(relocated)
        click_app_button("目录与问题")
        click_app_button("重新检查")
        time.sleep(.5)
        click_app_button("重新定位文件")
        relink_dialog = wait_native_dialog("重新定位来源（替换清单引用）")
        enter_native_path(relink_dialog, relocated)
        for _ in range(100):
            if str(relocated) in json.loads(state_file.read_text())["paths"]: break
            time.sleep(.1)
        paths = json.loads(state_file.read_text())["paths"]
        check(str(relocated) in paths and str(picked_source) not in paths and len(paths) == 6, "native relink picker replaces the stale reference without duplicating collection entries")
        check(relocated.read_bytes() == b"native picker source", "relink preserves the chosen source bytes")
        click_app_button("撤销")
        time.sleep(.4)
        paths = json.loads(state_file.read_text())["paths"]
        check(str(picked_source) in paths and str(relocated) not in paths and len(paths) == 6, "UI undo restores the original reference and removes the relink replacement")
        relocated.rename(picked_source)
        for enabled in (True, False):
            click_app_button("设置"); time.sleep(.3)
            toggle_autostart(); click_app_button("保存设置")
            for _ in range(100):
                if json.loads(state_file.read_text())["settings"]["autostart"] == enabled: break
                time.sleep(.1)
            check(json.loads(state_file.read_text())["settings"]["autostart"] == enabled, "settings UI persists autostart=" + str(enabled))
            launches = list((Path.home() / ".config/autostart").glob("*.desktop"))
            registered = any(executable in file.read_text() and "Hidden=true" not in file.read_text() for file in launches)
            check(registered == enabled, "actual desktop startup registration matches setting=" + str(enabled))
        click_app_button("本地收集 · 快捷键已注册")
        click_app_button("重新注册")
        click_app_button("完成")
        retry_source = first / "shortcut-retry.txt"
        retry_source.write_bytes(b"shortcut retry source")
        # A resized shelf can cover Nautilus' content coordinate on GNOME 42.
        # Collapse it before selecting; otherwise Ctrl+A selects the WebView.
        click_app_button("收起面板")
        focus(first_window); time.sleep(.5); click_content(first_window); keys("ctrl+a"); keys("ctrl+alt+shift+e")
        for _ in range(100):
            if str(retry_source) in json.loads(state_file.read_text())["paths"]: break
            time.sleep(.1)
        check(str(retry_source) in json.loads(state_file.read_text())["paths"], "re-register button restores actual foreground collection hotkey")
        click_app_button("展开收集面板")
        focus(app_window)
        expanded_before = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        ex, ey = int(expanded_before["X"]), int(expanded_before["Y"])
        command("xdotool", "mousemove", str(ex + 180), str(ey + 25), "mousedown", "1")
        for i in range(1, 6):
            command("xdotool", "mousemove", str(ex + 180 + i * 9), str(ey + 25 + i * 5)); time.sleep(.05)
        command("xdotool", "mouseup", "1"); time.sleep(.3)
        expanded_after = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        check(int(expanded_after["X"]) > ex + 20 and int(expanded_after["Y"]) > ey + 10, "expanded panel moves from its broad sticky header")
        click_app_button("收起面板"); time.sleep(.4)
        compact = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        check(int(compact["WIDTH"]) == 104 and int(compact["HEIGHT"]) == 112, "collapse returns to the compact floating window")
        cx, cy = int(compact["X"]), int(compact["Y"])
        command("xdotool", "mousemove", str(cx + 52), str(cy + 7), "mousedown", "1")
        time.sleep(.2)
        for i in range(1, 6):
            command("xdotool", "mousemove", str(cx + 52 + i * 8), str(cy + 7 + i * 6))
            time.sleep(.05)
        command("xdotool", "mouseup", "1"); time.sleep(.3)
        moved = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        check(int(moved["X"]) > cx + 15 and int(moved["Y"]) > cy + 10, "the app drag handle moves its real native window")
        mx, my = int(moved["X"]), int(moved["Y"])
        command("xdotool", "mousemove", str(mx + 52), str(my + 48), "mousedown", "1")
        for i in range(1, 7):
            command("xdotool", "mousemove", str(mx + 52 + i * 7), str(my + 48 + i * 4)); time.sleep(.05)
        command("xdotool", "mouseup", "1"); time.sleep(.3)
        icon_moved = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        (evidence / "linux-drag-geometry.json").write_text(json.dumps({"expandedBefore": expanded_before, "expandedAfter": expanded_after, "compactBefore": compact, "handleAfter": moved, "iconAfter": icon_moved}, indent=2))
        check(int(icon_moved["X"]) > mx + 20 and int(icon_moved["Y"]) > my + 10, "dragging the whole compact icon moves the native window")
        check(int(icon_moved["WIDTH"]) == 104 and int(icon_moved["HEIGHT"]) == 112, "dragging compact icon does not expand panel")
        screenshot()
        (evidence / "linux-compact.png").write_bytes((evidence / "linux-selection.png").read_bytes())
        command("xdotool", "mousemove", str(int(icon_moved["X"]) + 52), str(int(icon_moved["Y"]) + 44), "click", "1")
        time.sleep(.4)
        expanded = dict(line.split("=", 1) for line in command("xdotool", "getwindowgeometry", "--shell", app_window).splitlines())
        check(int(expanded["WIDTH"]) >= 420, "clicking the compact icon reopens the collection panel")
        screenshot()
        click_app_button("应用菜单"); time.sleep(.2)
        click_app_button("退出 GatherPack")
        check(app.wait(timeout=10) == 0, "application menu exits normally after packing")
    except Exception:
        command("python3", "/work/scripts/validation-screenshot-linux.py", str(evidence / "linux-ui-failure.png"))
        if state_file.exists():
            (evidence / "linux-ui-state.json").write_text(state_file.read_text())
        raise
    finally:
        app.terminate(); app.wait(timeout=10); app_log.close()
    with open(executable, "rb") as binary:
        executable_hash = sha256_stream(binary)
    (evidence / "linux-selection-report.json").write_text(json.dumps({"passed": True, "executable": executable, "executableSHA256": executable_hash, "packageSHA256": os.environ.get("GATHERPACK_TEST_PACKAGE_SHA256"), "checks": checks}, ensure_ascii=False, indent=2))
    print(json.dumps({"passed": True, "checks": checks}, ensure_ascii=False))
except Exception as error:
    try: screenshot()
    except Exception: pass
    (evidence / "linux-selection-report.json").write_text(json.dumps({"passed": False, "error": str(error), "checks": checks}, ensure_ascii=False, indent=2))
    print(log.name)
    raise
finally:
    try:
        subprocess.run(["nautilus", "--quit"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    except subprocess.TimeoutExpired:
        process.terminate()
    log.close()
