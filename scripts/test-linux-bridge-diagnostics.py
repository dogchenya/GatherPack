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
        with patch("subprocess.run", return_value=subprocess.CompletedProcess([], code, status, "")) as run:
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


if __name__ == "__main__":
    unittest.main()
