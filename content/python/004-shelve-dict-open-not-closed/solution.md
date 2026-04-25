## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — shelve Database Left Open
# ------------------------------------------------------------------------

import shelve
from contextlib import contextmanager
from typing import Any

CACHE_PATH = "/tmp/api_cache"

# CHANGE 2: Extract a context-manager helper so open/close logic lives in one place and every caller automatically benefits from the try/finally guarantee.
@contextmanager
def _open_db():
    # CHANGE 1: Use try/finally (via contextmanager) so db.close() is always called even when a KeyboardInterrupt or exception fires between open() and close().
    db = shelve.open(CACHE_PATH)
    try:
        yield db
    finally:
        db.close()

def get_cached(key: str) -> Any | None:
    # CHANGE 1: Replace bare open/close pair with the context manager so the shelf is closed on any exit path.
    with _open_db() as db:
        return db.get(key)

def set_cached(key: str, value: Any) -> None:
    # CHANGE 1: Replace bare open/close pair with the context manager so the shelf is closed on any exit path.
    with _open_db() as db:
        db[key] = value

def invalidate(key: str) -> None:
    # CHANGE 1: Replace bare open/close pair with the context manager so the shelf is closed on any exit path.
    with _open_db() as db:
        if key in db:
            del db[key]
```

## Explanation

### Issue 1: Shelf Not Closed on Abnormal Exit

**Problem:** If the process receives a `KeyboardInterrupt` (Ctrl-C) or any exception is raised between `shelve.open()` and `db.close()`, `close()` is never called. The `dbm` backend leaves its write-ahead or lock file on disk in a partially-flushed state. The next run of the tool either fails to open the shelf at all (`dbm.error`) or reads stale data that was never properly synced.

**Fix:** Replace every `db = shelve.open(...)` / `db.close()` pair with a `with _open_db() as db:` block. The `_open_db` context manager wraps `shelve.open` in a `try/finally` so `db.close()` executes unconditionally, including on `KeyboardInterrupt` and arbitrary exceptions.

**Explanation:** Python's `shelve` module does not flush buffered writes to disk until `close()` (or an explicit `sync()`) is called. If execution jumps out of the function via an exception before `close()`, the underlying `dbm` file may hold a partial write or an exclusive lock. A `try/finally` block guarantees the `finally` clause runs even when an exception propagates — this is the same reason file I/O should always use `with open(...)`. Using `contextlib.contextmanager` lets us express that guarantee once and reuse it in all three functions, so a future fourth function can't accidentally forget it.

---

### Issue 2: Open/Close Logic Duplicated Across Every Function

**Problem:** Every public function contains an identical `db = shelve.open(CACHE_PATH)` / `db.close()` sequence. Any change to error-handling, the path, or open flags must be made in three places, and it is easy to add a fourth function that omits `close()` entirely.

**Fix:** Add the `_open_db()` context manager (marked `# CHANGE 2`) that centralises `shelve.open` and the `try/finally` close. All three functions delegate to it with a single `with _open_db() as db:` line.

**Explanation:** Duplicated resource-management code is a maintenance hazard: the fix for Issue 1 would have to be applied three times instead of once, and a reviewer has to check each copy independently. A single context manager gives one authoritative place to adjust the path, add flags like `flag='c'`, or change sync behaviour. It also makes each public function's intent immediately readable — the body contains only the meaningful logic, not boilerplate open/close calls.
