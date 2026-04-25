## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Predictable Temp File Path Race
# ------------------------------------------------------------------------

import os
import subprocess
import tempfile

def render_pdf(html_content: str) -> bytes:
    # CHANGE 1: Use NamedTemporaryFile with delete=False to get a kernel-assigned unique path, preventing TOCTOU symlink attacks from predictable /tmp/report_<pid> paths.
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False) as tmp_html_f:
        tmp_html = tmp_html_f.name
        tmp_html_f.write(html_content)

    # CHANGE 1: Same fix for the PDF output path — NamedTemporaryFile creates the file atomically with a random name so no attacker can pre-place a symlink there.
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf_f:
        tmp_pdf = tmp_pdf_f.name

    # CHANGE 2: Wrap the subprocess call and all subsequent work in try/finally so temp files are always removed even when an exception is raised.
    try:
        subprocess.run(
            ["wkhtmltopdf", tmp_html, tmp_pdf],
            check=True,
            capture_output=True,
        )

        with open(tmp_pdf, "rb") as f:
            pdf_bytes = f.read()
    finally:
        # CHANGE 2: Unconditionally remove both temp files; suppress FileNotFoundError in case one was never created or already removed.
        for path in (tmp_html, tmp_pdf):
            try:
                os.remove(path)
            except FileNotFoundError:
                pass

    return pdf_bytes
```

## Explanation

### Issue 1: Predictable path enables symlink attack

**Problem:** The original code builds temp file paths as `/tmp/report_<pid>.html` and `/tmp/report_<pid>.pdf`. Because a process's PID is visible to every user on the system, a local attacker can race the process: create a symlink at `/tmp/report_<pid>.html` pointing to, say, `/etc/cron.d/evil` before the application opens the file, causing `open(..., 'w')` to follow the symlink and write HTML content (or any attacker-chosen content) into that target file.

**Fix:** Replace the hand-crafted paths with `tempfile.NamedTemporaryFile(delete=False)` (CHANGE 1). This yields `tmp_html` and `tmp_pdf` as the `.name` attribute of each temporary file object, which is a kernel-generated, unpredictable path like `/tmp/tmpabc123.html`.

**Explanation:** `open()` in Python does not refuse to follow symlinks, so writing to a symlink writes to whatever it points to. The only safe mitigation is to never let an attacker know the path in advance. `tempfile.NamedTemporaryFile` uses `os.open` with `O_CREAT | O_EXCL` internally, which atomically creates a new file and fails if anything already exists at that path — including a pre-placed symlink on many platforms. The randomised suffix (128 bits of entropy by default on CPython) makes the path unpredictable. A related pitfall: even with random names, `/tmp` should ideally have the sticky bit set (it does on Linux by default) so users cannot delete each other's files and replace them with symlinks.

---

### Issue 2: No cleanup on exception

**Problem:** If `subprocess.run` raises (e.g., `wkhtmltopdf` returns a non-zero exit code with `check=True`), the function exits immediately and `os.remove` is never called. The HTML temp file, which contains the full report content, stays on disk until the OS reboots or an operator manually cleans `/tmp`.

**Fix:** Wrap the subprocess call and the read step in a `try/finally` block (CHANGE 2). The `finally` clause iterates over both paths and calls `os.remove` on each, suppressing `FileNotFoundError` with an inner `try/except` in case a file was never successfully created.

**Explanation:** Python's `try/finally` guarantees the `finally` block runs whether the `try` body completes normally or raises any exception. Without it, every exception thrown inside the function leaks files. The inner `try/except FileNotFoundError` handles the edge case where the PDF file was never written because `wkhtmltopdf` failed before creating it — without that guard, the cleanup itself would raise and mask the original exception. A `contextlib.ExitStack` or a custom context manager are alternative patterns that scale better when you have many resources to clean up.
