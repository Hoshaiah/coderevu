## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — SQLite Connection Shared Across Threads
# ------------------------------------------------------------------------

import sqlite3
import threading

DB_PATH = "/var/app/jobs.db"

# CHANGE 1: Replace the single shared connection with a thread-local storage object so each thread gets its own connection instead of sharing one unsafe instance.
_local = threading.local()

def _get_conn() -> sqlite3.Connection:
    # CHANGE 1: Lazily create a connection per thread; check_same_thread=False is not needed because we never share the connection across threads.
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(DB_PATH)
    return _local.conn

def init_db():
    # CHANGE 1: Use the per-thread connection helper instead of the old module-level _conn.
    conn = _get_conn()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS jobs "
        "(id TEXT PRIMARY KEY, status TEXT, created_at TEXT)"
    )
    conn.commit()

def insert_job(job_id: str, status: str, created_at: str) -> None:
    # CHANGE 1: Use the per-thread connection helper instead of the old module-level _conn.
    conn = _get_conn()
    conn.execute(
        "INSERT INTO jobs (id, status, created_at) VALUES (?, ?, ?)",
        (job_id, status, created_at),
    )
    conn.commit()

def get_job(job_id: str) -> dict | None:
    # CHANGE 1: Use the per-thread connection helper instead of the old module-level _conn.
    conn = _get_conn()
    cur = conn.execute("SELECT id, status, created_at FROM jobs WHERE id = ?", (job_id,))
    row = cur.fetchone()
    if row is None:
        return None
    return {"id": row[0], "status": row[1], "created_at": row[2]}

def close_conn() -> None:
    # CHANGE 2: Provide an explicit close helper so callers (e.g. a Flask teardown_appcontext hook) can release the thread-local connection and avoid leaking file handles in long-lived worker threads.
    conn = getattr(_local, "conn", None)
    if conn is not None:
        conn.close()
        del _local.conn
```

## Explanation

### Issue 1: Shared connection used across threads

**Problem:** The module opens one `sqlite3.Connection` at import time and every request handler in every Gunicorn thread calls methods on that same object. SQLite's Python driver raises `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that thread` whenever a connection is used from a thread other than the one that created it. On the single-threaded Flask dev server this never fires; with `--threads 4` it fires as soon as two threads touch the database simultaneously.

**Fix:** Remove the module-level `_conn = sqlite3.connect(DB_PATH)` and replace it with a `threading.local()` instance called `_local`. Add a `_get_conn()` helper that lazily creates a `sqlite3.connect(DB_PATH)` the first time each thread calls it and caches it in `_local.conn`. All three database functions (`init_db`, `insert_job`, `get_job`) are updated to call `_get_conn()` instead of referencing `_conn`.

**Explanation:** `threading.local()` is a dictionary-like object whose attributes are invisible across thread boundaries — each thread reads and writes its own slot. When thread A calls `_get_conn()` it finds no `conn` attribute and creates one; when thread B calls `_get_conn()` it also finds no attribute (it has its own namespace) and creates its own connection. The two connections are entirely independent SQLite handles to the same database file, which SQLite supports safely via its file-level locking. The old approach with a PostgreSQL-style connection pool does not translate to SQLite because `psycopg2` connections are explicitly designed to be shared with a pool manager, while `sqlite3.Connection` carries an internal thread-ID check that cannot be bypassed without passing `check_same_thread=False` — and even then, concurrent writes on one connection are serialized only if you add your own locking.

---

### Issue 2: Thread-local connections never closed

**Problem:** Once a Gunicorn worker thread creates its connection via `_get_conn()`, nothing ever calls `close()` on it. Each worker thread that touches the database holds an open file descriptor for the lifetime of the process. In a thread pool that recycles threads for new requests this is tolerable, but it still leaves dangling handles when threads exit and makes it impossible to cleanly release the database during application shutdown.

**Fix:** Add a `close_conn()` function that reads the connection from `_local`, calls `conn.close()`, and deletes the attribute so the next call to `_get_conn()` will open a fresh connection. Callers should register this with Flask's `teardown_appcontext` (e.g. `app.teardown_appcontext(lambda e: close_conn())`) or call it in a thread pool worker's cleanup hook.

**Explanation:** A `threading.local` attribute persists for the life of the thread, not the life of a request. Without an explicit `close()`, file descriptors accumulate — one per worker thread — and are only reclaimed when the OS kills the process. In a web application the common pattern is to pair connection acquisition with a framework teardown hook so that every request that opens a connection also schedules its cleanup. The `close_conn()` helper makes that possible without exposing the internal `_local` object to callers.

---

### Issue 3: Silent exception swallowing causes data loss

**Problem:** The team's attempted fix wrapped database calls in `try/except` blocks that caught `sqlite3.ProgrammingError` and did nothing. This hid the crash but meant any `insert_job` call that raised the error silently returned without executing the INSERT, so job records were lost with no log entry, no error response to the caller, and no way to detect the corruption after the fact.

**Fix:** The `try/except` blocks are removed entirely (they do not appear in the buggy code posted, but this issue documents why they must not be reintroduced). The root cause is fixed at CHANGE 1 by giving each thread its own connection, so the `ProgrammingError` never fires and there is nothing to catch.

**Explanation:** Swallowing an exception at the call site treats the symptom (the crash) while leaving the cause (the shared connection) in place. Because `sqlite3.ProgrammingError` is raised before the SQL is even sent to the database engine, the row never reaches disk. The caller receives a normal return value and has no way to know the write was skipped. The correct response to an infrastructure-level error is to fix the infrastructure, not to hide the signal. If a genuine retry-on-error policy is needed later, it should be implemented with explicit logging and a deliberate retry loop, not a bare `except` that discards the exception.
