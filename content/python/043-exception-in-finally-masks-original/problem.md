---
slug: exception-in-finally-masks-original
track: python
orderIndex: 43
title: Finally Block Swallows Real Exception
difficulty: easy
tags:
  - correctness
  - error-handling
  - exceptions
language: python
---

## Context

This database helper lives in `db/session.py` and is used throughout the application for units of work that should roll back on failure. It wraps a raw `psycopg2` connection and is called from dozens of API endpoints.

Engineers have been filing tickets saying certain API errors return a cryptic `AttributeError: 'NoneType' object has no attribute 'rollback'` instead of the original application exception (e.g., a `ValueError` from input validation). This makes it very hard to diagnose what actually went wrong from logs or Sentry — the real error is invisible.

The issue appears only on code paths that raise before the connection is successfully opened. Paths that obtain a connection and then fail show the original error correctly in some versions but inconsistently in others.

## Buggy code

```python
import psycopg2

DSN = "postgresql://user:pass@localhost/mydb"

def run_in_transaction(fn):
    conn = None
    try:
        conn = psycopg2.connect(DSN)
        result = fn(conn)
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
```
