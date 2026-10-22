import sys
import gi
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk
Gdk.init([])
window = Gdk.get_default_root_window()
image = Gdk.pixbuf_get_from_window(window, 0, 0, window.get_width(), window.get_height())
image.savev(sys.argv[1], "png", [], [])
