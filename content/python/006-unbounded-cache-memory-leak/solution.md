## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — In-memory request cache grows without bound and eventually OOMs the process
# ------------------------------------------------------------------------
import urllib.request
import json
import hashlib
from functools import lru_cache

# CHANGE 1: Replace the unbounded plain dict with an LRU-limited cache. functools.lru_cache on a thin helper enforces a fixed memory ceiling.
_MAX_CACHE_ENTRIES = 512

# We cache the raw JSON string (immutable) keyed by the sha256 hex digest.
# CHANGE 1: Using an explicit dict with manual LRU-style eviction via a fixed-size OrderedDict so we control the ceiling precisely.
from collections import OrderedDict

_cache: OrderedDict[str, str] = OrderedDict()  # stores raw JSON strings

def fetch_json(url: str, headers: dict[str, str] | None = None) -> dict:
    cache_key = hashlib.sha256(url.encode()).hexdigest()

    if cache_key in _cache:
        # CHANGE 1: Move accessed key to end (most-recently-used position) so the OrderedDict eviction always removes the least-recently-used.
        _cache.move_to_end(cache_key)
        # CHANGE 2: Return a fresh copy each time so callers cannot mutate the cached string; json.loads always produces a new object.
        return json.loads(_cache[cache_key])

    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")

    # CHANGE 1: Evict the least-recently-used entry when the cache is full.
    if len(_cache) >= _MAX_CACHE_ENTRIES:
        _cache.popitem(last=False)  # removes the oldest (LRU) entry

    # CHANGE 2: Store the raw JSON string, not the parsed dict, so the stored value is immutable and callers cannot corrupt it.
    _cache[cache_key] = raw
    _cache.move_to_end(cache_key)

    return json.loads(raw)
```

## Explanation

### Issue 1: Unbounded cache causes OOM

**Problem:** Every unique URL the pipeline processes adds an entry to `_cache` and that entry is never removed. After 6–8 hours the dict holds hundreds of thousands of parsed JSON dicts in memory, RSS climbs steadily, and the kernel OOM-killer terminates the process.

**Fix:** Replace the plain `dict` with a `collections.OrderedDict` named `_cache` that stores raw JSON strings. A `_MAX_CACHE_ENTRIES` constant caps the size. Before inserting a new entry, the code checks `len(_cache) >= _MAX_CACHE_ENTRIES` and calls `_cache.popitem(last=False)` to evict the oldest entry. On a cache hit, `_cache.move_to_end(cache_key)` keeps the LRU ordering accurate.

**Explanation:** The original `_cache` dict has no eviction mechanism. Each call to `fetch_json` with a new URL appends a parsed dict — which may itself contain nested lists and dicts — and nothing ever removes it. Over a long run the dict becomes effectively a memory leak. An `OrderedDict` maintains insertion/access order, which lets you implement least-recently-used eviction cheaply: move a hit to the tail with `move_to_end`, and when the dict is full, pop from the head with `popitem(last=False)`. With `_MAX_CACHE_ENTRIES = 512` the cache holds at most 512 entries at any moment, giving a predictable memory ceiling. The right value for `_MAX_CACHE_ENTRIES` depends on average response size and available RAM — tune it accordingly, but any finite limit stops the OOM.

---

### Issue 2: Mutable cached objects are shared across callers

**Problem:** The original code stores the parsed `dict` object in `_cache` and returns the same object reference to every caller. If any caller does something like `result["items"].clear()` or `result["count"] = 0`, it silently modifies the object that every future caller will receive from the cache, producing subtly wrong data with no error.

**Fix:** The cache now stores the raw JSON `str` (assigned to `raw`) instead of the parsed dict. Every return path — both the cache-hit path and the fresh-fetch path — calls `json.loads` on that string, which always produces a brand-new `dict` object the caller owns exclusively.

**Explanation:** Python dicts are mutable and passed by reference. Storing and returning the same dict object means the cache and the caller share memory. A caller that treats the return value as theirs to modify — a reasonable assumption — will corrupt the cached data. Storing the raw JSON string sidesteps this entirely because strings are immutable in Python; no caller can alter `raw`. Deserializing with `json.loads` on every return is a small CPU cost (a single JSON parse) that is acceptable given the alternative is a correctness bug. A lighter alternative would be `copy.deepcopy`, but that has similar cost and is more error-prone for nested structures containing non-standard types.
