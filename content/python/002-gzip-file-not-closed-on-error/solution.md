## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — GzipFile Leaks Handle on Write Error
# ------------------------------------------------------------------------

import gzip
import json

def write_compressed_batch(path: str, records: list[dict]) -> None:
    # CHANGE 1 & 2: Use 'with' statement so the GzipFile is closed even if json.dumps or gz.write raises, preventing fd leaks.
    with gzip.open(path, "wt", encoding="utf-8") as gz:
        for record in records:
            line = json.dumps(record) + "\n"
            gz.write(line)
```

## Explanation

### Issue 1: File descriptor leaked on write error

**Problem:** When `json.dumps(record)` raises (e.g., a record contains a non-serialisable value) or `gz.write(line)` raises an `OSError` (e.g., NFS mount hiccup), execution jumps out of the function before `gz.close()` is reached. The underlying file descriptor is never closed. After thousands of calls with occasional errors, the process accumulates open `.gz` fds until the OS limit is hit and every subsequent `gzip.open` fails with `OSError: [Errno 24] Too many open files`.

**Fix:** Replace the bare `gz = gzip.open(...)` / `gz.close()` pair with a `with gzip.open(...) as gz:` block (CHANGE 1 & 2). The `with` statement guarantees `gz.__exit__` — which calls `gz.close()` — runs whether the body exits normally or via an exception.

**Explanation:** Python's `with` statement calls `__exit__` on the context manager unconditionally when the block ends, regardless of whether an exception was raised. `gzip.GzipFile` implements the context manager protocol, so wrapping the call in `with` is all that is needed. Without it, any exception thrown inside the loop short-circuits the rest of the function body, skipping `gz.close()` entirely. The file object is not collected immediately because CPython's reference-counting GC may not reclaim it before the worker picks up the next record batch — and in a multi-threaded process under load, temporary references held by the traceback machinery can delay collection further. The `with` pattern removes the dependency on GC timing entirely.

---

### Issue 2: Cleanup logic depends on error-free execution path

**Problem:** Placing `gz.close()` at the end of the function as a bare statement means cleanup only happens on the happy path. Any early `return`, uncaught exception, or future refactor that adds a conditional `return` inside the loop will silently skip the close. In a long-running worker called thousands of times per day, even a low error rate accumulates enough leaked fds to exhaust the per-process limit.

**Fix:** The `with gzip.open(...) as gz:` block at CHANGE 1 & 2 removes the explicit `gz.close()` call entirely. The context manager handles closing unconditionally, so there is no separate cleanup statement that can be accidentally bypassed.

**Explanation:** Relying on an explicit `close()` call is fragile because it must always be the last thing that executes in every possible code path. The `with` statement encodes that invariant structurally: the file is open for exactly the duration of the indented block, and `__exit__` fires at the end of that block no matter how control leaves it. This also makes the code easier to audit — a reviewer can see at a glance that the resource is bounded by the `with` block without tracing all possible exit paths.
