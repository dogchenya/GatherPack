import hashlib
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve(strict=True)
checksums = root / "SHA256SUMS.txt"
lines = []
for file in sorted(root.rglob("*")):
    if file.is_file() and file != checksums:
        with file.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        lines.append(digest + "  " + str(file.relative_to(root)))
checksums.write_text("\n".join(lines) + "\n")
print("Source files hashed:", len(lines))
