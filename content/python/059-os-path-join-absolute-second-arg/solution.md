## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — os.path.join Discards Base on Absolute
# ------------------------------------------------------------------------

import os
from flask import Flask, request, abort
from werkzeug.utils import secure_filename

app = Flask(__name__)
UPLOAD_DIR = "/var/app/uploads"

@app.route("/upload", methods=["POST"])
def upload_file():
    f = request.files.get("file")
    if f is None or f.filename == "":
        abort(400)

    filename = secure_filename(f.filename)
    if not filename:
        abort(400)

    # CHANGE 1: Strip any leading slashes from filename before joining so os.path.join never treats it as an absolute path and discards UPLOAD_DIR.
    filename = filename.lstrip("/")
    if not filename:
        abort(400)

    dest_path = os.path.join(UPLOAD_DIR, filename)

    # CHANGE 2: Resolve the real path and assert it starts with UPLOAD_DIR to block any remaining path traversal (e.g. '../' sequences) that slipped through.
    real_dest = os.path.realpath(dest_path)
    real_upload_dir = os.path.realpath(UPLOAD_DIR)
    if not real_dest.startswith(real_upload_dir + os.sep):
        abort(400)

    f.save(dest_path)
    return {"saved_to": dest_path}, 200
```

## Explanation

### Issue 1: `os.path.join` Drops Base on Absolute Filename

**Problem:** When a user uploads a file whose name begins with `/` (e.g. `/avatar.png`), `os.path.join(UPLOAD_DIR, "/avatar.png")` returns `"/avatar.png"` — the UPLOAD_DIR component is silently thrown away. Ops observed files written to the filesystem root instead of `/var/app/uploads`.

**Fix:** Call `filename.lstrip("/")` on the result of `secure_filename` before passing it to `os.path.join`. This is the `# CHANGE 1` site. If stripping leaves an empty string, the request is rejected with a 400.

**Explanation:** `os.path.join` follows POSIX path semantics: if any component is absolute (starts with `/`), all previous components are discarded and that component becomes the new base. So even though `UPLOAD_DIR` is correct, an absolute filename resets the join. `secure_filename` from Werkzeug is designed to sanitise for safe filenames, but it does not guarantee the result is relative — a filename like `/avatar.png` passes through with the slash intact. Stripping leading slashes makes the filename relative before the join happens, so `os.path.join` appends it to `UPLOAD_DIR` as intended. A related pitfall: Windows UNC paths or drive letters can cause similar resets on non-POSIX systems.

---

### Issue 2: No Canonical-Path Boundary Check Allows Traversal Sequences

**Problem:** Even after `secure_filename` and stripping leading slashes, a crafted filename containing `../` sequences (or symlinks on disk) could resolve to a path outside `UPLOAD_DIR`. The application would silently write the file to that resolved location without any error.

**Fix:** After constructing `dest_path`, call `os.path.realpath` on both `dest_path` and `UPLOAD_DIR` to resolve all symlinks and `..` components, then assert that the resolved destination starts with the resolved upload directory followed by `os.sep`. This is the `# CHANGE 2` site. A mismatch triggers a 400 abort.

**Explanation:** `os.path.join(UPLOAD_DIR, "../../etc/passwd")` produces `/var/app/uploads/../../etc/passwd`, which the OS resolves to `/etc/passwd`. `os.path.realpath` collapses all `..` segments and symlink hops into a canonical absolute path, so the check `real_dest.startswith(real_upload_dir + os.sep)` reliably detects any path that escapes the upload directory. The `+ os.sep` suffix prevents a false-positive match where `UPLOAD_DIR` is `/var/app/uploads` and `real_dest` resolves to `/var/app/uploads_evil/file.txt` — without the separator suffix, `startswith` would incorrectly allow that path. Checking the realpath also catches symlinks inside `UPLOAD_DIR` that point outside it.
