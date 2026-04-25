---
slug: sqlite-rowcount-after-select
track: python
orderIndex: 47
title: rowcount Misuse on SELECT Query
difficulty: easy
tags:
  - correctness
  - database
  - api-misuse
language: python
---

## Context

This helper lives in `db/user_repo.py` and is called from an admin endpoint that checks whether a username is already taken before creating a new account. The surrounding code returns HTTP 409 Conflict if `username_exists()` returns `True`.

Support has received reports that duplicate accounts are being created — two users end up with the same username. The registration endpoint returns 200 OK both times, suggesting `username_exists()` returned `False` even for an already-registered name.

A developer added a debug log and confirmed that `cursor.rowcount` was returning `-1` for queries against rows that definitely existed in the database. They assumed `rowcount` would behave like `len()` on the result set.

## Buggy code

```python
import sqlite3
from pathlib import Path

DB_PATH = Path("app.db")

def username_exists(username: str) -> bool:
    """
    Return True if the given username is already registered.
    """
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "SELECT id FROM users WHERE username = ? LIMIT 1",
            (username,),
        )
        return cursor.rowcount > 0
```
