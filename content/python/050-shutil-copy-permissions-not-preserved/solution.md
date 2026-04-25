## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — shutil.copy Drops File Permissions
# ------------------------------------------------------------------------

import shutil
import os

def stage_binary(src_path: str, dest_path: str) -> None:
    """
    Atomically replace dest_path with the binary at src_path.
    Preserves the destination directory's ownership.
    """
    dest_dir = os.path.dirname(dest_path)
    tmp_dest = os.path.join(dest_dir, ".myapp.tmp")

    # CHANGE 1: Use shutil.copy2 instead of shutil.copy so that metadata (including permission bits) is copied from src_path to tmp_dest, not just file content.
    shutil.copy2(src_path, tmp_dest)

    # CHANGE 2: Explicitly set the executable permission on the staged temp file before the atomic rename, ensuring the final binary is always mode 0o755 regardless of umask or prior temp-file state.
    os.chmod(tmp_dest, 0o755)

    # Atomically replace the destination
    os.replace(tmp_dest, dest_path)

    print(f"Installed binary to {dest_path}")
```

## Explanation

### Issue 1: `shutil.copy` discards permission metadata

**Problem:** After `stage_binary` runs, the installed binary at `dest_path` is missing its executable bit. Operators see `Permission denied` when they invoke the CLI immediately after an update, even though the file content is correct.

**Fix:** Replace `shutil.copy(src_path, tmp_dest)` with `shutil.copy2(src_path, tmp_dest)`. `shutil.copy2` copies both the file content and the file's stat metadata (including permission bits), while `shutil.copy` copies only content and a best-effort permission copy that does not reliably carry the mode through.

**Explanation:** `shutil.copy` internally calls `shutil.copyfile` (content) then `shutil.copymode` (permissions). `shutil.copymode` tries to mirror the mode, but on some platforms and in some configurations it can be silently skipped or partially applied. `shutil.copy2` additionally calls `shutil.copystat`, which transfers the full stat result including mode bits, timestamps, and flags. Switching to `copy2` is the minimal change that makes the copy step reliably transfer the `0o755` mode from the source temp file to `tmp_dest`.

---

### Issue 2: umask can silently strip executable bits from the temp file

**Problem:** Even after switching to `shutil.copy2`, the process umask can mask out bits when the temp file is first created, leaving it without the executable bit before `copy2` has a chance to apply the source mode. The resulting binary is still non-executable after `os.replace`.

**Fix:** Add `os.chmod(tmp_dest, 0o755)` immediately after the `shutil.copy2` call and before `os.replace`. This explicitly forces the mode to `0o755` on the temp file in the destination directory before the atomic rename.

**Explanation:** When `shutil.copy2` creates the destination file, the OS applies the process's umask to the initial file creation, potentially stripping bits like `0o111` (execute). `copy2` then attempts to `chmod` the file to match the source, but on Linux that `chmod` call is not masked by umask, so for a normal running process this usually works. However, making the desired mode explicit with `os.chmod(tmp_dest, 0o755)` removes any ambiguity: regardless of how `tmp_dest` was created or what the process umask is, the temp file will have exactly `0o755` before it replaces the destination. Because `os.replace` is a rename and does not re-apply permissions, the mode set on `tmp_dest` is exactly the mode the final `dest_path` will have.
