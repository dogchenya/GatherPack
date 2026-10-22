"""Collect original distro notices for the shared libraries actually bundled."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

appdir = Path(sys.argv[1]).resolve(strict=True)
destination = appdir / "usr/share/doc/easy-pack/bundled-libraries"
destination.mkdir(parents=True, exist_ok=True)
packages = {}
unresolved = []
for library in sorted((appdir / "usr/lib").rglob("*.so*")):
    if not library.is_file(): continue
    result = subprocess.run(["dpkg-query", "-S", "*/" + library.name], capture_output=True, text=True)
    matches = sorted(set(line.rsplit(": ", 1)[0] for line in result.stdout.splitlines() if ": " in line))
    if not matches:
        unresolved.append(str(library.relative_to(appdir)))
        continue
    for package in matches:
        if package in packages: continue
        metadata = subprocess.check_output(["dpkg-query", "-W", "-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}", package], text=True).split("\t")
        name, version, source, source_version = metadata
        copyright = Path("/usr/share/doc") / name.split(":")[0] / "copyright"
        if not copyright.is_file():
            unresolved.append("copyright: " + package)
            continue
        target = destination / (name.replace(":", "_") + "-copyright.txt")
        shutil.copyfile(copyright, target)
        packages[package] = {"package": name, "version": version, "source": source, "sourceVersion": source_version, "copyright": target.name, "sourcePage": "https://launchpad.net/ubuntu/+source/" + source + "/" + source_version, "copyrightSHA256": hashlib.sha256(target.read_bytes()).hexdigest()}
for license in Path("/usr/share/common-licenses").iterdir():
    if license.is_file():
        target = destination / "common-licenses" / license.name
        target.parent.mkdir(exist_ok=True)
        shutil.copyfile(license, target)
report = {"packages": list(packages.values()), "unresolved": unresolved, "modifications": "Unmodified distro library code; deployment tools may rewrite ELF search paths and relocate files."}
(destination / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
evidence = Path("artifacts/validation/appimage-libraries.json")
evidence.parent.mkdir(parents=True, exist_ok=True)
evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"packages": len(packages), "unresolved": unresolved}))
if unresolved: raise SystemExit(1)
