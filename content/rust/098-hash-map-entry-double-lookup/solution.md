## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Cache implementation does redundant map lookups by not using the Entry API
// ------------------------------------------------------------------------
use std::collections::HashMap;
use std::collections::hash_map::Entry;

pub struct MemoCache {
    store: HashMap<u64, Vec<u64>>,
}

impl MemoCache {
    pub fn new() -> Self {
        MemoCache {
            store: HashMap::new(),
        }
    }

    pub fn get_or_compute<F>(&mut self, key: u64, compute: F) -> &Vec<u64>
    where
        F: FnOnce() -> Vec<u64>,
    {
        // CHANGE 1 & 2: Use the Entry API so the map is hashed exactly once
        // regardless of whether the key is present. `or_insert_with` inserts
        // only when the entry is vacant and returns a &mut reference to the
        // value in either case, eliminating the redundant `contains_key` probe
        // and the redundant trailing `get` probe.
        self.store.entry(key).or_insert_with(compute)
    }
}
```

## Explanation

### Issue 1: Double probe on every cache hit

**Problem:** Every time a key is already in the cache, the code calls `contains_key(&key)` and then `get(&key)`. Both operations hash `key` and walk the same bucket. On a graph with millions of nodes, a profiler will show the HashMap being probed twice for each of those hits — effectively doubling the hashing work for the common case.

**Fix:** Replace the `contains_key` / `get` pair with a single call to `self.store.entry(key).or_insert_with(compute)`. The `entry` call performs one hash and one probe; the returned `Entry` carries a reference to the found (or newly created) slot.

**Explanation:** `HashMap::contains_key` must locate the bucket to answer its boolean question, then discard that location. The subsequent `get` re-hashes the key and re-locates the same bucket from scratch. The Entry API avoids this by keeping an internal reference to the bucket after the first probe. If the entry is `Occupied`, `or_insert_with` returns the existing value without touching the bucket again. If it is `Vacant`, `or_insert_with` calls the closure, writes the value into the slot it already has a pointer to, and returns a reference — again without a second probe. The total probe count drops from two (hit) or three (miss) to exactly one in all cases.

---

### Issue 2: Third HashMap probe on cache miss

**Problem:** When the key is absent, the code computes the value, calls `self.store.insert(key, value)`, and then calls `self.store.get(&key).unwrap()` to get a reference back. That final `get` is a full third probe of the map on the miss path, even though `insert` already located and filled the slot.

**Fix:** The `or_insert_with(compute)` call in the Entry-based solution returns `&mut Vec<u64>` pointing directly to the newly inserted slot, so no separate `get` is needed. The trailing `self.store.get(&key).unwrap()` line is removed entirely.

**Explanation:** `HashMap::insert` returns `Option<V>` (the old value), not a reference to the newly stored value, so the original author was forced to call `get` to get a borrowable reference back. The Entry API sidesteps this entirely: `or_insert_with` returns `&mut V` pointing into the map's storage, which Rust's lifetime rules allow you to return (coerced to `&V`) as long as the borrow of `self.store` lives long enough. A related pitfall: `unwrap()` on the `get` result could theoretically panic if some other concurrent writer removed the key between `insert` and `get`, though that cannot happen in safe single-threaded Rust — but the Entry API removes the conceptual possibility along with the extra probe.
