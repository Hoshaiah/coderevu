## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Error Source Erased by map_err
// ------------------------------------------------------------------------

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
        // CHANGE 1: bind the error to `e` instead of `_` so the SqlError value is captured, then format it into the returned String so callers and logs receive the full SQLite error message and code.
        // CHANGE 2: use `e.to_string()` (via the Display impl on SqlError) to embed the actual error detail rather than a static literal.
        .map_err(|e| format!("database error: {}", e))?;

    Ok(user)
}
```

## Explanation

### Issue 1: Error value discarded by wildcard pattern

**Problem:** The closure passed to `map_err` binds the incoming `SqlError` to `_`, which tells Rust to drop the value immediately without reading it. Every database failure — wrong SQL, missing row, connection drop, type mismatch — produces the identical log line `"database error"`, giving operators no way to distinguish or diagnose failures.

**Fix:** Replace `|_|` with `|e|` so the `SqlError` is bound to a named variable that the closure body can use. This is the CHANGE 1 site on the `.map_err` line.

**Explanation:** In Rust, `_` in a pattern means "match but do not bind"; the matched value is dropped at that point. Because `SqlError` is not `Copy`, binding it to `_` destroys it before the closure body runs. There is then no way to recover the error code, the failing SQL text, or anything else `rusqlite` attached to the error. Naming the binding `e` keeps the value alive inside the closure so it can be inspected or formatted. A related pitfall: even if you write `|_e|` (underscore prefix), Rust does bind the value, so that form would also work — but the bare `_` does not.

---

### Issue 2: Static string literal replaces dynamic error detail

**Problem:** Even if the error were bound, the original code returns the string `"database error"` unconditionally. The actual SQLite error — for example `"Query returned no rows"` or `"no such table: users"` — is never included in the returned `String`, so the middleware log line is always identical regardless of what went wrong.

**Fix:** Replace `"database error".to_string()` with `format!("database error: {}", e)`, which calls the `Display` implementation on `SqlError` to embed the full error description. This is the CHANGE 2 site on the same `.map_err` line.

**Explanation:** `rusqlite::Error` implements `std::fmt::Display`, which renders a human-readable description including the SQLite result code and any associated message. `format!` drives that `Display` impl and produces a heap-allocated `String` containing the detail. Without `format!`, the closure returns a constant string regardless of which error variant was encountered. A related pitfall: using `{:?}` (the `Debug` format) instead of `{}` also works and gives even more internal detail, but `{}` is enough for log readability and keeps the output shorter.
