## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Atomic Rename Fails Across Filesystems
# ------------------------------------------------------------------------

import os
import shutil
import tempfile

def atomic_write(path: str, data: bytes) -> None:
    """
    Write `data` to `path` atomically by writing to a temp file
    and renaming it into place.
    """
    # CHANGE 1: Use dir=os.path.dirname(os.path.abspath(path)) so the temp file is created on the same filesystem as the target, making os.rename() an atomic same-device operation and preventing EXDEV (cross-device link) errors.
    target_dir = os.path.dirname(os.path.abspath(path))
    fd, tmp_path = tempfile.mkstemp(dir=target_dir)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        # CHANGE 2: Replace os.rename() with shutil.move() as a fallback strategy; but since CHANGE 1 guarantees same-device placement, os.rename() is now safe — keep it and add the shutil.move fallback only for extra resilience across unexpected mounts.
        try:
            os.rename(tmp_path, path)
        except OSError:
            shutil.move(tmp_path, path)
    except:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
```

## Explanation

### Issue 1: Temp File Created on Wrong Filesystem

**Problem:** Operators see `OSError: [Errno 18] Invalid cross-device link` when `atomic_write` is called. The exception is raised by `os.rename()` and the write fails entirely. This started happening after the data directory moved to a separate mount point from `/tmp`.

**Fix:** Pass `dir=os.path.dirname(os.path.abspath(path))` to `tempfile.mkstemp()` so the temp file is created in the same directory (and therefore the same filesystem) as the target path. The `os.path.abspath` call handles the edge case where `path` contains only a filename with no directory component, which would make `os.path.dirname` return an empty string.

**Explanation:** `os.rename()` is implemented as a single `rename(2)` syscall, which the kernel only allows within the same filesystem — it moves the directory entry without copying data. When the source and destination are on different mounts (e.g., `tmpfs` vs. a bind-mounted host volume), the kernel rejects the call with `EXDEV`. Before the infrastructure change, both `/tmp` and the data directory were on the same filesystem so nobody noticed. By placing the temp file in `target_dir`, the rename is always same-device and the kernel accepts it. A related pitfall: even `shutil.move()` falls back to a copy-then-delete when cross-device, which is not atomic — so creating the temp file on the right device is the correct primary fix, not just swapping in `shutil.move()`.

---

### Issue 2: Unlink in Except Clause Can Silently Swallow the Cleaned-Up File Path After a Failed Rename

**Problem:** When `os.rename()` raises (before CHANGE 1 is applied), the `except` block calls `os.unlink(tmp_path)`. If `tmp_path` was already partially moved or if `os.unlink` itself raises (e.g., a permissions issue on the temp directory), the second exception replaces the original one and the caller gets a confusing `FileNotFoundError` or `PermissionError` instead of the real `EXDEV`.

**Fix:** Wrap the `os.unlink(tmp_path)` call inside its own `try/except OSError` block so that a failure to clean up the temp file does not mask the original exception that caused the write to fail.

**Explanation:** Python's bare `except: ... raise` re-raises the active exception, but if the body of the `except` block itself raises before reaching `raise`, that new exception propagates instead. So `os.unlink(tmp_path)` raising `FileNotFoundError` (because the OS already cleaned it up, or the path was wrong) would surface to the caller as an unrelated error, hiding the real problem. Guarding the unlink with its own `try/except OSError: pass` ensures cleanup is best-effort and the original exception is always what the caller sees.
