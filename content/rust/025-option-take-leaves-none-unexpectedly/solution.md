## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Option::take Empties Field Silently
// ------------------------------------------------------------------------

pub struct Session {
    pub user_id: u64,
    token: Option<String>,
}

impl Session {
    pub fn new(user_id: u64, token: String) -> Self {
        Session {
            user_id,
            token: Some(token),
        }
    }

    // CHANGE 1: Return a reference to the inner string instead of taking ownership; use `&self` so the token stays in place for `finalize` to consume later.
    // CHANGE 2: Accept `&self` instead of `&mut self` — display is a read-only operation and should not require a mutable borrow.
    pub fn display_token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    /// Consumes the token and returns it for audit logging.
    pub fn finalize(&mut self) -> Option<String> {
        self.token.take()
    }
}
```

## Explanation

### Issue 1: `display_token` destroys token via `take`

**Problem:** When debug middleware calls `display_token` before the request handler calls `finalize`, the token is gone. `finalize` returns `None` and the audit log records a blank token even though the session authenticated successfully.

**Fix:** Replace `self.token.take()` with `self.token.as_deref()` in `display_token`. This returns `Option<&str>` — a borrowed view of the token — without moving it out of `self.token`.

**Explanation:** `Option::take` replaces the field with `None` and hands the value to the caller. Once called, the field stays `None` for the lifetime of the struct. Because `display_token` only needs to show the token, not own it, `take` is the wrong tool. `as_deref` converts `Option<String>` to `Option<&str>` by borrowing through the `Option`, leaving the original `Some(String)` intact. Any later call to `finalize` then finds the token still present and can move it out correctly. A related pitfall: if you ever need to return an owned `String` from a display method, clone instead of taking — `self.token.clone()` — so the field is not emptied.

---

### Issue 2: `display_token` takes `&mut self` unnecessarily

**Problem:** A method that only reads data but demands `&mut self` forces callers to hold a mutable borrow during the call. This blocks any other shared borrows and misleads readers into thinking the method changes state — which in the buggy version it did, destructively.

**Fix:** Change the receiver from `&mut self` to `&self` in `display_token`. The corrected return type `Option<&str>` ties the lifetime of the returned reference to `&self`, which is correct and enforced by the borrow checker.

**Explanation:** In Rust, taking `&mut self` is a contract that says "I may modify this value". A display/logging method should not hold that contract. Changing to `&self` makes the intent explicit and lets the compiler catch any future accidental mutation inside the method body. It also means callers can call `display_token` while other shared references to the session exist, which is the expected behavior for a read-only accessor. The stricter signature is also what made `take` (a mutating operation) invisible as a problem during code review — once you see `&self`, a `take` inside would not compile, surfacing the bug at compile time rather than at runtime.
