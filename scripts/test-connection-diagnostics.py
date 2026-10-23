"""Safety and session diagnosis without touching a user's desktop."""
import ast
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

script = Path(__file__).resolve().parents[1] / 'src-tauri/scripts/connection-linux.py'
tree = ast.parse(script.read_text(encoding='utf-8'))
tree.body = [node for node in tree.body if not isinstance(node, ast.If)]
scope = {}
exec(compile(tree, str(script), 'exec'), scope)


class ConnectionDiagnosis(unittest.TestCase):
    def diagnose(self, environment=None, hosts=None, uid=1000):
        env = {'XDG_SESSION_TYPE':'x11', 'DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/1000/bus,guid=app'}
        env.update(environment or {})
        with patch.dict(os.environ,env,clear=True), patch.object(Path,'home',return_value=Path(tempfile.gettempdir())), patch.object(os,'getuid',return_value=uid,create=True), patch.dict(scope,{'hosts':lambda: hosts or [],'bus_owner':lambda: None}), patch('subprocess.run') as run:
            result = scope['diagnose']()
        run.assert_not_called()
        return result

    def test_read_only_check_does_not_restart(self):
        result = self.diagnose()
        self.assertFalse(result['connected'])
        self.assertTrue(result['canRestart'])

    def test_guid_differences_do_not_mean_different_buses(self):
        result = self.diagnose(hosts=[{'pid':123,'loaderLoaded':False,'environment':{'DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/1000/bus,guid=host'}}])
        self.assertTrue(result['canRestart'])
        self.assertIn('没有加载 Python 扩展加载器',result['summary'])

    def test_different_bus_prevents_restarting_the_wrong_session(self):
        result = self.diagnose(hosts=[{'pid':123,'loaderLoaded':True,'environment':{'DBUS_SESSION_BUS_ADDRESS':'unix:path=/other/session/bus'}}])
        self.assertFalse(result['canRestart'])
        self.assertIn('不在同一桌面会话',result['summary'])

    def test_root_and_wayland_are_not_restart_candidates(self):
        self.assertFalse(self.diagnose(uid=0)['canRestart'])
        self.assertFalse(self.diagnose({'XDG_SESSION_TYPE':'wayland','WAYLAND_DISPLAY':'wayland-0'})['canRestart'])

    def test_foreign_extension_is_not_overwritten_or_restarted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)/'nautilus-python/extensions/gatherpack_selection.py'
            target.parent.mkdir(parents=True)
            target.write_text('# independent user extension')
            with patch.dict(os.environ,{'XDG_DATA_HOME':directory,'GATHERPACK_BRIDGE_CONTENT':'# gatherpack managed Nautilus selection bridge v1'}), patch.dict(scope,{'hosts':lambda:[],'diagnose':lambda:{'canRestart':True}}), patch('subprocess.run') as run:
                with self.assertRaisesRegex(RuntimeError,'非本应用管理'):
                    scope['restart']()
            self.assertEqual(target.read_text(),'# independent user extension')
            run.assert_not_called()


if __name__ == '__main__': unittest.main()
