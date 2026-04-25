## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — RwLock Write Guard Held Too Long
// ------------------------------------------------------------------------

use std::collections::HashMap;
use std::sync::RwLock;

pub struct ServiceRegistry {
    map: RwLock<HashMap<String, String>>,
}

impl ServiceRegistry {
    pub fn new() -> Self {
        ServiceRegistry { map: RwLock::new(HashMap::new()) }
    }

    /// Insert or update `key` and return a snapshot of the entire registry.
    pub fn update_and_snapshot(
        &self,
        key: String,
        value: String,
    ) -> HashMap<String, String> {
        // CHANGE 1: Drop the write guard explicitly before cloning so readers are only blocked during the insert, not the clone.
        {
            let mut guard = self.map.write().unwrap();
            guard.insert(key, value);
        } // write guard is released here

        // CHANGE 2: Take a read lock for the snapshot now that the write guard is gone, and return directly without an intermediate binding.
        self.map.read().unwrap().clone()
    }
}
```

## Explanation

### Issue 1: Write guard held during map clone

**Problem:** Every call to `update_and_snapshot` holds the write lock for the entire duration of `guard.clone()`. Because `RwLock` excludes all readers while a writer holds the lock, every concurrent reader thread blocks until the clone finishes. Under moderate load, with many readers and a large map, this produces the observed hundreds-of-milliseconds stalls.

**Fix:** Wrap the `write().unwrap()` + `insert` in an inner block (`{ ... }`), letting the write guard drop at the closing brace before the clone starts. The snapshot is then taken under a `read` lock via `self.map.read().unwrap().clone()`.

**Explanation:** In Rust, a value is dropped at the end of its enclosing scope. In the buggy code `guard` lives until the end of `update_and_snapshot`, so the write lock is held across `guard.clone()`. By placing the write guard inside a shorter inner block, the lock is released as soon as the insert completes. The subsequent clone runs under a read lock, which allows other readers to proceed concurrently. A related pitfall: if you call `drop(guard)` before the clone but still reference `guard` afterward, the compiler will reject it — the inner-block pattern is cleaner and statically enforced.

---

### Issue 2: Redundant intermediate snapshot variable

**Problem:** The original code assigns the clone to `snapshot` and then immediately returns `snapshot`. This is minor noise — it does not affect correctness — but it obscures intent and adds an unnecessary move.

**Fix:** Remove the `let snapshot = ...` binding and return `self.map.read().unwrap().clone()` directly as the tail expression of the function.

**Explanation:** Rust tail expressions (expressions without a semicolon at the end of a block) are idiomatic for returning values. Introducing `snapshot` just to return it on the next line forces a reader to mentally track whether the variable is modified between assignment and return. Returning the expression directly makes the data flow obvious and eliminates the intermediate binding. This change is purely cosmetic in terms of performance since the compiler would optimize the move away, but it signals clearly that no transformation happens between the clone and the return.
