## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Username uniqueness check has a TOCTOU race that allows duplicate registrations under concurrency
// ------------------------------------------------------------------------
app.post("/register", express.json(), async (req, res) => {
  const { username, password } = req.body;

  const hashed = await bcrypt.hash(password, 12);

  // CHANGE 1: Removed the separate SELECT + conditional INSERT pattern entirely. Instead, rely on the database's unique constraint to atomically reject duplicates.
  // CHANGE 2: This INSERT now hits the unique index on username; the DB enforces uniqueness in a single atomic operation, closing the TOCTOU window.
  try {
    const result = await db.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
      [username, hashed]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    // CHANGE 3: Catch the unique-constraint violation (PostgreSQL error code 23505) and return 409 instead of letting the error propagate as an unhandled rejection.
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username already taken" });
    }
    // Re-throw unexpected errors so the process-level handler can log/respond.
    throw err;
  }
});

// CHANGE 2 (schema): Add a unique index so PostgreSQL enforces uniqueness atomically.
// Run this migration before deploying the updated handler:
//   CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
```

## Explanation

### Issue 1: TOCTOU race condition on username check

**Problem:** Two POST requests that arrive within milliseconds of each other both execute the `SELECT id FROM users WHERE username = $1` query before either one runs the `INSERT`. Both see zero rows, both proceed past the `if` guard, and both insert the same username — producing duplicates in the database.

**Fix:** The `SELECT … INSERT` two-step is replaced with a single `INSERT` statement wrapped in a `try/catch`. The database enforces uniqueness atomically through the unique index added in CHANGE 2, so there is no window between the check and the write.

**Explanation:** The original code performs a check-then-act pattern across two separate database round-trips. Between those round-trips the database lock is released, so any other connection can read the same state. This is the definition of a time-of-check/time-of-use race. Moving the enforcement into the database means the uniqueness check and the insert happen inside a single statement that the database serializes correctly. Even under high concurrency only one transaction can hold the relevant index lock at insertion time; the loser gets a `23505` error immediately. A related pitfall: if you add `ON CONFLICT DO NOTHING` instead of catching the error, you silently drop the registration rather than telling the client it was a duplicate — returning a `409` from the `catch` block is the correct user-facing behavior.

---

### Issue 2: No unique index on users.username

**Problem:** The table has no `UNIQUE` constraint or index on the `username` column, so PostgreSQL will happily accept any number of rows with the same username regardless of what the application tries to enforce. Even after fixing the application logic, a brief migration window, a direct DB write, or a future code regression would silently create duplicates.

**Fix:** Add `CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username)` as a schema migration. This is referenced in the CHANGE 2 comment in the solution. The index makes the database itself the authoritative enforcer of uniqueness.

**Explanation:** Application-level uniqueness checks are a secondary line of defence at best. The database is the single source of truth for all writers — application servers, migration scripts, admin tools, and future services. Without a constraint the database cannot reject bad data on its own. The unique index also provides the mechanism that makes CHANGE 1's `INSERT`-only approach work: PostgreSQL raises error code `23505` on a duplicate key, which the `catch` block translates into a `409` response. Without the index, CHANGE 1 alone would not prevent duplicates.

---

### Issue 3: Unhandled INSERT error crashes the process

**Problem:** The original code has no `try/catch` around its `INSERT`. If any database error occurs — including a unique constraint violation after the index is added — the `async` function throws, the promise rejects, and in Node.js versions before 15 the error is silently swallowed; in Node.js 15+ the process exits. Either way the client receives no response or a generic 500 at best.

**Fix:** CHANGE 3 wraps the `INSERT` in a `try/catch` that inspects `err.code`. When the code is `"23505"` (PostgreSQL's `unique_violation`), the handler returns a `409` JSON response. Any other error is re-thrown so an outer Express error handler or process-level listener can log it properly.

**Explanation:** PostgreSQL surfaces constraint violations as structured errors with a `code` field on the JavaScript error object when using the `pg` driver. Checking `err.code === "23505"` is the reliable way to distinguish a business-rule conflict (duplicate username) from an infrastructure failure (connection dropped, disk full). Re-throwing non-`23505` errors preserves normal error-handling behaviour and avoids accidentally swallowing real failures as false `409` responses. If you use a connection pool and forget to re-throw, the pool may not release the connection correctly, adding a resource-leak pitfall on top of the incorrect HTTP response.
