---
slug: file-position-after-seek-read
track: python
orderIndex: 54
title: Seek Offset Resets Between Reads
difficulty: easy
tags:
  - correctness
  - file-io
  - api-misuse
language: python
---

## Context

This utility lives in `utils/checksum.py` and is used by an upload validation service to verify that a file's MD5 matches the value stored in the database. It's called after every large file upload in a Flask endpoint.

Operators have noticed that the checksum returned is always the same wrong value regardless of file content. When they compare the MD5 returned by the function against `md5sum` on the command line, they never match.

The file itself is written correctly to disk — the content checks out. The bug was assumed to be in the hashing library, but switching from `hashlib` to `hashlib.md5()` directly made no difference.

## Buggy code

```python
import hashlib

def compute_md5(path: str) -> str:
    with open(path, "rb") as f:
        # Read a small header first to detect file type
        header = f.read(16)
        if header[:4] == b"\x89PNG":
            file_type = "png"
        else:
            file_type = "unknown"

        # Now hash the entire file
        f.seek(0)
        hasher = hashlib.md5()
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)

    return hasher.hexdigest()
```
