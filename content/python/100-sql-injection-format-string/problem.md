---
slug: sql-injection-format-string
track: python
orderIndex: 100
title: User-supplied search term is interpolated directly into a SQL query
difficulty: easy
tags:
  - security
  - sql-injection
  - database
language: python
---

## Context

This function lives in the data-access layer of an internal HR portal. It lets managers search for employees by name. The application uses `sqlite3` from the standard library.

A security audit flagged that the search endpoint accepts arbitrary input and that the underlying query construction looks suspicious.

## Buggy code

```python
import sqlite3

def search_employees(db_path: str, name_query: str) -> list[dict]:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    sql = f"SELECT id, name, department, salary FROM employees WHERE name LIKE '%{name_query}%'"
    cursor.execute(sql)
    columns = [desc[0] for desc in cursor.description]
    results = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return results
```
