## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Cache Returns Mutable Reference Directly
# ------------------------------------------------------------------------

import copy
import threading
import time
from typing import Any

_cache: dict[str, Any] = {}
_lock = threading.Lock()
_TTL = 60  # seconds

def _fetch_from_server(name: str) -> Any:
    """Simulate remote config fetch; returns a fresh dict."""
    # In production this calls an HTTP endpoint
    return {"feature_flags": {"new_ui": True}, "allowed_ips": ["10.0.0.1"]}

def get_config(name: str) -> Any:
    with _lock:
        if name not in _cache:
            _cache[name] = _fetch_from_server(name)
        # CHANGE 1: return a deep copy so callers cannot mutate the shared cached object; any change a caller makes stays in their own copy and never corrupts the cache or other callers' views.
        return copy.deepcopy(_cache[name])

def refresh_loop() -> None:
    while True:
        time.sleep(_TTL)
        with _lock:
            for name in list(_cache):
                # CHANGE 2: store a deep copy of the freshly fetched config so the canonical cache entry is never the same object as what was returned to any caller, preventing aliasing between the cache and any previously returned reference.
                _cache[name] = copy.deepcopy(_fetch_from_server(name))

def start_refresh_thread() -> None:
    t = threading.Thread(target=refresh_loop, daemon=True)
    t.start()
```

## Explanation

### Issue 1: Mutable Cache Reference Returned to Callers

**Problem:** Every call to `get_config` hands the caller the exact same `dict` object that lives inside `_cache`. If any caller does something like `cfg = get_config("app"); cfg["allowed_ips"].append("evil")`, that mutation writes directly into the shared cache. The next caller gets the already-mutated object. Engineers see config values changing with no explicit write to the cache.

**Fix:** Replace `return _cache[name]` with `return copy.deepcopy(_cache[name])` so each caller receives an independent copy of the config data.

**Explanation:** Python dicts (and the nested lists/dicts inside them) are reference types. Assigning or returning one does not copy it — it just creates another name pointing to the same memory. Because `_lock` is released immediately after `return`, any code running after `get_config` returns can freely mutate the object without holding the lock, and those mutations are visible to all future callers since they all share the same underlying object. `copy.deepcopy` recursively copies every nested container, so the caller's copy and the cached copy are completely independent. One pitfall: `copy.copy` (shallow) is not enough here because nested structures like the `allowed_ips` list would still be shared.

---

### Issue 2: Refresh Stores Direct Fetch Result, Aliasing Cache Entry

**Problem:** When `refresh_loop` calls `_cache[name] = _fetch_from_server(name)`, it stores whatever object `_fetch_from_server` returns directly into the cache. If `_fetch_from_server` ever returns an object that is reused across calls (e.g., a module-level default, a cached HTTP response object, or a mock in tests), multiple cache entries or the cache and an external object end up sharing memory, and a mutation to one affects all.

**Fix:** Wrap the assignment in `refresh_loop` as `_cache[name] = copy.deepcopy(_fetch_from_server(name))` so the cache always owns a private, isolated copy of the fetched data.

**Explanation:** Even though the simulated `_fetch_from_server` in this file returns a new literal dict each call, in production it would call an HTTP client library that may return pooled or cached response objects. Storing the raw return value means the cache and the HTTP layer could share the same object. With the deep copy at the storage site (CHANGE 2) combined with the deep copy at the read site (CHANGE 1), the data flow is: fetch → deep copy into cache → deep copy out to caller. Each stage has its own isolated copy, so no mutation anywhere leaks across boundaries. The cost is extra allocation, which is acceptable for a config object fetched at most once per 60 seconds.
