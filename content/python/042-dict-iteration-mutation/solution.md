## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Dict Modified During Iteration
# ------------------------------------------------------------------------

import time

def evict_expired(cache: dict) -> int:
    """
    Remove all expired entries from the cache dict in-place.
    Returns the number of entries removed.
    """
    removed = 0
    now = time.time()
    # CHANGE 1: Materialize the keys to check into a list before the loop so that deleting from `cache` inside the loop does not mutate the dict while iterating over it.
    for key, (_, expiry) in list(cache.items()):
        if expiry < now:
            del cache[key]
            removed += 1
    return removed
```

## Explanation

### Issue 1: Dict Mutated During Active Iteration

**Problem:** Every time an expired entry is found, `del cache[key]` removes it from the dict while the `for` loop is still iterating over `cache.items()`. Python's dict iterator detects the size change and raises `RuntimeError: dictionary changed size during iteration`. The worker crashes immediately on the first cache sweep that finds at least one expired entry.

**Fix:** Wrap `cache.items()` in `list(...)` at the loop header (`list(cache.items())`). This materializes a snapshot of all key-value pairs into a plain list before the loop starts, so subsequent `del cache[key]` calls modify the dict without touching the iterator.

**Explanation:** CPython's dict iterator holds a reference to the dict's internal version counter. Each structural change (insert or delete) increments that counter. At the top of every iteration step the iterator checks whether the counter matches what it recorded when iteration began; if not, it raises `RuntimeError`. Wrapping `cache.items()` in `list()` copies the current key-value pairs into a separate list object. The `for` loop then iterates over that list, which is never modified, so the version check never fires. The only cost is O(n) memory for the snapshot, which is acceptable for a periodic background sweep. A related pitfall: iterating over `cache.keys()` or `cache.values()` directly has the same problem — any of the three view objects will raise if the underlying dict changes size.

---
