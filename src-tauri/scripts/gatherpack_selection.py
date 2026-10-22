# gatherpack managed Nautilus selection bridge v1; SPDX-License-Identifier: MIT
"""Read the live mapped GTK file selection on demand; never cache selections.

This provider adds no context-menu entries. The extension interface is used only
to load an independent local D-Bus bridge inside Nautilus.
"""
import json
import os
import gi

try:
    gi.require_version("Nautilus", "4.0")
    GTK_VERSION = "4.0"
except ValueError:
    gi.require_version("Nautilus", "3.0")
    GTK_VERSION = "3.0"
gi.require_version("Gtk", GTK_VERSION)
gi.require_version("GdkX11", GTK_VERSION)
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
    surface = window.get_surface() if GTK_VERSION == "4.0" else window.get_window()
    # X11 baseline: compare the actual active surface, including multiple windows/tabs.
    surface_type = GdkX11.X11Surface if GTK_VERSION == "4.0" else GdkX11.X11Window
    if surface is None or not isinstance(surface, surface_type):
        raise RuntimeError("当前桥接需要 Nautilus X11 会话")
    if surface.get_xid() != expected_window:
        raise RuntimeError("前台窗口已经变化，未读取后台选择")
    selections = []
    pending = [window]
    while pending:
        widget = pending.pop()
        if not widget.get_mapped():
            continue
        if GTK_VERSION == "3.0":
            if widget.__gtype__.name in ("NautilusCanvasView", "NautilusListView"):
                selections.append(read_gtk3_selection(widget))
            if isinstance(widget, Gtk.Container):
                pending.extend(widget.get_children())
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


def read_gtk3_selection(view):
    """Read Nautilus 42's live GObject selection property, not menu callbacks.

    That property returns an owned GList of FileInfo objects. Its gpointer type
    is not introspectable in Python; use public GObject/GLib/FileInfo C APIs to
    read and release it. No private structure offsets or cached paths are used.
    """
    import ctypes

    prop = view.find_property("selection")
    if prop is None or prop.value_type.name != "gpointer":
        raise RuntimeError("当前 Nautilus GTK3 视图不提供实时选择属性")
    if view.get_property("loading"):
        raise RuntimeError("文件视图正在加载，请稍后重试")
    class Node(ctypes.Structure):
        pass
    Node._fields_ = [("data", ctypes.c_void_p), ("next", ctypes.POINTER(Node)), ("prev", ctypes.POINTER(Node))]
    glib = ctypes.CDLL("libglib-2.0.so.0")
    objects = ctypes.CDLL("libgobject-2.0.so.0")
    files = ctypes.CDLL("libnautilus-extension.so.1")
    capsule_pointer = ctypes.pythonapi.PyCapsule_GetPointer
    capsule_pointer.argtypes = [ctypes.py_object, ctypes.c_char_p]
    capsule_pointer.restype = ctypes.c_void_p
    objects.g_object_get.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    objects.g_object_get.restype = None
    objects.g_object_unref.argtypes = [ctypes.c_void_p]
    objects.g_object_unref.restype = None
    objects.g_type_check_instance_is_a.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    objects.g_type_check_instance_is_a.restype = ctypes.c_int
    files.nautilus_file_info_get_type.restype = ctypes.c_size_t
    files.nautilus_file_info_get_uri.argtypes = [ctypes.c_void_p]
    files.nautilus_file_info_get_uri.restype = ctypes.c_void_p
    glib.g_free.argtypes = [ctypes.c_void_p]
    glib.g_free.restype = None
    glib.g_list_free_full.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    glib.g_list_free_full.restype = None
    head = ctypes.c_void_p()
    objects.g_object_get(capsule_pointer(view.__gpointer__, None), b"selection", ctypes.byref(head), None)
    uris = []
    try:
        node = ctypes.cast(head, ctypes.POINTER(Node))
        while node:
            if len(uris) >= 100000 or not objects.g_type_check_instance_is_a(node.contents.data, files.nautilus_file_info_get_type()):
                raise RuntimeError("当前文件视图返回了无法识别的选中项")
            uri = files.nautilus_file_info_get_uri(node.contents.data)
            try:
                if not uri:
                    raise RuntimeError("选中项没有文件 URI")
                uris.append(ctypes.string_at(uri).decode("utf-8"))
            finally:
                glib.g_free(uri)
            node = node.contents.next
    finally:
        glib.g_list_free_full(head, ctypes.cast(objects.g_object_unref, ctypes.c_void_p))
    return uris


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
