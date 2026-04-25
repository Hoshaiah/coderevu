## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Finally Block Swallows Real Exception
# ------------------------------------------------------------------------

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
        # CHANGE 1: Guard rollback with `conn is not None` so a pre-connection exception propagates cleanly instead of raising AttributeError on None.
        if conn is not None:
            conn.rollback()
        raise
    finally:
        # CHANGE 2: Use `conn is not None` instead of truthy `if conn` to guarantee close() is called regardless of how the connection object evaluates as a bool.
        if conn is not None:
            conn.close()
```

## Explanation

### Issue 1: Unguarded `rollback()` on `None` connection

**Problem:** When `fn(conn)` raises before `psycopg2.connect` is even called — or when `connect` itself raises — `conn` remains `None`. The `except` block then calls `conn.rollback()`, which throws `AttributeError: 'NoneType' object has no attribute 'rollback'`. Python replaces the original exception with this new one, so the real error (e.g., a `ValueError` from input validation) is lost.

**Fix:** Wrap the `conn.rollback()` call in `if conn is not None:` so rollback is only attempted when a real connection object exists. The `raise` statement after the guard re-raises the original exception in all cases.

**Explanation:** In Python's exception handling, if a new exception is raised inside an `except` block before the original `raise` executes, the new exception becomes the one that propagates (with the original chained as `__context__`). In practice, loggers and Sentry often display only the outermost exception, so the `AttributeError` is what engineers see. By guarding `rollback()`, the except block becomes a no-op when `conn` is `None`, and the bare `raise` propagates the original exception untouched. A related pitfall: if `connect` raises a `psycopg2.OperationalError`, the same unguarded code would still swallow it with an `AttributeError`.

---

### Issue 2: Truthy check `if conn:` may skip `close()`

**Problem:** The `finally` block uses `if conn:` to decide whether to close the connection. A `psycopg2` connection object can in principle evaluate as falsy depending on its internal state or library version (some drivers implement `__bool__` based on closed status). If the object evaluates as falsy, `close()` is never called, leaking the connection.

**Fix:** Replace `if conn:` with `if conn is not None:` in the `finally` block. This checks identity against `None` rather than the object's boolean value, so any real connection object — regardless of its truthiness — will have `close()` called.

**Explanation:** Python's `if obj:` calls `obj.__bool__()` (or `__len__()`), which is defined by the object, not by you. The intent here is only to distinguish "we have a connection object" from "we never got one", which is exactly what an identity check (`is not None`) expresses. Using a truthiness check is an implicit contract with the library that it will never return a falsy-but-open connection, which is an assumption you cannot safely make. The `is not None` guard is also more readable: it precisely communicates the intent to every future reader.
