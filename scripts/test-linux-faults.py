"""Linux filesystem fault tests, run as a non-root user in a disposable namespace."""
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unicodedata
import zipfile

if os.geteuid() == 0:
    raise RuntimeError("fault tests must run unprivileged to validate permissions")
probe = sys.argv[1]
full = Path(os.environ["EASY_PACK_DISK_FULL_DIR"])
checks = []

def run(source, output, format="zip", skip=False):
    result = subprocess.run([probe, str(source), str(output), format] + (["--skip-issues"] if skip else []), capture_output=True, text=True, check=False)
    return result.returncode, json.loads(result.stdout)

def check(condition, label):
    checks.append({"name": label, "passed": bool(condition)})
    if not condition:
        raise AssertionError(label)

with tempfile.TemporaryDirectory(prefix="easy-pack-faults-") as temporary:
    root = Path(temporary)
    source = root / "entropy.bin"
    source.write_bytes(random.Random(7).randbytes(1024 * 1024))
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    for format in ["zip", "7z", "tar.gz"]:
        output = full / ("full." + format)
        code, result = run(source, output, format)
        check(code == 1 and not result["report"]["delivered"], format + ": actual ENOSPC is not success")
        check(not output.exists() and not list(full.iterdir()), format + ": ENOSPC cleans temporary output")
        check(hashlib.sha256(source.read_bytes()).hexdigest() == digest, format + ": ENOSPC preserves source bytes")
    folder = root / "source"
    folder.mkdir()
    (folder / "empty").mkdir()
    (folder / "readable.txt").write_bytes(b"readable")
    blocked = folder / "blocked.txt"
    blocked.write_bytes(b"must not be read")
    blocked.chmod(0)
    code, result = run(folder, root / "blocked.zip")
    check(code == 2 and any(i["blocking"] for i in result["plan"]["issues"]), "real unreadable file blocks packing until acknowledged")
    code, result = run(folder, root / "skipped.zip", skip=True)
    check(code == 0 and len(result["report"]["written"]) == 1 and len(result["report"]["skipped"]) == 1, "acknowledged permission failure has accurate file statistics")
    with zipfile.ZipFile(root / "skipped.zip") as archive:
        check(archive.read("source/readable.txt") == b"readable" and "source/blocked.txt" not in archive.namelist(), "permission skip output has exactly the readable content")
    blocked.chmod(0o600)
    (folder / "loop").symlink_to(folder, target_is_directory=True)
    (folder / "outside-link").symlink_to(source)
    code, result = run(folder, root / "links.zip", skip=True)
    check(code == 0 and sum(i["blocking"] for i in result["plan"]["issues"]) == 2, "recursive links are listed and not followed")
    with zipfile.ZipFile(root / "links.zip") as archive:
        check(not any("loop" in n or "outside-link" in n for n in archive.namelist()), "no linked content enters archive")
    readonly = root / "readonly"
    readonly.mkdir()
    readonly.chmod(0o500)
    code, result = run(source, readonly / "out.zip")
    check(code == 1 and not result["report"]["delivered"] and not list(readonly.iterdir()), "unwritable output directory fails without residue")
    readonly.chmod(0o700)
    names = root / "portable"
    names.mkdir()
    for name in ["CON.txt", "a?.txt", "a*.txt", "SAME", "same", "É.txt", "E\u0301.txt"]:
        (names / name).write_text(name, encoding="utf-8")
    code, result = run(names, root / "portable.zip")
    with zipfile.ZipFile(root / "portable.zip") as archive:
        files = [n for n in archive.namelist() if not n.endswith("/")]
        portable = [unicodedata.normalize("NFC", n).casefold() for n in files]
        check(code == 0 and len(files) == 7 and len(set(portable)) == 7, "Linux names map to unique portable extraction names")
        check(len(result["plan"]["renames"]) >= 5, "illegal, case and Unicode renames are exposed before packing")
print(json.dumps({"passed": True, "uid": os.geteuid(), "checks": checks}, ensure_ascii=False))
