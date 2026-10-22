import json
from pathlib import Path
import sys
import tarfile
from file_hash import sha256_stream

with tarfile.open(sys.argv[1], "r:") as archive:
    prefix = "corresponding-source/"
    checksums = archive.extractfile(prefix + "SHA256SUMS.txt").read().decode()
    count = 0
    for line in checksums.splitlines():
        expected, name = line.split("  ", 1)
        with archive.extractfile(prefix + name) as stream:
            actual = sha256_stream(stream)
        if actual != expected: raise RuntimeError("Source archive checksum mismatch: " + name)
        count += 1
report = {"passed": True, "archive": str(Path(sys.argv[1])), "verifiedSourceFiles": count}
Path("artifacts/validation/source-archive-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
