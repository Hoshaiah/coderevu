---
slug: sqlite-connection-shared-across-threads
track: python
orderIndex: 28
title: SQLite Connection Shared Across Threads
difficulty: medium
tags:
  - concurrency
  - resource-management
  - database
language: python
---

## Context

`db/store.py` manages a lightweight SQLite database used by a Flask application to store job metadata. A single connection is opened at module import time and reused for all requests. This pattern was chosen to avoid connection overhead, mirroring a pattern the team had used with PostgreSQL connection pools.

Under concurrent load the application crashes intermittently with `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that thread`. On single-threaded testing everything works perfectly. The Flask dev server (single-threaded) never triggers the error; it only appears in production with Gunicorn workers set to `--threads 4`.

The team tried wrapping the query calls in `try/except` to swallow the error, which made the crashes silent but caused data corruption — some inserts appeared to be silently dropped.

## Buggy code

```python
import sqlite3
import threading

DB_PATH = "/var/app/jobs.db"

# Single shared connection opened at import time
_conn = sqlite3.connect(DB_PATH)

def init_db():
    _conn.execute(
        "CREATE TABLE IF NOT EXISTS jobs "
        "(id TEXT PRIMARY KEY, status TEXT, created_at TEXT)"
    )
    _conn.commit()

def insert_job(job_id: str, status: str, created_at: str) -> None:
    _conn.execute(
        "INSERT INTO jobs (id, status, created_at) VALUES (?, ?, ?)",
        (job_id, status, created_at),
    )
    _conn.commit()

def get_job(job_id: str) -> dict | None:
    cur = _conn.execute("SELECT id, status, created_at FROM jobs WHERE id = ?", (job_id,))
    row = cur.fetchone()
    if row is None:
        return None
    return {"id": row[0], "status": row[1], "created_at": row[2]}
```
