---
slug: unused-must-use-result-in-setup
track: rust
orderIndex: 69
title: Must-Use Result Silently Ignored
difficulty: easy
tags:
  - errors
  - api-misuse
  - ownership
language: rust
---

## Context

This is in `src/db/schema.rs`. The `setup_tables` function runs DDL statements against a SQLite database using the `rusqlite` crate. It's called once at application startup. The function is supposed to create tables if they don't exist; if any statement fails, the application must not proceed.

In production, the service occasionally starts successfully but then crashes on the first insert with `no such table: events`. Investigation revealed that `setup_tables` returns `Ok(())` even when the `execute` calls fail. The failure is swallowed because the `Result` returned by `execute` is never checked.

The `rusqlite::Connection::execute` method returns `Result<usize>` and is annotated `#[must_use]`. The compiler emits a warning that was suppressed by a workspace-level `allow(unused_must_use)` attribute added by a different team member to silence unrelated warnings.

## Buggy code

```rust
use rusqlite::{Connection, Result};

pub fn setup_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        )",
        [],
    );

    conn.execute(
        "CREATE TABLE IF NOT EXISTS events (
            id      INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            payload TEXT
        )",
        [],
    );

    Ok(())
}
```
