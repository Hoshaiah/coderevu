---
slug: generator-cleanup-finally-skipped
track: python
orderIndex: 17
title: Generator Finally Block Never Runs
difficulty: hard
tags:
  - resource-management
  - generators
  - correctness
language: python
---

## Context

This code is in `db/cursor_stream.py`, a generator that streams rows from a PostgreSQL query result using `psycopg2`. It's used by a reporting job that needs to process millions of rows without loading them all into memory at once. The generator wraps a database cursor and is meant to close the cursor when iteration ends.

The reporting job uses `itertools.islice` to take only the first N rows for a preview endpoint. After switching to the streaming generator, ops noticed database connections are frequently exhausted — the connection pool hits its limit and new requests time out. Cursor objects are accumulating and never being closed.

The team confirmed this does not happen when the full result set is consumed — only when iteration is cut short (e.g., the consumer breaks early or uses `islice`).

## Buggy code

```python
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
    # take only the first `limit` rows
    return list(itertools.islice(gen, limit))
```
