## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Generator Finally Block Never Runs
# ------------------------------------------------------------------------

import psycopg2
from typing import Iterator

def stream_rows(conn, query: str, params=()) -> Iterator[dict]:
    cursor = conn.cursor()
    try:
        cursor.execute(query, params)
        columns = [desc[0] for desc in cursor.description]
        for row in cursor:
            yield {col: val for col, val in zip(columns, row)}
    finally:
        cursor.close()

def preview_rows(conn, query: str, limit: int = 100) -> list[dict]:
    import itertools
    gen = stream_rows(conn, query)
    # CHANGE 1: Wrap generator in a contextmanager so .close() is called even when islice stops early, triggering the finally block.
    # CHANGE 2: Use try/finally to explicitly call gen.close() after islice, which throws GeneratorExit into the generator and runs its finally block.
    try:
        return list(itertools.islice(gen, limit))
    finally:
        gen.close()
```

## Explanation

### Issue 1: Generator `finally` skipped on partial iteration

**Problem:** When a generator is not fully consumed, its `finally` block does not run automatically. Ops see database connections accumulating because `cursor.close()` inside `stream_rows` is never called when `islice` stops after `limit` rows.

**Fix:** In `preview_rows`, wrap the `list(itertools.islice(gen, limit))` call in a `try/finally` block and call `gen.close()` in the `finally` clause. This is the `CHANGE 1` / `CHANGE 2` site.

**Explanation:** A Python generator's `finally` block only runs when the generator is exhausted (raises `StopIteration`) or when `.close()` is called on it. `.close()` works by throwing a `GeneratorExit` exception into the generator at the point it is suspended, which causes any enclosing `try/finally` to execute its `finally` branch. `itertools.islice` consumes exactly `limit` items and then stops — it does not call `.close()` on the underlying generator. The generator object just sits there, suspended, holding the cursor open, until it is garbage-collected. CPython's reference-counting garbage collector will usually collect it promptly, but PyPy and other implementations may not, and even in CPython the timing is non-deterministic under load. The explicit `gen.close()` in the `finally` block guarantees the cursor is released immediately after `preview_rows` returns, regardless of runtime or error path.

---

### Issue 2: Resource leak when caller breaks or stops early

**Problem:** Any caller that does not fully consume `stream_rows` — whether via `islice`, a `break`, an exception, or any other early exit — will leave the psycopg2 cursor open. Over time the connection pool exhausts its cursor/connection limit and new requests time out waiting for a free slot.

**Fix:** The `try/finally` wrapping `gen.close()` added in `preview_rows` handles the `islice` case. For general callers, making `stream_rows` usable as a context manager (or documenting that callers must call `gen.close()`) is the broader pattern, but the immediate fix is the explicit `gen.close()` call in `preview_rows`.

**Explanation:** psycopg2 cursors hold server-side resources on the PostgreSQL connection. Leaving a cursor open does not release those resources back to the pool. Each call to `preview_rows` that did not explicitly close the generator was leaking one cursor for however long the generator object lived. Under load, many such generators could be alive simultaneously, exhausting the pool. The `finally: gen.close()` pattern is the standard way to ensure generator cleanup: it mirrors what a `with` statement does for context managers, and it is guaranteed to run even if `list(islice(...))` raises an exception.
