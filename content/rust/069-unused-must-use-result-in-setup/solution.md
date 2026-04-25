## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Must-Use Result Silently Ignored
// ------------------------------------------------------------------------

use rusqlite::{Connection, Result};

pub fn setup_tables(conn: &Connection) -> Result<()> {
    // CHANGE 1: Propagate the error with `?` so a failed execute bubbles up instead of being dropped.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        )",
        [],
    )?;

    // CHANGE 1: Same fix for the second execute — failure now stops the function and returns Err.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS events (
            id      INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            payload TEXT
        )",
        [],
    )?;

    Ok(())
}
```

## Explanation

### Issue 1: `execute` result silently discarded

**Problem:** Both `conn.execute(...)` calls return `Result<usize>`, but the return value is thrown away and the function always reaches `Ok(())`. When SQLite fails to create a table — for example because the database file is read-only or the connection is misconfigured — the error disappears. The application starts without the tables it needs, and the first `INSERT` into `events` crashes with `no such table: events`.

**Fix:** Append the `?` operator to each `conn.execute(...)` call. This is the CHANGE 1 sites in the reference solution. `?` unwraps the `Ok(usize)` on success and immediately returns the `Err` to the caller on failure, so `setup_tables` itself propagates a `rusqlite::Error` instead of hiding it.

**Explanation:** In Rust, calling a function and ignoring its `Result` is not a compile error by default — it is only a warning when the type is annotated `#[must_use]`. The workspace `allow(unused_must_use)` attribute silenced even that warning, so nothing flagged the discarded values. The `?` operator is the idiomatic fix: it both checks the result and short-circuits the function. Without it, each `execute` runs independently of whether the previous one succeeded, and the final `Ok(())` is unconditional. A related pitfall: if you have three or more DDL statements and only fix the last one, earlier failures still go unreported — every call needs `?`.

---

### Issue 2: Workspace `allow(unused_must_use)` hides the compiler signal

**Problem:** `rusqlite::Connection::execute` is annotated `#[must_use]`, so the Rust compiler would normally emit a warning like `unused return value of execute which must be used`. A workspace-level `#![allow(unused_must_use)]` suppresses that warning globally. The engineer who dropped the results got no feedback, and the bug survived code review undetected.

**Fix:** The reference solution itself does not add a new attribute, because adding `?` at the CHANGE 1 sites removes the unused-result situation entirely. The correct long-term action is to remove or narrow the `allow(unused_must_use)` in the workspace `Cargo.toml` or crate root so that future ignored `#[must_use]` values are caught again.

**Explanation:** `#[must_use]` exists precisely to prevent silent discard of values that carry error information. Suppressing `unused_must_use` at workspace scope turns off that safety net for every crate in the workspace, not just the one that needed the exemption. When `?` is applied correctly, the return value is consumed by the error-propagation machinery, so the warning would not fire even without the `allow`. The real fix is therefore two-pronged: use `?` to handle results correctly, and remove the blanket lint suppression so the compiler can catch the next occurrence elsewhere in the codebase.
