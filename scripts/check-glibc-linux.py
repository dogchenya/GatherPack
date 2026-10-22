"""Reject ELF files requiring a newer glibc than Ubuntu 22.04's 2.35."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

limit = (2, 35)
root = Path(sys.argv[1]).resolve(strict=True)
paths = [root] if root.is_file() else sorted(root.rglob("*"))
checked, failures, seen = [], [], set()
for path in paths:
    if not path.is_file() or path.resolve() in seen:
        continue
    seen.add(path.resolve())
    with path.open("rb") as stream:
        if stream.read(4) != b"\x7fELF":
            continue
    versions = subprocess.check_output(["readelf", "--version-info", str(path)], text=True, env={**os.environ, "LC_ALL": "C"})
    # Only required versions count; a library's own exported version definitions
    # must not be mistaken for a dependency on another library.
    needs = versions.split("Version needs section", 1)[-1] if "Version needs section" in versions else ""
    required = sorted({tuple(map(int, v.split("."))) for v in re.findall(r"Name: GLIBC_([0-9.]+)", needs)})
    maximum = required[-1] if required else ()
    item = {"file": str(path.relative_to(root)) if root.is_dir() else path.name, "requiredGLIBC": ".".join(map(str, maximum)) or None}
    checked.append(item)
    if maximum > limit:
        failures.append(item)
if not checked:
    raise RuntimeError("No ELF binaries were checked")
result = {"passed": not failures, "maximumAllowedGLIBC": "2.35", "checkedELFFiles": len(checked), "files": checked, "failures": failures}
if len(sys.argv) > 2:
    report = Path(sys.argv[2])
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "files"}))
if failures:
    raise SystemExit(1)
