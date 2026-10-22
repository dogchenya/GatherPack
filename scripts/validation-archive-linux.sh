#!/bin/bash
set -euo pipefail
export PATH=/root/.rustup/toolchains/1.98.1-x86_64-unknown-linux-gnu/bin:$PATH
cd /work
python3 scripts/download-appimage-sources-linux.py artifacts/validation/appimage-libraries.json /var/cache/easy-pack/corresponding-source
python3 - <<'PY'
from pathlib import Path
import hashlib
root = Path('/var/cache/easy-pack/corresponding-source')
lines = []
for file in sorted(root.rglob('*')):
    if file.is_file() and file.name != 'SHA256SUMS.txt':
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        lines.append(digest + '  ' + str(file.relative_to(root)))
(root / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n')
PY
node scripts/collect-artifacts.mjs x86_64-unknown-linux-gnu /var/cache/easy-pack/target/release/bundle
tar -C /var/cache/easy-pack -cf artifacts/x86_64-unknown-linux-gnu/gatherpack-0.1.0-alpha.4-x86_64-unknown-linux-gnu-corresponding-source.tar corresponding-source
cd artifacts/x86_64-unknown-linux-gnu
sha256sum *corresponding-source.tar >> SHA256SUMS.txt
