#!/bin/bash
set -euo pipefail
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
cat > /etc/apt/sources.list.d/easy-pack-validation-source.list <<'SOURCES'
deb-src http://archive.ubuntu.com/ubuntu noble main universe restricted multiverse
deb-src http://archive.ubuntu.com/ubuntu noble-updates main universe restricted multiverse
deb-src http://security.ubuntu.com/ubuntu noble-security main universe restricted multiverse
SOURCES
apt-get update
mkdir -p /var/cache/easy-pack/corresponding-source
cd /var/cache/easy-pack/corresponding-source
python3 - <<'PY'
import json, subprocess
from pathlib import Path
manifest = json.loads(Path('/work/artifacts/validation/appimage-libraries.json').read_text())
sources = sorted(set(p['source'] + '=' + p['sourceVersion'] for p in manifest['packages']))
subprocess.run(['apt-get', 'source', '--download-only', '--only-source', *sources], check=True)
Path('manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
PY
find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt
