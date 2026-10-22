# gatherpack managed Nautilus selection bridge v1; SPDX-License-Identifier: MIT
"""Read the live mapped GTK file selection on demand; never cache selections.

This provider adds no context-menu entries. The extension interface is used only
to load an independent local D-Bus bridge inside Nautilus.
"""
import json
import os
import gi

gi.require_version("Nautilus", "4.0")
gi.require_version("Gtk", "4.0")
gi.require_version("GdkX11", "4.0")
from gi.repository import Gio, GLib, GObject, Gtk, GdkX11, Nautilus

BUS_NAME = "io.github.dogchenya.gatherpack.NautilusSelection"
OBJECT_PATH = "/io/github/dogchenya/GatherPack/NautilusSelection"
INTERFACE = "io.github.dogchenya.gatherpack.NautilusSelection1"
XML = """<node><interface name="io.github.dogchenya.gatherpack.NautilusSelection1">
<method name="ReadSelection"><arg type="u" direction="in" name="expected_window"/>
<arg type="s" direction="out" name="result"/></method></interface></node>"""


def file_for_item(item):
    if isinstance(item, Gtk.TreeListRow):
        item = item.get_item()
    if isinstance(item, Nautilus.FileInfo):
        return item
    if item is None or not hasattr(item, "find_property"):
        return None
    if item.find_property("file") is None:
        return None
    file = item.get_property("file")
    return file if isinstance(file, Nautilus.FileInfo) else None


def read_window_selection(window, expected_window):
    if window is None or not window.is_active():
        raise RuntimeError("Nautilus 不是前台活动窗口")
    surface = window.get_surface()
    # X11 baseline: compare the actual active surface, including multiple windows/tabs.
    if surface is None or not isinstance(surface, GdkX11.X11Surface):
        raise RuntimeError("当前桥接需要 Nautilus X11 会话")
    if surface.get_xid() != expected_window:
        raise RuntimeError("前台窗口已经变化，未读取后台选择")
    selections = []
    pending = [window]
    while pending:
        widget = pending.pop()
        if not widget.get_mapped():
            continue
        if isinstance(widget, (Gtk.GridView, Gtk.ColumnView, Gtk.ListView)):
            model = widget.get_model()
            if model is not None and hasattr(model, "is_selected"):
                # Verify the model is a file model even when nothing is selected.
                file_model = any(file_for_item(model.get_item(i)) is not None for i in range(min(model.get_n_items(), 8)))
                if file_model:
                    files = []
                    for i in range(model.get_n_items()):
                        if model.is_selected(i):
                            file = file_for_item(model.get_item(i))
                            if file is None:
                                raise RuntimeError("当前文件视图包含无法识别的选中项")
                            files.append(file.get_location().get_uri())
                    selections.append(files)
        child = widget.get_first_child()
        while child is not None:
            pending.append(child)
            child = child.get_next_sibling()
    if len(selections) != 1:
        raise RuntimeError("无法唯一确定当前文件视图；未读取其他标签页的选择")
    if not selections[0]:
        raise RuntimeError("请先选中文件或文件夹")
    return list(dict.fromkeys(selections[0]))


class GatherPackSelectionBridge(GObject.GObject, Nautilus.MenuProvider):
    def __init__(self):
        super().__init__()
        self.owner = Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE, self.on_bus, None, None)

    def on_bus(self, connection, name):
        self.connection = connection
        info = Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0]
        self.registration = connection.register_object(OBJECT_PATH, info, self.on_method, None, None)

    def on_method(self, connection, sender, path, interface, method, parameters, invocation):
        try:
            app = Gio.Application.get_default()
            window = app.get_active_window() if app is not None else None
            uris = read_window_selection(window, parameters.unpack()[0])
            result = {"uris": uris, "pid": os.getpid(), "window": parameters.unpack()[0], "error": None}
        except Exception as error:
            result = {"uris": [], "pid": os.getpid(), "error": str(error)}
        invocation.return_value(GLib.Variant("(s)", (json.dumps(result, ensure_ascii=False),)))

    def get_file_items(self, *args):
        return []

    def get_background_items(self, *args):
        return []
