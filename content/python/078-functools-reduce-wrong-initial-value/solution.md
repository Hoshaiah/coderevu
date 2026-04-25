## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — reduce Initial Value Wrong Type
# ------------------------------------------------------------------------

from functools import reduce

def merge_counts(shards: list[dict[str, int]]) -> dict[str, int]:
    """
    Merge a list of per-shard event count dicts into one combined dict.
    """
    def _merge(a: dict[str, int], b: dict[str, int]) -> dict[str, int]:
        result = dict(a)
        for key, val in b.items():
            result[key] = result.get(key, 0) + val
        return result

    # CHANGE 1: Pass an empty dict as the explicit `initializer` argument to reduce() instead of appending a sentinel to the list. This guarantees reduce always starts from a fresh dict, so an empty `shards` list returns {} without raising TypeError, and that {} is never shared with caller code.
    # CHANGE 2: With an explicit initial value, reduce() calls _merge even for a single-element list, so the returned dict is always a new copy produced by _merge — never the original shard dict — preventing caller mutations from corrupting shard state.
    return reduce(_merge, shards, {})
```

## Explanation

### Issue 1: Empty-list sentinel is a shared mutable object

**Problem:** When `shards` is empty, `shards or [{}]` makes `reduce` operate on `[{}]`. With one element and no initial value, `reduce` returns that element directly — the exact `{}` literal that lives inside the list literal. Any caller that receives this and mutates it is mutating an object that could be reused across calls, and the behavior is surprising even if reuse doesn't happen today.

**Fix:** Replace `reduce(_merge, shards or [{}])` with `reduce(_merge, shards, {})`, passing `{}` as the third `initializer` argument to `reduce`. The `or [{}]` idiom is removed entirely.

**Explanation:** `functools.reduce(fn, iterable, initializer)` starts accumulation from `initializer` and feeds each element of `iterable` into `fn` in turn. When `iterable` is empty it simply returns `initializer`. Because `{}` is evaluated fresh at each call to `merge_counts`, the returned object is always a new dict that belongs to the caller. The old approach of injecting a sentinel into the iterable list only avoids the `TypeError`; it does not prevent `reduce` from returning the sentinel object directly when the list has exactly one element (the sentinel itself), which is a subtle difference from the single-shard case described in issue 2.

---

### Issue 2: Single-element list bypasses `_merge`, returning original shard dict

**Problem:** When `shards` has exactly one element, `reduce` with no initial value returns that element without ever calling `_merge`. The caller receives a reference to the shard's own internal dict. If the caller adds or updates keys in the result, it silently modifies the shard's data, which can corrupt caches or other references to that same dict elsewhere in the pipeline.

**Fix:** The same change as Issue 1 — adding `{}` as the `initializer` argument to `reduce` — also resolves this. With an explicit initial value, `reduce` always calls `_merge(initializer, shards[0])`, which builds and returns a brand-new `dict` via `result = dict(a)`.

**Explanation:** `reduce(fn, [x])` returns `x` unchanged because there is nothing to combine it with. `reduce(fn, [x], init)` calls `fn(init, x)` and returns the result. In `_merge`, the very first line is `result = dict(a)`, which makes a shallow copy of the accumulator. So the returned dict is always freshly allocated and independent of any input shard dict. The fix is a one-token addition that makes the single-element and multi-element paths behaviorally identical from the caller's perspective.
