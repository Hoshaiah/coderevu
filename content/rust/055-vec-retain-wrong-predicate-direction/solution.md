## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Retain Predicate Removes Wrong Elements
// ------------------------------------------------------------------------

pub struct Session {
    pub id: String,
    pub expires_at: u64,
}

pub fn prune_expired(sessions: &mut Vec<Session>, now: u64) {
    // Remove sessions that have expired
    // CHANGE 1: Flip the comparison from `< now` to `>= now` so that `retain` keeps sessions that have NOT yet expired and discards those that have.
    sessions.retain(|s| s.expires_at >= now);
}
```

## Explanation

### Issue 1: Inverted `retain` Predicate Drops Active Sessions

**Problem:** Every active session (where `expires_at >= now`) is being removed, and every expired session (where `expires_at < now`) is being kept. Users are immediately logged out after login because their valid sessions are pruned on the next cleanup pass, while stale sessions from previous runs pile up in memory.

**Fix:** Replace `s.expires_at < now` with `s.expires_at >= now` in the `retain` closure. The `retain` call now keeps sessions whose expiry time is in the present or future and discards those whose expiry time is in the past.

**Explanation:** `Vec::retain` keeps elements for which the closure returns `true` and removes elements for which it returns `false`. The original code returns `true` when `expires_at < now`, meaning "this session's deadline has already passed" — so `retain` keeps exactly the expired sessions. Flipping the operator to `>=` makes the closure return `true` only when the session deadline is still in the future (or exactly now), which is the set of sessions that should survive. A related pitfall: if the intent were to treat `expires_at == now` as already-expired, the correct operator would be `>` instead of `>=`; which boundary is inclusive should match your session-issuance logic.
