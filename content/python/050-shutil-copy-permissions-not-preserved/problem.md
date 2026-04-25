---
slug: shutil-copy-permissions-not-preserved
track: python
orderIndex: 50
title: shutil.copy Drops File Permissions
difficulty: easy
tags:
  - correctness
  - filesystem
  - security
language: python
---

## Context

This utility lives in `deploy/install.py` and is called during the application's self-update process. It downloads a new binary to a temp path, then uses the helper below to stage it into `/usr/local/bin`. The surrounding deploy script runs as root on Linux and macOS servers.

After a recent refactor, operators noticed that the replaced binary loses its executable bit. Calls to the CLI immediately after an update fail with `Permission denied` until someone manually runs `chmod +x /usr/local/bin/myapp`. The file content is correct; only the permissions are wrong.

The team verified that the source temp file is created with the right permissions (mode `0o755`) before `stage_binary` is called. The issue is entirely inside this function.

## Buggy code

```python
import shutil
import os

def stage_binary(src_path: str, dest_path: str) -> None:
    """
    Atomically replace dest_path with the binary at src_path.
    Preserves the destination directory's ownership.
    """
    dest_dir = os.path.dirname(dest_path)
    tmp_dest = os.path.join(dest_dir, ".myapp.tmp")

    # Copy file content to a temp location in the same directory
    shutil.copy(src_path, tmp_dest)

    # Atomically replace the destination
    os.replace(tmp_dest, dest_path)

    print(f"Installed binary to {dest_path}")
```
