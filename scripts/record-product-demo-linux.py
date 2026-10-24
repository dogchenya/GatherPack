"""Record the real packaged UI with sample files in an isolated X11 desktop.

Run using validation-desktop-linux.sh demo <stable AppImage>. Reuse only the
existing native accessibility helpers, without executing the regression suite.
"""
import ast
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
import zipfile

evidence = Path('/work/artifacts/validation')
checks = []
helpers = ast.parse(Path('/work/scripts/test-linux-selection.py').read_text())
names = {'command', 'check', 'focus', 'keys', 'click_app_button', 'wait_native_dialog', 'enter_native_path'}
exec(compile(ast.Module(body=[n for n in helpers.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[]), '<native-ui-helpers>', 'exec'))

root = Path(tempfile.mkdtemp(prefix='GatherPack-demo-', dir=Path.home()))
assets = root / 'project-assets'
assets.mkdir()
(assets / 'design').mkdir()
(assets / 'design/interface.txt').write_text('Sample interface specification\n')
(assets / 'budget.csv').write_text('Item,Amount\nDesign,1200\nDevelopment,3600\n')
(assets / 'draft.txt').write_text('Sample draft; preserved when removed from collection.\n')
notes = root / 'meeting-notes.txt'
notes.write_text('Sample meeting notes\nPrepare the delivery archive.\n')
originals = {str(p): p.read_bytes() for p in root.rglob('*') if p.is_file()}
profile = root / 'profile'
(profile / 'io.github.dogchenya.gatherpack').mkdir(parents=True)
(profile / 'io.github.dogchenya.gatherpack/state.json').write_text(json.dumps({'paths': [], 'settings': {'edgeHide': False}}))
executable = os.environ['GATHERPACK_TEST_EXECUTABLE']
app_log = (evidence / 'product-demo-app.log').open('w')
app = subprocess.Popen([executable], env={**os.environ, 'XDG_DATA_HOME': str(profile), 'XDG_CONFIG_HOME': str(profile), 'XDG_CACHE_HOME': str(profile)}, stdout=app_log, stderr=app_log, start_new_session=True)
recording = None
nautilus = None
chapters = []
started = 0

def pause(seconds=1.5):
    time.sleep(seconds)

def chapter(label):
    chapters.append({'at': round(time.monotonic()-started, 2), 'label': label})

def click(name):
    import pyatspi
    focus(app_window)
    command('xdotool','mousemove','1220','850')
    queue = deque(app for app in pyatspi.Registry.getDesktop(0) if 'gatherpack' in (app.name or '').lower())
    matches = []
    while queue:
        item = queue.popleft()
        if item.name == name and item.getRoleName() in {'push button','toggle button'}:
            matches.append(item)
        queue.extend(list(item))
    # Undo is also offered by the temporary toast; either control performs the
    # same real operation. All other actions have one accessible target.
    check(len(matches)>=1 if name=='撤销' else len(matches)==1, 'native accessible '+name+' action')
    assert matches[0].queryAction().doAction(0)
    pause(.7)

def wait_for(condition):
    for _ in range(150):
        if condition(): return
        time.sleep(.1)
    raise AssertionError('Timed out waiting for actual UI result')


try:
    for _ in range(150):
        windows = subprocess.run(['xdotool', 'search', '--onlyvisible', '--name', '^GatherPack'], capture_output=True, text=True).stdout.splitlines()
        if windows:
            app_window = windows[-1]
            break
        time.sleep(.1)
    else: raise AssertionError('Application did not map')
    command('gsettings','set','org.gnome.desktop.background','picture-uri','')
    command('gsettings','set','org.gnome.desktop.background','picture-uri-dark','')
    command('gsettings','set','org.gnome.desktop.background','primary-color','#edf2ed')
    # Keyboard activation avoids sampling a pointer target during GTK's first
    # asynchronous placement of the compact window.
    import pyatspi
    focus(app_window)
    for attempt in range(40):
        queue = deque(pyatspi.Registry.getDesktop(0))
        found = None
        while queue:
            widget = queue.popleft()
            if widget.name == '展开收集面板':
                found = widget
                break
            queue.extend(list(widget))
        if found:
            assert found.queryAction().doAction(0)
            break
        pause(.2)
    else: raise AssertionError('Compact action was not accessible')
    pause(1)
    command('xdotool', 'windowmove', app_window, '420', '85')
    nautilus = subprocess.Popen(['nautilus','--new-window',str(assets)],env={**os.environ,'XDG_DATA_HOME':str(profile)},stdout=app_log,stderr=app_log)
    pause(2)
    # Keep a regular file-manager window mapped behind the floating app.
    # Minimizing the last regular window sends this disposable GNOME session
    # into Overview, where keyboard input targets its search instead of GTK.
    keys('Escape')
    focus(app_window)
    # Warm up native choosers through the real UI, then start with an empty
    # sample collection. No production state or messages are synthesized.
    click('添加文件')
    enter_native_path(wait_native_dialog('选择文件'), notes)
    pause(1)
    click('清空清单')
    pause(6.3)
    command('xdotool','mousemove','1220','850')
    pause(2)
    recording = subprocess.Popen(['ffmpeg', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '12', '-video_size', '1280x868', '-i', os.environ['DISPLAY']+'+0,32', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', str(evidence/'product-demo-raw.mp4')], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=(evidence/'product-demo-ffmpeg.log').open('w'))
    started = time.monotonic()
    chapter('Collect / 收集示例文件')
    pause(1.2)
    click('添加文件夹')
    dialog = wait_native_dialog('选择文件夹')
    pause(.8)
    enter_native_path(dialog, assets)
    pause(1.5)
    click('添加文件')
    dialog = wait_native_dialog('选择文件')
    pause(.8)
    enter_native_path(dialog, notes)
    pause(2)
    state_file = profile/'io.github.dogchenya.gatherpack/state.json'
    check(set(json.loads(state_file.read_text())['paths']) == {str(assets), str(notes)}, 'real native choosers collect the two sample sources')
    chapter('Explore / 文件画布')
    click('文件关系图')
    command('xdotool', 'windowmove', app_window, '100', '85')
    click('文件夹：project-assets')
    pause(2)
    click('文件夹：design')
    click('文件：interface.txt')
    pause(2)
    click('适应画布')
    pause()
    chapter('Organize / 移除与撤销')
    click('文件：draft.txt')
    click('从本次打包移除')
    pause(2)
    check(str(assets/'draft.txt') in json.loads(state_file.read_text())['excluded'], 'canvas removal persists exclusion')
    click('撤销')
    pause(2)
    check(not json.loads(state_file.read_text())['excluded'], 'undo restores sample file inclusion')
    click('收集清单')
    command('xdotool', 'windowmove', app_window, '420', '85')
    chapter('Pack / 检查并打包')
    click('检查并打包 →')
    pause(2)
    click('选择保存位置')
    dialog = wait_native_dialog('保存压缩包')
    output = root/'project-delivery.zip'
    pause(.8)
    enter_native_path(dialog, output)
    pause(1.5)
    click('开始打包')
    report_file = profile/'io.github.dogchenya.gatherpack/last-report.json'
    wait_for(lambda: output.exists() and report_file.exists())
    report = json.loads(report_file.read_text())
    check(report['delivered'] and report['output']==str(output), 'real Rust backend produces the demonstrated archive')
    with zipfile.ZipFile(output) as archive:
        for path, content in originals.items():
            file = Path(path)
            name = str(file.relative_to(root))
            check(archive.read(name)==content, 'archive content matches sample '+name)
    check(all(Path(path).read_bytes()==content for path,content in originals.items()), 'all original sample files remain unchanged')
    chapter('Done / 打包完成')
    pause(4)
    recording.stdin.write(b'q\n'); recording.stdin.flush()
    recording.wait(timeout=30)
    assert recording.returncode == 0
    recording = None
    result = {'passed': True, 'version':'1.0.0', 'environment':'Ubuntu 24.04 / GNOME X11', 'sampleFiles':True, 'executableSHA256':hashlib.sha256(Path(executable).read_bytes()).hexdigest(), 'duration':round(time.monotonic()-started,2), 'chapters':chapters, 'checks':checks}
    (evidence/'product-demo-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
finally:
    if recording:
        recording.send_signal(signal.SIGINT)
        recording.wait(timeout=30)
    os.killpg(app.pid, signal.SIGTERM)
    app.wait(timeout=10)
    app_log.close()
    if nautilus and nautilus.poll() is None:
        nautilus.terminate()
