---
slug: result-map-err-type-erased
track: rust
orderIndex: 79
title: Error Source Erased by map_err
difficulty: medium
tags:
  - errors
  - error-handling
  - api-misuse
language: rust
---

## Context

This file, `src/db/loader.rs`, loads user records from a SQLite database using the `rusqlite` crate. The public function returns a `Result<User, String>` to keep the API simple for callers. A middleware layer logs the returned error string when the function fails.

Operators have noticed that when database errors occur, the log line always reads `"database error"` with no further detail — the actual SQLite error code, message, or failing query is completely absent. Debugging failed loads requires attaching a debugger or adding temporary `eprintln!` calls inside the function.

The team already ruled out log-level filtering as the cause. The error string really does contain only `"database error"` — the underlying error information is thrown away before the function even returns.

## Buggy code

```rust
// Requires: rusqlite = "0.31"
use rusqlite::{Connection, Error as SqlError};

pub struct User {
    pub id: i64,
    pub name: String,
}

pub fn load_user(conn: &Connection, id: i64) -> Result<User, String> {
    let user = conn
        .query_row(
            "SELECT id, name FROM users WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            },
        )
        // Bug: map_err discards the actual SqlError and replaces it
        // with a static string, losing all diagnostic information.
        .map_err(|_| "database error".to_string())?;

    Ok(user)
}
```
