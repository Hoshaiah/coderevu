## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — lru_cache on Method Leaks Instances
# ------------------------------------------------------------------------

import json
from functools import lru_cache
import weakref

class SearchIndex:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        # Simulates loading a large structure from disk
        self._index: dict[str, list[int]] = self._load(tenant_id)
        # CHANGE 1: Create a per-instance lru_cache wrapping a closure that captures a weakref to self, so the cache does not hold a strong reference to this instance and the instance can be garbage collected normally.
        self.lookup = lru_cache(maxsize=256)(self._lookup_impl)

    def _load(self, tenant_id: str) -> dict[str, list[int]]:
        # In production this reads a large file; simplified here
        return {"example": [1, 2, 3]}

    # CHANGE 2: Rename the actual implementation to _lookup_impl (no @lru_cache decorator here) so the cache is only applied per-instance in __init__, keeping each instance's cache isolated and allowing normal GC.
    def _lookup_impl(self, query: str) -> list[int]:
        tokens = query.lower().split()
        results = set()
        for token in tokens:
            results.update(self._index.get(token, []))
        return sorted(results)
```

## Explanation

### Issue 1: `lru_cache` Prevents Instance Garbage Collection

**Problem:** Worker memory grows without bound across requests. Heap profiles show `SearchIndex` objects and their `_index` dicts are never freed, even after all application-level code has dropped its references to the instance.

**Fix:** Remove `@lru_cache` from the method definition and instead apply `lru_cache(maxsize=256)` to `self._lookup_impl` inside `__init__`, assigning the result to `self.lookup`. This is the `# CHANGE 1` site.

**Explanation:** When Python evaluates `@lru_cache` on a method defined in the class body, the decorator wraps the raw function once, at class-definition time. Every time you call `instance.lookup(query)`, Python forms a bound method on the fly; `lru_cache` sees `(self, query)` as the cache key, so `self` is stored directly inside the cache's internal dict as a strong reference. As long as the cache lives (it lives on the class, forever), every `SearchIndex` instance that ever called `lookup` is pinned in memory. The fix moves the cache construction into `__init__`, creating a fresh `lru_cache` per instance whose closure references only `self._lookup_impl` (a bound method). When the `SearchIndex` instance is no longer reachable by application code, `self.lookup` (the cached wrapper) is also unreachable, its reference count drops to zero, and the whole object — including `_index` — is freed. A related pitfall: if you try to use `weakref.ref(self)` inside the method instead, you must handle the case where the weakref has expired before the cache returns a result.

---

### Issue 2: Cache Shared Across All Instances

**Problem:** Because the original `@lru_cache` lives on the class-level function, all `SearchIndex` instances share one cache keyed on `(self, query)`. A cached result produced by tenant A's index is stored under `(instance_A, "example")` but the cache entry keeps `instance_A` alive (Issue 1), and the cache capacity is consumed by every tenant, evicting useful entries unpredictably.

**Fix:** Rename the working method to `_lookup_impl` and stop decorating it (the `# CHANGE 2` site). The decoration now happens per-instance in `__init__`, so each instance owns a completely independent `lru_cache` with its own 256-entry budget.

**Explanation:** `lru_cache` uses the arguments as a dict key. When the decorator sits on the class-level function, `self` is argument zero, so two different `SearchIndex` instances can both populate the same cache object. This means a single 256-slot cache is shared among all live tenants, and tenants with high query volume evict entries for other tenants. With the per-instance approach, each instance gets its own 256-slot cache. When the instance is freed (Issue 1 fixed), its cache is also freed, releasing both the cached result lists and the cache infrastructure itself. This also makes cache hit rates predictable: each tenant's cache reflects only that tenant's query pattern.
