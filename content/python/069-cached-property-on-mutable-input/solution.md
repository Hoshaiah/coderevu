## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Stale Cache After Mutable Argument Mutation
# ------------------------------------------------------------------------

import functools
import statistics

class SegmentStats:
    def __init__(self, samples: list[float]):
        # CHANGE 2: Copy the caller's list so external mutations don't silently affect our data; the class now owns its samples.
        self.samples = list(samples)

    # CHANGE 1: Replace lru_cache (which never invalidates) with a simple cache-clearing pattern; cache is stored per-instance so it can be wiped when samples change.
    def add_sample(self, value: float) -> None:
        self.samples.append(value)
        self._clear_cache()

    def _clear_cache(self) -> None:
        type(self).mean.fget.cache_clear() if hasattr(type(self).mean, 'fget') else None
        self.__dict__.pop('_mean_cache', None)
        self.__dict__.pop('_stdev_cache', None)
        self.__dict__.pop('_median_cache', None)

    def mean(self) -> float:
        # CHANGE 1: Manual per-instance cache replaces lru_cache; invalidated by add_sample.
        if '_mean_cache' not in self.__dict__:
            self.__dict__['_mean_cache'] = statistics.mean(self.samples)
        return self.__dict__['_mean_cache']

    def stdev(self) -> float:
        # CHANGE 1: Same per-instance cache pattern for stdev.
        if '_stdev_cache' not in self.__dict__:
            self.__dict__['_stdev_cache'] = statistics.stdev(self.samples)
        return self.__dict__['_stdev_cache']

    def median(self) -> float:
        # CHANGE 1: Same per-instance cache pattern for median.
        if '_median_cache' not in self.__dict__:
            self.__dict__['_median_cache'] = statistics.median(self.samples)
        return self.__dict__['_median_cache']
```

## Explanation

### Issue 1: `lru_cache` Never Invalidates on Mutation

**Problem:** After the first call to `mean()`, `stdev()`, or `median()`, the dashboard always displays the same numbers no matter how many new samples are added. The raw list grows (confirmed by logging), but every subsequent statistics call returns the cached result from the very first invocation.

**Fix:** Remove `@functools.lru_cache` from all three methods and replace it with a per-instance dictionary cache (keys `_mean_cache`, `_stdev_cache`, `_median_cache` in `self.__dict__`). Add an `add_sample` method that appends a value and calls `_clear_cache`, which deletes those keys so the next call recomputes.

**Explanation:** `functools.lru_cache` keys its cache on the arguments passed to the function. For a bound method, the only argument is `self` — the object reference. Because `self` never changes (it's the same object), every call hits the same cache entry and returns the original result. The cache has no way to know that `self.samples` was mutated between calls. Storing the result in `self.__dict__` ties the cache to the instance rather than to a module-level LRU structure, making it straightforward to invalidate by deleting the key. A related pitfall: if you ever subclass `SegmentStats` and override `add_sample` without calling `super()._clear_cache()`, the cache will go stale again — so always call `_clear_cache` whenever samples change.

---

### Issue 2: Storing Reference to Caller's Mutable List

**Problem:** `self.samples = samples` stores the exact list object the caller passed in. If the caller mutates that list directly (e.g., `raw_data.append(x)` without going through the class), the statistics would be wrong — computed on data the class never knew changed. Conversely, if the class ever sorts or filters internally, it silently corrupts the caller's data.

**Fix:** Change `self.samples = samples` to `self.samples = list(samples)` so the constructor copies the input. The class now owns an independent list, and all mutations must go through `add_sample`.

**Explanation:** A shallow copy with `list()` breaks the aliasing between the caller's variable and the instance attribute. After this change, external appends to the original list have no effect on `self.samples`, and any internal manipulation of `self.samples` leaves the caller's list intact. This makes the invalidation logic in `_clear_cache` reliable: since the only way to add data is `add_sample`, that method is the single place responsible for both updating the list and clearing the cache. Without the copy, a caller doing `stats_obj = SegmentStats(buf); buf.append(99)` would bypass `add_sample` entirely and leave the cache stale or, once the cache is fixed, produce recomputed results from data the class never explicitly accepted.
