"""Download exact Ubuntu source packages for the recorded AppImage libraries."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

manifest = json.loads(Path(sys.argv[1]).read_text())
destination = Path(sys.argv[2]).resolve()
destination.mkdir(parents=True, exist_ok=True)
sources = sorted(set(p['source'] + '=' + p['sourceVersion'] for p in manifest['packages']))
args = ['apt-get', 'source', '--download-only', '--only-source', *sources]
uris = subprocess.check_output(args[:2] + ['--print-uris'] + args[2:], cwd=destination, text=True)
(destination / 'download-uris.txt').write_text(uris)
subprocess.run(args, cwd=destination, check=True)
(destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
(destination / 'README.txt').write_text('Corresponding source for the distro libraries listed in manifest.json. The original .dsc, upstream archives and distro patches are preserved. Extract each .dsc with dpkg-source -x. Libraries were relocated and ELF search paths may be rewritten by linuxdeploy; library source code was not modified. AppImage runtime source, its upstream build instructions, pinned libfuse/squashfuse source and original license notices are in appimage-runtime/. Share this source archive alongside the AppImage.\n')
print('Corresponding source downloaded for', len(sources), 'exact source package versions.')
