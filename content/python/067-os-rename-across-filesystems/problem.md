---
slug: os-rename-across-filesystems
track: python
orderIndex: 67
title: Atomic Rename Fails Across Filesystems
difficulty: medium
tags:
  - correctness
  - io
  - atomic-operations
language: python
---

## Context

This helper lives in `storage/safe_writer.py` and is used throughout the platform wherever a file must be updated atomically — configuration files, cached index snapshots, and serialized model weights. The pattern of write-to-temp-then-rename is deliberately chosen to prevent readers from seeing a half-written file.

In production, the service runs inside a container where `/tmp` is a `tmpfs` mount and the target data directory is a bind-mounted host volume. Operators started seeing `OSError: [Errno 18] Invalid cross-device link` exceptions in the logs after a recent infrastructure change moved the data directory to a separate mount point. Before that change everything worked fine.

## Buggy code

```python
import os
import tempfile

def atomic_write(path: str, data: bytes) -> None:
    """
    Write `data` to `path` atomically by writing to a temp file
    and renaming it into place.
    """
    fd, tmp_path = tempfile.mkstemp()
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.rename(tmp_path, path)
    except:
        os.unlink(tmp_path)
        raise
```
