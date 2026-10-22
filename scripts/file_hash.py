"""Streaming SHA256 shared by validation scripts, including Python 3.10 hosts."""
import hashlib


def sha256_stream(stream):
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(block)
    return digest.hexdigest()
