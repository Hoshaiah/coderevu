## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — LRU Cache Key Includes Mutable Default
# ------------------------------------------------------------------------

import functools
import json
from typing import Any

# CHANGE 1: Accept filters as a JSON string instead of a dict so it is hashable and lru_cache can use it as a cache key.
@functools.lru_cache(maxsize=512)
def build_query(
    term: str,
    filters_json: str,
    size: int = 10,
) -> dict[str, Any]:
    # CHANGE 1: Deserialize the JSON string back into a dict inside the function body.
    filters: dict[str, Any] = json.loads(filters_json)
    query: dict[str, Any] = {
        "query": {
            "bool": {
                "must": [{"match": {"_all": term}}],
                "filter": [
                    {"term": {k: v}} for k, v in filters.items()
                ],
            }
        },
        "size": size,
    }
    return query

def search(term: str, filters: dict[str, Any]) -> dict:
    # CHANGE 1: Serialize filters to a JSON string before passing to build_query so the cache key is hashable.
    # CHANGE 2: Use sort_keys=True so that dicts with the same contents but different insertion order produce the same cache key.
    filters_json = json.dumps(filters, sort_keys=True)
    q = build_query(term, filters_json)
    return _execute(q)

def _execute(query: dict) -> dict:
    return {}
```

## Explanation

### Issue 1: `dict` argument makes `lru_cache` unhashable

**Problem:** `functools.lru_cache` builds its cache key by hashing all arguments. `dict` is not hashable in Python, so every call to `build_query(term, filters)` raises a `TypeError: unhashable type: 'dict'`. The decorator swallows the error internally and falls through to calling the real function every time, so the cache hit rate is zero and the function reconstructs the same query dict on every request.

**Fix:** The `filters` parameter is replaced with `filters_json: str`, a JSON-serialized string, in `build_query`. The `search` function converts the dict to a string with `json.dumps(filters, sort_keys=True)` before calling `build_query`. Inside `build_query`, `json.loads(filters_json)` converts it back to a dict.

**Explanation:** `lru_cache` calls `hash()` on each argument to build the internal key tuple. `dict` does not implement `__hash__`, so `hash({})` raises `TypeError`. A `str` is immutable and hashable, so it works as a cache key. Serializing to JSON is a straightforward way to produce a stable string from a dict. The returned `dict` from `build_query` is the cached object, so callers should treat it as read-only; if a caller mutates the returned dict, subsequent cache hits will return the mutated version.

---

### Issue 2: Key ordering causes spurious cache misses for equivalent dicts

**Problem:** Even after fixing the hashability issue, two callers passing `{"status": "active", "region": "us"}` and `{"region": "us", "status": "active"}` produce different JSON strings and therefore different cache keys, even though they represent the same filter and would produce the same query. This silently cuts the effective cache hit rate.

**Fix:** `json.dumps` is called with `sort_keys=True` in the `search` function so that key order in the input dict does not affect the serialized string.

**Explanation:** Python dicts preserve insertion order since 3.7, so two dicts built in different orders compare equal with `==` but serialize to different strings without `sort_keys=True`. For example, `json.dumps({"a": 1, "b": 2})` produces `'{"a": 1, "b": 2}'` and `json.dumps({"b": 2, "a": 1})` produces `'{"b": 2, "a": 1}'`. With `sort_keys=True` both produce `'{"a": 1, "b": 2}'`, guaranteeing that logically identical filter dicts map to the same cache key.
