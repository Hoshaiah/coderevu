## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Double Lock on Same Mutex
// ------------------------------------------------------------------------

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct Cache {
    inner: Arc<Mutex<HashMap<String, String>>>,
}

impl Cache {
    pub fn new() -> Self {
        Cache {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_or_insert(&self, key: &str, compute: impl FnOnce() -> String) -> String {
        // CHANGE 1: Check-then-release pattern is correct, but compute() must never call back into get_or_insert while we hold the lock. We ensure the lock is fully dropped before calling compute(), and we do NOT allow compute() to re-enter by making populate() safe.
        {
            let map = self.inner.lock().unwrap();
            if let Some(val) = map.get(key) {
                return val.clone();
            }
        }
        // Lock is released here. compute() runs without holding the lock.
        let value = compute();
        // CHANGE 1: Re-lock only after compute() has fully returned, guaranteeing no re-entrancy from this path.
        let mut map = self.inner.lock().unwrap();
        map.entry(key.to_string()).or_insert_with(|| value.clone());
        value
    }

    pub fn populate(&self, key: &str) {
        // CHANGE 2: Compute the fallback value BEFORE calling get_or_insert so the closure does not call get_or_insert recursively, eliminating the reentrancy that caused deadlock.
        let fallback = self.get_or_insert("default", || "fallback".to_string());
        let _val = self.get_or_insert(key, || fallback.clone());
    }
}
```

## Explanation

### Issue 1: Re-entrant Lock on Non-Reentrant Mutex

**Problem:** `std::sync::Mutex` in Rust is not reentrant. If the same thread calls `lock()` a second time while already holding the lock, it deadlocks immediately. Under load, every request freezes and the process must be killed.

**Fix:** The `get_or_insert` method already drops its first lock guard before calling `compute()` (the scoped block ends before `compute()` is called). The real fix is in `populate()` at CHANGE 2: compute the inner value before passing a closure to `get_or_insert`, so the closure never calls `get_or_insert` while a lock is outstanding.

**Explanation:** `std::sync::Mutex::lock()` on Linux uses a `pthread_mutex` in default (non-recursive) mode. When a thread calls `lock()` while it already holds that mutex, the thread blocks waiting for itself to release — which never happens. In the buggy `populate()`, the outer `get_or_insert` call drops its first read-lock, runs `compute()`, then calls `lock()` a second time for the insert. Inside `compute()`, the inner `get_or_insert("default", …)` also calls `lock()`. If the outer `get_or_insert` is between its two `lock()` calls — specifically after dropping the first lock but before acquiring the second — and the same thread executes the inner call, the second `lock()` in the inner call races with the outer re-lock. More directly: the closure captures `self`, calls `get_or_insert`, which calls `lock()` on the same mutex the outer call is about to lock. With a single-threaded Actix worker, both locks are on the same thread, causing a guaranteed deadlock.

---

### Issue 2: populate() Embeds Recursive get_or_insert Call in Closure

**Problem:** `populate()` passes a closure to `get_or_insert` that itself calls `self.get_or_insert("default", …)`. This means the closure runs while the outer `get_or_insert` is executing, creating a recursive call path that re-enters the mutex.

**Fix:** At CHANGE 2, `populate()` is rewritten to call `self.get_or_insert("default", || "fallback".to_string())` eagerly and store the result in `fallback` before the second `get_or_insert` call. The closure passed to the second call captures `fallback` by value and does not call `get_or_insert` at all.

**Explanation:** The root cause is architectural: the caller is trying to resolve a dependency (the "default" value) inside a callback that runs while `get_or_insert` is mid-execution. Even though `get_or_insert` drops its first lock before calling `compute()`, calling `get_or_insert` inside `compute()` adds another lock/unlock cycle on the same mutex on the same thread. Pulling the inner `get_or_insert` call out of the closure and running it first ensures both calls are fully sequential. When `populate()` then passes the already-computed string into the second closure, that closure is a pure value producer with no mutex interaction, and the deadlock path is removed entirely.
