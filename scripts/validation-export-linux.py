"""Copy compact validation evidence without test source contents or binaries."""
from pathlib import Path
import shutil
import sys
source, destination = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
for file in source.rglob('*'):
    if file.is_file() and file.suffix in {'.json', '.jsonl', '.log', '.png', '.txt'} and 'fixtures' not in file.relative_to(source).parts:
        target = destination / file.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
print('Linux evidence exported to', destination)
