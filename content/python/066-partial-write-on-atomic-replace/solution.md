## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Non-Atomic Config File Write
# ------------------------------------------------------------------------

import json
import os
import tempfile

CONFIG_PATH = "/etc/myapp/config.json"

def save_config(settings: dict) -> None:
    config_dir = os.path.dirname(CONFIG_PATH)
    # CHANGE 1: Write to a temp file in the same directory so the final os.replace() is atomic on POSIX systems.
    fd, tmp_path = tempfile.mkstemp(dir=config_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # CHANGE 1: Atomically replace the real config only after the temp file is fully written and synced.
        os.replace(tmp_path, CONFIG_PATH)
    except Exception:
        # CHANGE 2: On any failure, delete the temp file so we don't leave debris, and let the original config survive untouched.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
```

## Explanation

### Issue 1: Non-Atomic File Replacement

**Problem:** `open(CONFIG_PATH, "w")` immediately truncates the existing file to zero bytes before a single byte of new content is written. If the process crashes, loses power, or is killed at any point during `json.dump` or `fsync`, the file on disk is empty or contains partial JSON. The next startup hits `json.JSONDecodeError` and cannot proceed.

**Fix:** A temporary file is created with `tempfile.mkstemp` in the same directory as `CONFIG_PATH`. After `json.dump` and `fsync` complete successfully, `os.replace(tmp_path, CONFIG_PATH)` swaps the temp file into place. The original `open(CONFIG_PATH, "w")` call is removed.

**Explanation:** On POSIX systems (Linux, macOS) `os.replace` maps to the `rename(2)` syscall, which the kernel guarantees to be atomic with respect to other processes reading the path — they see either the old file or the new file, never a half-written one. Because both the temp file and the destination are on the same filesystem (same directory), the rename does not require a data copy, just a directory-entry swap. If a crash happens before `os.replace` is called, the original `CONFIG_PATH` is completely intact; the temp file is the only thing lost. The key constraint is that the temp file must live on the same filesystem (same `dir=`) as the target; writing to `/tmp` when the config is on a separate partition would cause `os.replace` to fall back to a non-atomic copy-and-delete.

---

### Issue 2: No Cleanup on Exception, Original File Already Gone

**Problem:** In the original code, if `json.dump` raises (e.g., a non-serialisable value in `settings`) after `open` has already truncated the file, the config on disk is left empty. There is no recovery path, and the orphaned zero-byte file persists.

**Fix:** A `try/except` block wraps all work after `mkstemp`. In the `except` branch, `os.unlink(tmp_path)` removes the incomplete temp file, and then the exception is re-raised. Because `os.replace` is only called on the success path, the original `CONFIG_PATH` is never touched if anything goes wrong.

**Explanation:** `tempfile.mkstemp` creates and opens the file, so the file descriptor `fd` is already open when we enter the `try` block. If `json.dump` throws, `os.fdopen` will have taken ownership of `fd` and the `with` block's `__exit__` closes it, but the temp file still exists on disk. Without the `except` clause, that partial file stays around indefinitely. The cleanup call is itself wrapped in its own `try/except OSError` because the file might already be gone in extreme situations (e.g., the directory was unmounted), and we do not want the cleanup failure to shadow the original exception.
