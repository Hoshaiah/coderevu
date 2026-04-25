## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — rowcount Misuse on SELECT Query
# ------------------------------------------------------------------------

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
        # CHANGE 1: Replace cursor.rowcount (always -1 for SELECT in sqlite3) with fetchone(), which returns a row tuple if a match exists or None if it does not.
        return cursor.fetchone() is not None
```

## Explanation

### Issue 1: `rowcount` Always -1 for SELECT

**Problem:** Every call to `username_exists()` returns `False`, regardless of whether the username is in the database. This means the duplicate-account guard never triggers, so two users can register with the same username and both receive HTTP 200 OK.

**Fix:** Replace `cursor.rowcount > 0` with `cursor.fetchone() is not None`. `fetchone()` actually reads the first result row from the cursor and returns it as a tuple, or `None` when no row matched.

**Explanation:** The Python DB-API 2.0 spec (PEP 249) states that `rowcount` is undefined for `SELECT` statements — the driver has no obligation to populate it, and sqlite3 sets it to `-1` for every `SELECT`. So `-1 > 0` is always `False`. `fetchone()` is the correct way to check whether a `SELECT` returned any rows: it returns a tuple for a hit and `None` for a miss, making the `is not None` check a direct, reliable signal. A related pitfall: `cursor.fetchall()` would also work but retrieves all matching rows into memory; using `LIMIT 1` together with `fetchone()` keeps the query efficient by stopping the database scan after the first match.

---

### Issue 2: Result Set Never Fetched

**Problem:** The query executes and sqlite3 prepares a result cursor, but the code never calls any fetch method, so the row data is discarded without being read. This is harmless from a correctness standpoint only because Issue 1 is the primary failure, but it means the LIMIT 1 optimization provides no benefit without a corresponding fetch.

**Fix:** The same `cursor.fetchone()` call introduced in CHANGE 1 resolves this: it reads the pending row (or confirms absence) and closes out the cursor's result set cleanly.

**Explanation:** When `conn.execute()` runs a `SELECT`, sqlite3 stages the result set but does not materialize rows in Python until you call `fetchone()`, `fetchall()`, or iterate the cursor. Without a fetch call the rows sit in the cursor object unused. The `LIMIT 1` in the SQL tells the database engine to stop after finding one matching row, but that optimization is only meaningful when the client actually retrieves that row — otherwise the round-trip still happens and the result is silently dropped. Pairing `LIMIT 1` with `fetchone()` is the intended pattern: the database stops early and the client reads exactly the one row it needs.
