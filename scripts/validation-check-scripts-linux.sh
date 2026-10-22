#!/bin/bash
set -euo pipefail
cd /work
for file in scripts/*.sh; do bash -n "$file"; done
python3 - <<'PY'
import ast, json
from pathlib import Path
files = list(Path('scripts').glob('*.py')) + list(Path('src-tauri/scripts').glob('*.py'))
for path in files:
    ast.parse(path.read_text(), filename=str(path))
for path in [Path('package.json'), Path('src-tauri/tauri.conf.json'), Path('docs/license-audit.json')]:
    json.loads(path.read_text(encoding='utf-8-sig'))
import yaml
workflow = yaml.safe_load(Path('.github/workflows/prototype.yml').read_text())
assert {'check', 'installers', 'draft-release'} <= set(workflow['jobs'])
print('Shell, Python, JSON and GitHub workflow syntax verified.')
PY
