## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Poisoned Mutex Error Silently Swallowed
// ------------------------------------------------------------------------

use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Counter {
    inner: Arc<Mutex<u64>>,
}

impl Counter {
    pub fn new() -> Self {
        Counter {
            inner: Arc::new(Mutex::new(0)),
        }
    }

    pub fn increment(&self) {
        // CHANGE 1: recover the guard from a poisoned mutex via `into_inner()` instead of silently skipping the increment on Err.
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        *guard += 1;
    }

    pub fn get(&self) -> u64 {
        // CHANGE 2: recover from poison consistently instead of panicking with unwrap(), matching the increment behaviour.
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        *guard
    }
}
```

## Explanation

### Issue 1: Poisoned mutex lock silently skipped

**Problem:** After any worker thread panics while holding the `Mutex`, Rust marks the mutex as "poisoned". Every subsequent call to `lock()` returns `Err(PoisonError)`. The `if let Ok(mut guard)` pattern discards that `Err` silently, so `*guard += 1` never executes again. Operators see the counter freeze at the value it had when the panic occurred.

**Fix:** Replace the `if let Ok(...)` with a `match` that calls `poisoned.into_inner()` on the `Err` arm to extract the underlying `MutexGuard` from the `PoisonError`. The increment then proceeds normally on both arms.

**Explanation:** Rust's `PoisonError` wraps the original guard because the data inside the mutex is not necessarily corrupt — the thread just panicked while holding the lock. `into_inner()` gives you that guard back so you can keep working with it. Skipping the increment on every poisoned lock call is a correctness bug disguised as defensive code: the counter value is readable (it wasn't corrupted), it just stopped moving. If the poisoned state genuinely indicates bad data in your application, the right response is to propagate the error upward, not to ignore it — but for a plain `u64` counter there is nothing to be corrupt.

---

### Issue 2: `get` panics on poison while `increment` silently skips

**Problem:** `get` calls `unwrap()` on the lock result, so it panics if the mutex is poisoned. Meanwhile the old `increment` silently does nothing. The two methods have opposite, inconsistent failure modes, which makes the observable behaviour confusing and hard to reason about.

**Fix:** Replace the `unwrap()` in `get` with the same `match`/`into_inner()` pattern introduced in CHANGE 1, so both methods recover the guard from a poisoned mutex and continue normally.

**Explanation:** Consistency matters here because both methods access the same data. If `increment` survives a poisoned lock (by recovering the guard) but `get` panics, a caller that reads the counter after any thread panic will crash the handler. Using `into_inner()` in both places means the service keeps running and returning the real counter value regardless of historical panics in other threads. A related pitfall: if you later add more methods that call `lock()`, each one needs the same treatment — a shared helper or wrapper type that encapsulates the recovery logic prevents the inconsistency from creeping back in.
