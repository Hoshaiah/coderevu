## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — User-supplied search term is interpolated directly into a SQL query
# ------------------------------------------------------------------------
import sqlite3

def search_employees(db_path: str, name_query: str) -> list[dict]:
    # CHANGE 2: use a context manager so the connection closes even if an error is raised
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        # CHANGE 1: use a parameterized query instead of f-string interpolation to prevent SQL injection
        sql = "SELECT id, name, department, salary FROM employees WHERE name LIKE ?"
        cursor.execute(sql, (f"%{name_query}%",))
        columns = [desc[0] for desc in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
    return results
```

## Explanation

### Issue 1: SQL Injection via String Interpolation

**Problem:** The f-string embeds `name_query` directly into the SQL text before the database ever sees the query. An attacker who sends `' OR '1'='1` as the search term turns the WHERE clause into `WHERE name LIKE '%' OR '1'='1'%`, returning every row. A more destructive payload like `'; DROP TABLE employees; --` can destroy data or exfiltrate the entire database.

**Fix:** Replace the f-string query with a fixed SQL string using a `?` placeholder, then pass the user-controlled value as the second argument to `cursor.execute()`: `cursor.execute(sql, (f"%{name_query}%",))`. The LIKE wildcards are now part of the bound parameter value, not the SQL structure.

**Explanation:** When you interpolate a string into SQL yourself, the database receives a fully-formed query and has no way to distinguish data from commands. The `sqlite3` driver's parameterized query support sends the SQL template and the parameter values separately; the database engine treats the parameter as a scalar value, never as SQL syntax. This means a user typing `'; DROP TABLE employees; --` is seen by the database as a literal search string, not a command. Note that the `%` wildcards must move into the bound value — you cannot put them in the SQL template next to the `?` placeholder.

---

### Issue 2: Connection Leak on Exception

**Problem:** If any line between `sqlite3.connect()` and `conn.close()` raises an exception, `conn.close()` is never called. The connection stays open until the garbage collector reclaims it, which is non-deterministic. Under load, this exhausts file descriptors or SQLite's connection limit.

**Fix:** Replace the explicit `conn = sqlite3.connect(db_path)` / `conn.close()` pair with a `with sqlite3.connect(db_path) as conn:` block. The `with` statement guarantees the connection is closed when the block exits, whether normally or via an exception.

**Explanation:** Python's `sqlite3.Connection` implements the context manager protocol, so using `with` calls the appropriate teardown automatically. The original code relied on reaching `conn.close()` in the happy path only. Any exception — for example, a `cursor.description` attribute error on an empty result, or a network-level storage failure — would skip that line entirely. Using `with` makes cleanup unconditional without requiring a `try/finally` block. One related pitfall: `sqlite3`'s context manager commits or rolls back transactions but does not close the connection in older Python versions; as of Python 3.12 the connection is closed on `__exit__`, so for older targets an explicit `conn.close()` inside a `finally` block is a safe alternative.
