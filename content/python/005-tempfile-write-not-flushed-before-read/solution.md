## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Tempfile Write Not Flushed Before Read
# ------------------------------------------------------------------------

import subprocess
import tempfile
import os

def validate_config(config_json: str) -> str:
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".json",
        delete=False,
        encoding="utf-8",
    )
    try:
        tmp.write(config_json)
        # CHANGE 1: flush() pushes buffered data from Python's I/O layer to the OS so the subprocess sees the full content when it opens the file by name.
        tmp.flush()
        # CHANGE 2: close the file before the subprocess runs so all OS-level buffers are committed and the file descriptor is released before the validator opens it.
        tmp.close()
        result = subprocess.run(
            ["config-validator", "--file", tmp.name],
            capture_output=True,
            text=True,
        )
    finally:
        # CHANGE 2: wrap in try/finally so the temp file is always removed from disk even if subprocess.run raises, preventing file descriptor and disk leaks.
        try:
            os.unlink(tmp.name)
        except FileNotFoundError:
            pass
    return result.stdout
```

## Explanation

### Issue 1: Write Buffer Not Flushed Before Subprocess Read

**Problem:** The validator CLI consistently reports `"empty or unreadable config"` even when a valid JSON body is posted. The file exists on disk by name, but its content is missing when the subprocess opens it.

**Fix:** Add `tmp.flush()` immediately after `tmp.write(config_json)` and before the `subprocess.run` call, then also call `tmp.close()` before the subprocess runs so every buffered byte is written to the OS file.

**Explanation:** Python's file I/O keeps a write buffer in user-space memory and only sends data to the kernel (and therefore to disk) when the buffer fills, when the file is closed, or when you explicitly call `flush()`. The original code calls `subprocess.run` while the buffer still holds the JSON string, so the subprocess opens the file and reads zero bytes. Calling `flush()` drains the user-space buffer to the kernel. Calling `close()` additionally ensures the OS fully commits the data and releases the file descriptor before the validator process opens the file. On some platforms (notably Windows), a process cannot open a file that another process still holds open, so closing before the subprocess is the safest approach regardless.

---

### Issue 2: Temp File Leaked on Exception

**Problem:** If `subprocess.run` raises (e.g., the binary is not found, or an `OSError` occurs), `tmp.close()` and `os.unlink()` are never called, leaving an open file descriptor and a stale `.json` file in the temp directory for the lifetime of the process or until the OS cleans it up.

**Fix:** Wrap the `subprocess.run` call in a `try/finally` block. The `finally` clause calls `os.unlink(tmp.name)` inside its own `try/except FileNotFoundError` so cleanup always runs whether or not the subprocess succeeds or raises.

**Explanation:** `delete=False` is required here because the file must persist on disk long enough for the subprocess to open it by name — but that means Python will not automatically delete it. Without a `finally` block, any exception between file creation and the end of the function leaves the file behind. Over time (or under load) this fills the temp directory. The `try/except FileNotFoundError` inside `finally` is a defensive guard: if something else already removed the file, `unlink` would raise and mask the original exception, which is undesirable.
