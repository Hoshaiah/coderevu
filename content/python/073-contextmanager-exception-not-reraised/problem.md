---
slug: contextmanager-exception-not-reraised
track: python
orderIndex: 73
title: Context Manager Silently Swallows Exceptions
difficulty: medium
tags:
  - correctness
  - resource-management
  - exceptions
language: python
---

## Context

`db/transaction.py` provides a context manager for database transactions. It's used throughout the service's data access layer in `with managed_transaction(conn):` blocks. The intent is to commit on clean exit and roll back on any exception, then re-raise the exception so the caller can handle it.

Engineers discovered that database errors inside `with managed_transaction(...)` blocks are silently eaten — code after the `with` block executes as if the transaction succeeded, but the database state was actually rolled back. This has caused several data consistency bugs where the application believed a write succeeded but no record was actually persisted.

The team added logging inside the context manager and confirmed that `rollback()` is being called correctly. The problem is with what happens to the exception after the rollback.

## Buggy code

```python
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
    # BUG: if an exception occurred above, execution continues here
    print("Transfer complete")
```
