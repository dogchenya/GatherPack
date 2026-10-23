"""Inspect the real Nautilus host; restart only after explicit in-app consent."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ENV_KEYS = ('PYTHONHOME', 'PYTHONPATH', 'LD_LIBRARY_PATH', 'GI_TYPELIB_PATH', 'XDG_DATA_HOME', 'XDG_DATA_DIRS', 'DBUS_SESSION_BUS_ADDRESS', 'DISPLAY', 'WAYLAND_DISPLAY')


def hosts():
    result = []
    for directory in Path('/proc').iterdir():
        if not directory.name.isdigit():
            continue
        try:
            if (directory / 'comm').read_text().strip() != 'nautilus' or directory.stat().st_uid != os.getuid():
                continue
            if any(line.startswith('State:') and 'Z (zombie)' in line for line in (directory / 'status').read_text().splitlines()):
                continue
            env = dict(value.split('=', 1) for value in (directory / 'environ').read_bytes().decode(errors='replace').split('\0') if '=' in value)
            maps = (directory / 'maps').read_text()
            result.append({'pid': int(directory.name), 'exe': os.readlink(directory / 'exe'), 'environment': {key: env[key] for key in ENV_KEYS if key in env}, 'loaderLoaded': 'libnautilus-python' in maps, 'pythonLibraries': sorted(set(line.split()[-1] for line in maps.splitlines() if 'libpython' in line and '/' in line))})
        except (OSError, ValueError):
            continue
    return result


def bus_owner():
    from gi.repository import Gio, GLib
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    name = 'io.github.dogchenya.gatherpack.NautilusSelection'
    try:
        result = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', GLib.Variant('(s)', (name,)), GLib.VariantType.new('(u)'), Gio.DBusCallFlags.NONE, 1500, None)
        return result.unpack()[0]
    except GLib.Error:
        return None


def diagnose():
    running = hosts()
    owner = bus_owner()
    details = {'appVersion': os.environ.get('GATHERPACK_VERSION', ''), 'uid': os.getuid(), 'session': os.environ.get('XDG_SESSION_TYPE', ''), 'display': os.environ.get('DISPLAY', ''), 'nautilus': running, 'bridgeOwnerPID': owner}
    try:
        details['osRelease'] = Path('/etc/os-release').read_text()
    except OSError:
        pass
    details['systemBridge'] = str(Path('/usr/share/nautilus-python/extensions/gatherpack_selection.py'))
    details['systemBridgeExists'] = Path(details['systemBridge']).is_file()
    for host in running:
        data = Path(host['environment'].get('XDG_DATA_HOME') or Path.home() / '.local/share')
        bridge = data / 'nautilus-python/extensions/gatherpack_selection.py'
        host['userBridge'] = str(bridge)
        host['userBridgeExists'] = bridge.is_file()
    def bus_key(address):
        return ','.join(part for part in (address or '').split(',') if not part.startswith('guid='))
    session_mismatch = any(bus_key(host['environment'].get('DBUS_SESSION_BUS_ADDRESS', os.environ.get('DBUS_SESSION_BUS_ADDRESS'))) != bus_key(os.environ.get('DBUS_SESSION_BUS_ADDRESS')) for host in running)
    if owner:
        summary = '文件管理器桥接已连接，请切回文件管理器选中文件后重试。'
    elif session_mismatch:
        summary = '应用与文件管理器不在同一桌面会话，请退出 GatherPack 后从桌面应用菜单重新启动，勿使用 sudo。'
    elif running and not any(host['loaderLoaded'] for host in running):
        summary = '正在运行的文件管理器没有加载 Python 扩展加载器。可在文件操作结束后点击“重新连接文件管理器”；仍失败时请导出诊断信息。'
    else:
        summary = '文件管理器扩展尚未连接。可在文件操作结束后点击“重新连接文件管理器”，以干净的系统 Python 环境重新加载扩展。'
    can_restart = os.getuid() != 0 and not session_mismatch and (os.environ.get('XDG_SESSION_TYPE') == 'x11' or not os.environ.get('WAYLAND_DISPLAY'))
    return {'summary': summary, 'details': json.dumps(details, ensure_ascii=False, indent=2), 'canRestart': can_restart, 'connected': owner is not None}


def restart():
    initial = diagnose()
    if not initial['canRestart']:
        raise RuntimeError(initial['summary'])
    running = hosts()
    # Match the resident file manager's XDG location, not the launcher's runtime.
    data_homes = {host['environment'].get('XDG_DATA_HOME') or str(Path.home() / '.local/share') for host in running}
    if len(data_homes) > 1:
        raise RuntimeError('存在不同配置目录的多个文件管理器进程，请先退出这些进程后重试。')
    data = Path(next(iter(data_homes), os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share'))
    if not data.is_absolute():
        raise RuntimeError('文件管理器配置目录不是绝对路径，已取消重连。')
    directory = data / 'nautilus-python/extensions'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / 'gatherpack_selection.py'
    content = os.environ['GATHERPACK_BRIDGE_CONTENT']
    if target.is_symlink() or (target.exists() and not target.read_text().startswith('# gatherpack managed Nautilus selection bridge')):
        raise RuntimeError('扩展位置已有非本应用管理的文件，未覆盖：' + str(target))
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=directory, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    try:
        temporary.chmod(0o644)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    clean = dict(os.environ)
    for key in ('PYTHONHOME', 'PYTHONPATH', 'LD_LIBRARY_PATH', 'LD_PRELOAD', 'GI_TYPELIB_PATH', 'GTK_PATH', 'GIO_EXTRA_MODULES', 'GIO_MODULE_DIR', 'GATHERPACK_BRIDGE_CONTENT', 'APPDIR', 'APPIMAGE'):
        clean.pop(key, None)
    clean['XDG_DATA_HOME'] = str(data)
    quit_result = subprocess.run(['/usr/bin/nautilus', '-q'], env=clean, timeout=3, capture_output=True, text=True)
    deadline = time.monotonic() + 4
    original = {host['pid'] for host in running}
    while any(host['pid'] in original for host in hosts()):
        if time.monotonic() > deadline:
            detail = quit_result.stderr.strip()[-1000:]
            raise RuntimeError('文件管理器仍在运行，未强制终止。请等待文件操作结束后重试。' + ('\n' + detail if detail else ''))
        time.sleep(.1)
    subprocess.Popen(['/usr/bin/nautilus', '--new-window', str(Path.home())], env=clean, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if bus_owner():
            return diagnose()
        time.sleep(.2)
    result = diagnose()
    result['summary'] = '重连后桥接仍未加载，请复制诊断信息用于排查；拖入和手动添加仍可使用。'
    return result


if __name__ == '__main__':
    try:
        print(json.dumps(restart() if sys.argv[1:] == ['--restart-confirmed'] else diagnose(), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
