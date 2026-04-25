## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Linear Scan on Blocklist Lookup
# ------------------------------------------------------------------------

import redis

# CHANGE 1: Use set instead of list so membership tests are O(1) hash lookups rather than O(n) linear scans.
_blocklist: set[str] = set()

def load_blocklist(redis_url: str) -> None:
    global _blocklist
    client = redis.from_url(redis_url)
    members = client.smembers("ip_blocklist")
    # CHANGE 1: Wrap decoded IPs in set() so `ip in _blocklist` is O(1) instead of scanning every element.
    # CHANGE 2: Decode bytes to str before storing, and store in a set to preserve O(1) lookup semantics.
    _blocklist = {ip.decode() for ip in members}

def is_blocked(ip: str) -> bool:
    return ip in _blocklist
```

## Explanation

### Issue 1: List Used for O(n) Membership Test

**Problem:** Every incoming request calls `ip in _blocklist` where `_blocklist` is a Python `list`. Python must walk every element in the list until it finds a match or exhausts the list. With 85,000 entries, each request performs up to 85,000 string comparisons. At 5,000 requests per second across 30 workers, this dominates CPU and drives p99 latency from ~4 ms to ~80 ms — a symptom that scales linearly with blocklist size.

**Fix:** The type annotation and initialization of `_blocklist` changes from `list[str]` to `set[str]`, and the comprehension in `load_blocklist` changes from a list comprehension `[...]` to a set comprehension `{...}`. The `is_blocked` function body is unchanged; `in` on a `set` is O(1).

**Explanation:** Python's `list.__contains__` iterates elements one by one — there is no index or hash to jump to. A `set` stores elements in a hash table, so `ip in _blocklist` computes `hash(ip)`, goes to the correct bucket, and does at most a handful of equality checks regardless of set size. Switching the container is the minimal change: the `in` operator syntax is identical for both types, so `is_blocked` needs no edits. One related pitfall: if the blocklist were stored as a `frozenset`, it would carry the same O(1) benefit and also be immutable, which is safer for a module-level variable read by many concurrent workers.

---

### Issue 2: Bytes Decoded into Wrong Container Type

**Problem:** `client.smembers` returns a Python `set` of `bytes` objects (e.g. `{b'1.2.3.4', ...}`). The original code decodes them correctly but stores them in a `list`. This is a secondary issue: even if Issue 1 were fixed by changing the type annotation, the list comprehension `[ip.decode() for ip in _blocklist]` would still produce a `list`, silently defeating the O(1) intent.

**Fix:** The list comprehension `[ip.decode() for ip in _blocklist]` is replaced with a set comprehension `{ip.decode() for ip in members}`. Both decode bytes to `str`; the set comprehension also produces a `set`, which is what `_blocklist` now expects.

**Explanation:** `redis-py` returns `smembers` results as a Python `set` of `bytes`, not strings, because Redis is byte-oriented. The decode step is necessary for string comparison with the incoming IP. The bug was that the result of the comprehension was placed in `[...]` (list) rather than `{...}` (set). Because the two assignment lines were separate (`_blocklist = client.smembers(...)` then `_blocklist = [ip.decode() ...]`), the final value of `_blocklist` was always a `list`. Combining decoding and set construction into a single set comprehension eliminates the intermediate value and ensures the stored type matches the declared type.
