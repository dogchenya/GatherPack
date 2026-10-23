"""Real poisoned Nautilus host -> consented app reconnect -> live selection."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
from collections import deque
import pyatspi
from gi.repository import GLib

assert os.getuid() == 2000 and os.environ.get('XDG_SESSION_TYPE') == 'x11'
evidence = Path('/work/artifacts/validation')
root = Path(tempfile.mkdtemp(prefix='connection-repair-', dir=Path.home()))
source = root / 'reconnect-source'
source.mkdir()
original = source / 'original.txt'
original.write_text('original source remains unchanged')
data = root / 'data'
extension = data / 'nautilus-python/extensions/gatherpack_selection.py'
extension.parent.mkdir(parents=True)
content = Path('/work/src-tauri/scripts/gatherpack_selection.py').read_text()
extension.write_text(content)
poison = root / 'poison'
poison.mkdir()
marker = root / 'poison-loaded'
(poison / 'gi.py').write_text(f'from pathlib import Path\nPath({str(marker)!r}).write_text("real host imported poisoned gi")\nraise ImportError("GatherPack test: poisoned PYTHONPATH")\n')
env = {**os.environ, 'XDG_DATA_HOME': str(data), 'XDG_CONFIG_HOME': str(root / 'config')}
executable = os.environ['GATHERPACK_TEST_EXECUTABLE']
checks, processes, logs = [], [], []


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=10).strip()


def wait(predicate, message, timeout=15):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            result = predicate()
            if result: return result
        except (subprocess.CalledProcessError, IndexError, GLib.Error, RuntimeError):
            pass
        time.sleep(.1)
    raise AssertionError(message)


def check(value, message):
    assert value, message
    checks.append(message)


def launch(args, environment, name):
    log = (evidence / (name + '.log')).open('w')
    logs.append(log)
    process = subprocess.Popen(args, env=environment, stdout=log, stderr=log, start_new_session=True)
    processes.append(process)
    return process


def widgets():
    queue = deque(app for app in pyatspi.Registry.getDesktop(0) if 'gatherpack' in (app.name or '').lower())
    result = []
    while queue and len(result) < 15000:
        item = queue.popleft(); result.append(item); queue.extend(list(item))
    return result


def text():
    result = []
    for item in widgets():
        result.append(item.name or '')
        try: result.append(item.queryText().getText(0, -1))
        except (NotImplementedError, AttributeError, RuntimeError, GLib.Error): pass
    return '\n'.join(result)


def click(name):
    command('xdotool', 'windowactivate', '--sync', window)
    matches = [item for item in widgets() if item.name == name and item.getRoleName() in {'push button', 'toggle button'}]
    assert len(matches) == 1, (name, len(matches))
    component = matches[0].queryComponent()
    component.scrollTo(pyatspi.SCROLL_ANYWHERE); component.grabFocus(); time.sleep(.3)
    bounds = component.getExtents(pyatspi.DESKTOP_COORDS)
    command('xdotool', 'mousemove', str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2), 'click', '1')
    time.sleep(.3)


try:
    old_host = launch(['/usr/bin/nautilus', '--new-window', str(source)], {**env, 'PYTHONPATH': str(poison)}, 'connection-poisoned-nautilus')
    wait(lambda: marker.exists(), 'The actual resident Nautilus must import the poisoned GI module')
    wait(lambda: command('xdotool', 'search', '--onlyvisible', '--name', '^reconnect-source$'), 'Poisoned Nautilus must still display its file window')
    check(old_host.poll() is None, 'reproduced an alive Nautilus whose Python environment prevents bridge loading')
    app = launch([executable], env, 'connection-app')
    window = wait(lambda: command('xdotool', 'search', '--onlyvisible', '--name', '^GatherPack').splitlines()[0], 'App must map')
    command('xdotool', 'key', 'Escape')
    bounds = dict(line.split('=',1) for line in command('xdotool','getwindowgeometry','--shell',window).splitlines())
    command('xdotool','mousemove',str(int(bounds['X'])+int(bounds['WIDTH'])//2),str(int(bounds['Y'])+40))
    wait(lambda: '展开收集面板' in text(), 'Compact app must load')
    time.sleep(.4)
    click('展开收集面板')
    click('本地收集 · 快捷键已注册')
    click('检查文件管理器连接')
    wait(lambda: '重新连接文件管理器' in text(), 'Actual diagnostics must identify a disconnected host')
    check(old_host.poll() is None, 'read-only diagnostics do not close the file manager')
    click('重新连接文件管理器')
    check('将关闭并重新打开文件管理器窗口' in text() and old_host.poll() is None, 'restart waits for explicit file-operation consent')
    extension.write_text('# user independent extension; do not overwrite\n')
    click('已结束文件操作，继续重连')
    wait(lambda: '非本应用管理' in text(), 'Foreign extension must produce a concrete error')
    check(extension.read_text().startswith('# user independent') and old_host.poll() is None, 'foreign extensions are protected and a refused repair does not restart Nautilus')
    extension.write_text(content)
    click('已结束文件操作，继续重连')
    wait(lambda: '文件管理器桥接已连接' in text(), 'Confirmed reconnect must load the bridge in a clean host', timeout=20)
    wait(lambda: old_host.poll() is not None, 'The poisoned owned host must exit')
    check(True, 'confirmed in-app repair replaces the poisoned host and connects the live bridge')
    state_file = data / 'io.github.dogchenya.gatherpack/state.json'
    subprocess.run(['/usr/bin/nautilus','--new-window',str(source)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=5)
    files = wait(lambda: command('xdotool','search','--onlyvisible','--name','^reconnect-source$').splitlines()[0], 'Reconnected file manager must show the source folder')
    command('xdotool','windowmove',window,'0','80')
    command('xdotool','windowmove',files,'450','80')
    command('xdotool','windowactivate','--sync',files)
    time.sleep(1)
    bounds = dict(line.split('=',1) for line in command('xdotool','getwindowgeometry','--shell',files).splitlines())
    command('xdotool','mousemove',str(int(bounds['X'])+280),str(int(bounds['Y'])+150),'click','1')
    time.sleep(.3)
    command('xdotool','key','--clearmodifiers','ctrl+a')
    time.sleep(.3)
    subprocess.run(['xclip','-selection','clipboard'],input=b'clipboard untouched',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    command('xdotool','key','--clearmodifiers','ctrl+alt+shift+e')
    wait(lambda: state_file.exists() and str(original) in json.loads(state_file.read_text())['paths'], 'The real global hotkey must collect after in-app reconnect')
    check(command('xclip','-o','-selection','clipboard') == 'clipboard untouched', 'repaired global collection preserves the clipboard')
    check(original.read_text() == 'original source remains unchanged', 'reconnection and collection preserve original source bytes')
    report = {'passed':True,'executableSHA256':hashlib.sha256(Path(executable).read_bytes()).hexdigest(),'packageSHA256':os.environ.get('GATHERPACK_TEST_PACKAGE_SHA256'),'checks':checks}
except Exception as error:
    report = {'passed':False,'error':str(error),'checks':checks}
    (evidence/'connection-repair-accessibility.txt').write_text(text())
    raise
finally:
    (evidence/'connection-repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    subprocess.run(['/usr/bin/nautilus','-q'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
    for process in reversed(processes):
        try: os.killpg(process.pid,signal.SIGTERM)
        except ProcessLookupError: pass
        process.wait(timeout=5)
    for log in logs: log.close()
print(json.dumps(report,ensure_ascii=False))
