## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — subprocess.PIPE Deadlock on Large Output
# ------------------------------------------------------------------------

import subprocess
import shlex
from datetime import date

def run_report(start: date, end: date, report_type: str) -> bytes:
    """
    Run the external report binary and return its stdout as bytes.
    """
    cmd = ["/usr/local/bin/report-gen",
           "--start", start.isoformat(),
           "--end", end.isoformat(),
           "--format", report_type]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    # CHANGE 1: Replace proc.wait() + manual reads with proc.communicate(), which drains both pipes concurrently before waiting, preventing the OS pipe-buffer deadlock.
    stdout_data, stderr_data = proc.communicate()

    if proc.returncode != 0:
        # CHANGE 2: Use the stderr_data already captured by communicate() instead of calling proc.stderr.read() after wait(), which could block or return empty bytes.
        raise RuntimeError(f"report-gen failed: {stderr_data.decode()}")

    return stdout_data
```

## Explanation

### Issue 1: `proc.wait()` deadlocks on large pipe output

**Problem:** When running large date-range reports, the web worker hangs indefinitely. The external binary itself finishes quickly when run from a shell, but inside Python the process is stuck in `write()` while the Python process is stuck in `waitpid()`.

**Fix:** Replace the `proc.wait()` call and the subsequent `proc.stdout.read()` / `proc.stderr.read()` calls with a single `proc.communicate()` call, which returns `(stdout_data, stderr_data)` as shown at CHANGE 1.

**Explanation:** The OS gives each pipe a fixed buffer — typically 64 KB on Linux. `proc.wait()` blocks the Python process until the child exits, but it never reads from the pipes. When the child's output exceeds 64 KB, the child's `write()` syscall blocks because the pipe buffer is full. Now both processes are stuck: the child waiting for the parent to drain the pipe, and the parent waiting for the child to exit. `proc.communicate()` solves this by reading stdout and stderr in a loop (using threads or `select`) while also waiting for the process to finish, so the pipe buffers never fill. The threshold for this deadlock is roughly the pipe buffer size, which is why small reports (a few KB) always succeed and reports beyond ~64 KB reliably hang.

---

### Issue 2: `proc.stderr.read()` called after deadlock-prone `wait()`

**Problem:** After `proc.wait()` returns (in cases where it does return, e.g., small output), the code calls `proc.stderr.read()` to build the error message. In any scenario where both stdout and stderr produce large output, reading stderr after the fact can also deadlock or return partial data.

**Fix:** At CHANGE 2, replace `proc.stderr.read().decode()` with `stderr_data.decode()`, using the `stderr_data` bytes already fully captured by `proc.communicate()` at CHANGE 1.

**Explanation:** `proc.communicate()` drains both stdout and stderr concurrently and returns their complete contents. Once `communicate()` has returned, the child has exited and both pipe file descriptors are closed, so `stderr_data` is guaranteed to be the full stderr output. Calling `proc.stderr.read()` after a `wait()`-based approach risks the same pipe-buffer deadlock if the failing process writes a large error message, and in practice it can also return an empty `bytes` object because the OS may have already closed or flushed the descriptor inconsistently. Using the data from `communicate()` is both safer and simpler.
