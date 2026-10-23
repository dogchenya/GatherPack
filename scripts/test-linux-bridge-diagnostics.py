"""Exercise dependency errors without changing the host's packages or desktop."""
import ast
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


source = Path(__file__).resolve().parents[1] / "src-tauri/scripts/selection-linux.py"
tree = ast.parse(source.read_text(encoding="utf-8"))
# Load definitions only: the final capture block requires a real foreground window.
tree.body = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef))]
namespace = {}
exec(compile(tree, str(source), "exec"), namespace)


class BridgeDiagnostics(unittest.TestCase):
    def diagnose(self, code, status):
        with patch.dict(namespace, {"bridge_load_error": lambda: None}), patch("subprocess.run", return_value=subprocess.CompletedProcess([], code, status, "")) as run:
            message = namespace["bridge_unavailable_reason"]()
        self.assertEqual(run.call_args.args[0][-1], "python3-nautilus")
        self.assertEqual(run.call_args.kwargs["timeout"], 2)
        return message

    def test_installed_but_not_loaded(self):
        message = self.diagnose(0, "install ok installed")
        self.assertIn("已安装，无需重复安装", message)
        self.assertIn("nautilus -q", message)
        self.assertNotIn("sudo apt install", message)

    def test_absent_package(self):
        self.assertIn("sudo apt install python3-nautilus python3-gi", self.diagnose(1, ""))

    def test_held_package_is_still_installed(self):
        message = self.diagnose(0, "hold ok installed")
        self.assertIn("已安装，无需重复安装", message)
        self.assertNotIn("sudo apt install", message)

    def test_removed_package(self):
        self.assertIn("缺少或未完整安装", self.diagnose(0, "deinstall ok config-files"))

    def test_unconfigured_package(self):
        self.assertIn("缺少或未完整安装", self.diagnose(0, "install ok unpacked"))

    def test_query_failure_is_not_missing_package(self):
        self.assertIn("无法确认", self.diagnose(2, ""))

    def test_no_dpkg_or_timeout_is_not_missing_package(self):
        for error in (FileNotFoundError(), subprocess.TimeoutExpired("dpkg-query", 2)):
            with self.subTest(error=type(error).__name__), patch("subprocess.run", side_effect=error):
                self.assertIn("无法确认", namespace["bridge_unavailable_reason"]())

    def test_import_failure_is_not_hidden_by_installed_package(self):
        with patch.dict(namespace, {"bridge_load_error": lambda: "Nautilus 扩展加载失败：Namespace Nautilus not available"}), patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, "install ok installed", "")):
            self.assertIn("Namespace Nautilus", namespace["bridge_unavailable_reason"]())


class HostVersions(unittest.TestCase):
    def test_host_wins_over_newest_installed_typelib(self):
        from unittest.mock import Mock
        bridge = source.with_name("gatherpack_selection.py")
        function = next(node for node in ast.parse(bridge.read_text(encoding="utf-8")).body if isinstance(node, ast.FunctionDef) and node.name == "require_host_versions")
        for loaded_nautilus, loaded_gtk, expected in [("3.0", "3.0", "3.0"), (None, "3.0", "3.0"), ("4.0", "4.0", "4.0")]:
            gi = Mock()
            gi.get_required_version.side_effect = lambda name: loaded_nautilus if name == "Nautilus" else loaded_gtk
            scope = {"gi": gi}
            exec(compile(ast.Module(body=[function], type_ignores=[]), str(bridge), "exec"), scope)
            self.assertEqual(scope["require_host_versions"](), expected)
            gi.require_version.assert_called_once_with("Nautilus", expected)


if __name__ == "__main__":
    unittest.main()
