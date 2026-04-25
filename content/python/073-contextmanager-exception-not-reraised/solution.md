## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Context Manager Silently Swallows Exceptions
# ------------------------------------------------------------------------

import contextlib
from typing import Any

@contextlib.contextmanager
def managed_transaction(conn: Any):
    """
    Context manager: commits on success, rolls back and re-raises on error.
    """
    try:
        yield conn
    except Exception as exc:
        conn.rollback()
        print(f"Transaction rolled back due to: {exc}")
        # CHANGE 1: re-raise the exception so callers are not misled into thinking the transaction succeeded; without this the exception is silently swallowed.
        raise
    else:
        conn.commit()

def transfer_funds(conn, from_id: int, to_id: int, amount: float) -> None:
    with managed_transaction(conn) as c:
        c.execute(
            "UPDATE accounts SET balance = balance - ? WHERE id = ?",
            (amount, from_id),
        )
        c.execute(
            "UPDATE accounts SET balance = balance + ? WHERE id = ?",
            (amount, to_id),
        )
    # CHANGE 2: this line now only executes when the with block exits cleanly (no exception), because a failed transaction re-raises and unwinds the call stack.
    print("Transfer complete")
```

## Explanation

### Issue 1: Exception swallowed after rollback

**Problem:** When a database error occurs inside the `with managed_transaction(...)` block, `rollback()` is called but the exception is then discarded. The `with` block exits normally from the caller's perspective, so any code after the block runs as if the transaction committed successfully — even though no data was written.

**Fix:** Add a bare `raise` statement immediately after the `print(...)` call in the `except` block (the `# CHANGE 1` site). This re-raises the original exception, preserving its type, message, and traceback.

**Explanation:** Python's `@contextlib.contextmanager` maps the generator's `except` block directly to the context manager's `__exit__` method. If `__exit__` returns a truthy value (or in this case, if the generator simply resumes without re-raising), Python treats the exception as handled and suppresses it. A bare `raise` inside the `except` block propagates the original exception out of the `with` statement, unwinding the call stack normally. Without it, the caller has no way to distinguish a successful commit from a rolled-back failure. One related pitfall: swallowing and then returning `False` explicitly would have the same silent effect — the fix must actively re-raise, not just avoid catching.

---

### Issue 2: Post-block code runs on failure

**Problem:** The `print("Transfer complete")` line after the `with` block executes whether or not the transaction succeeded. Before the fix, because the exception was swallowed, this line always ran, producing misleading output and allowing downstream code to proceed as if data was persisted.

**Fix:** No code change is needed at the `print` line itself (it is correct as written), but the `# CHANGE 2` comment at that site documents that the behavior is now correct only because `CHANGE 1` causes a failed transaction to raise an exception that skips past this line entirely.

**Explanation:** Once `raise` is added in the `except` block, a failed transaction throws an exception out of the `with` statement. Python then unwinds the call stack, skipping every subsequent statement in `transfer_funds` — including `print("Transfer complete")`. This is the standard Python control-flow guarantee: an unhandled exception propagates upward until something catches it. The post-block print was always logically wrong for the failure path; re-raising in the context manager is what enforces the correct execution order without changing the caller code at all.
