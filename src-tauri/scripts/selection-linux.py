"""Read only the active accessible file-manager view. Never uses the clipboard."""
import json
import os
import re
import subprocess
from collections import deque
from urllib.parse import urlparse, unquote

def local_paths(uris):
    paths, rejected = [], []
    for uri in uris:
        parsed = urlparse(uri)
        if parsed.scheme != "file" or parsed.netloc not in ("", "localhost"):
            rejected.append(uri + "：非本地项目，未加入")
            continue
        path = unquote(parsed.path)
        if not os.path.isabs(path):
            raise RuntimeError("文件管理器未提供有效绝对路径")
        if path not in paths:
            paths.append(path)
    return paths, rejected


def active_x11_window():
    output = subprocess.check_output(["/usr/bin/xprop", "-root", "_NET_ACTIVE_WINDOW"], text=True, timeout=2)
    match = re.search(r"0x[0-9a-fA-F]+", output)
    if match is None or int(match.group(), 16) == 0:
        raise RuntimeError("请先在文件管理器中选中文件")
    return int(match.group(), 16)


def nautilus_x11_selection():
    window = active_x11_window()
    metadata = subprocess.check_output(["/usr/bin/xprop", "-id", hex(window), "_NET_WM_PID"], text=True, timeout=2)
    pid_match = re.search(r"=\s*(\d+)", metadata)
    if pid_match is None:
        return None
    pid = int(pid_match.group(1))
    with open(f"/proc/{pid}/comm", encoding="utf-8") as process:
        if process.read().strip() != "nautilus":
            return None
    try:
        from gi.repository import Gio, GLib
        proxy = Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_AUTO_START, None, "io.github.dogchenya.gatherpack.NautilusSelection", "/io/github/dogchenya/GatherPack/NautilusSelection", "io.github.dogchenya.gatherpack.NautilusSelection1", None)
        if proxy.get_name_owner() is None:
            raise RuntimeError("桥接尚未加载，请安装 python3-nautilus 并重启 Nautilus")
        response = proxy.call_sync("ReadSelection", GLib.Variant("(u)", (window,)), Gio.DBusCallFlags.NONE, 3000, None)
        result = json.loads(response.unpack()[0])
        if result.get("error"):
            raise RuntimeError(result["error"])
        if result.get("pid") != pid or result.get("window") != window or active_x11_window() != window:
            raise RuntimeError("前台窗口或进程变化，已取消本次收集")
        paths, rejected = local_paths(result["uris"])
        return paths, rejected, "linux-nautilus-live-model"
    except ImportError:
        raise RuntimeError("Nautilus 桥接需要 python3-gi 和 python3-nautilus")


def capture():
    session = os.environ.get("XDG_SESSION_TYPE", "")
    if session == "x11" or (not session and not os.environ.get("WAYLAND_DISPLAY") and os.environ.get("DISPLAY")):
        result = nautilus_x11_selection()
        if result is not None:
            return result
    try:
        import pyatspi
    except ImportError:
        raise RuntimeError("Linux 选择读取需要 python3-pyatspi；请安装后重试")
    desktop = pyatspi.Registry.getDesktop(0)
    active = []
    for app in desktop:
        for frame in app:
            if frame.getState().contains(pyatspi.STATE_ACTIVE):
                active.append((app, frame))
    if len(active) != 1:
        raise RuntimeError("无法唯一确定前台窗口，请检查桌面辅助功能权限")
    app, frame = active[0]
    app_name = (app.name or "").lower()
    if not any(name in app_name for name in ("nautilus", "files", "nemo", "caja", "dolphin", "thunar")):
        raise RuntimeError("前台不是支持的系统文件管理器")
    queue = deque([frame])
    selected = []
    visited = 0
    while queue:
        obj = queue.popleft()
        visited += 1
        if visited > 30000:
            raise RuntimeError("当前辅助功能视图过大，无法安全读取选择")
        try:
            if not obj.getState().contains(pyatspi.STATE_SHOWING):
                continue
            selection = obj.querySelection()
            for i in range(selection.nSelectedChildren):
                child = selection.getSelectedChild(i)
                # Tabs can also implement Selection. Only accept objects exposing file URIs.
                uris = []
                try:
                    link = child.queryHyperlink()
                    uris += [link.getURI(i) for i in range(link.nAnchors)]
                except (NotImplementedError, AttributeError):
                    pass
                try:
                    for attr in child.getAttributes():
                        key, _, value = attr.partition(":")
                        if key in ("uri", "file-uri"):
                            uris.append(value)
                except (NotImplementedError, AttributeError):
                    pass
                if uris:
                    selected.extend(uris)
        except (NotImplementedError, AttributeError):
            pass
        queue.extend(list(obj))
    if not selected:
        raise RuntimeError("未选中文件，或当前文件管理器未通过辅助功能提供选中项 URI；不能可靠读取当前选择")
    paths, rejected = local_paths(selected)
    if not frame.getState().contains(pyatspi.STATE_ACTIVE):
        raise RuntimeError("收集期间前台窗口变化，请重试")
    return paths, rejected, "linux-atspi"

try:
    paths, rejected, source = capture()
    print(json.dumps({"source": source, "paths": paths, "rejected": rejected, "error": None}, ensure_ascii=False))
except Exception as error:
    print(json.dumps({"source": "linux-atspi", "paths": [], "error": str(error)}, ensure_ascii=False))
