## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — zip() Silently Truncates Mismatched Lists
# ------------------------------------------------------------------------

def build_score_report(user_ids: list[int], scores: list[float]) -> list[dict]:
    """
    Pair each user ID with its score and return a list of record dicts.
    Both lists must be the same length.
    """
    # CHANGE 2: Validate lengths up front so a mismatch raises immediately instead of silently producing a short result.
    if len(user_ids) != len(scores):
        raise ValueError(
            f"user_ids and scores must be the same length "
            f"(got {len(user_ids)} user_ids and {len(scores)} scores)"
        )
    records = []
    # CHANGE 1: Replace zip() with zip(strict=True) so any length mismatch raises RuntimeError rather than truncating silently.
    for uid, score in zip(user_ids, scores, strict=True):
        records.append({"user_id": uid, "score": round(score, 2)})
    return records
```

## Explanation

### Issue 1: `zip()` Truncates Without Warning

**Problem:** When `user_ids` and `scores` have different lengths, `zip()` stops as soon as the shorter iterable is exhausted. The extra elements in the longer list are silently discarded. The function returns fewer records than expected, and no exception or log message indicates that anything went wrong — which is exactly the symptom product is seeing.

**Fix:** Pass `strict=True` to `zip()`, changing `zip(user_ids, scores)` to `zip(user_ids, scores, strict=True)`. With `strict=True`, Python raises a `RuntimeError` the moment one iterable runs out before the other.

**Explanation:** `zip()` is designed for the case where you intentionally want to pair up the first N items from multiple iterables, so truncation is its documented default behaviour. When both lists are supposed to be the same length, that default hides bugs instead of surfacing them. `strict=True` (added in Python 3.10) changes the contract: if the iterables finish at different times, it raises `RuntimeError: zip() has arguments with different lengths`. That turns a silent data-loss bug into a loud, traceable failure. A related pitfall: if you ever switch to a generator instead of a list, you won't be able to check `.len()` beforehand, so `strict=True` is the only reliable guard in that case too.

---

### Issue 2: No Up-Front Length Validation

**Problem:** Even with `strict=True` on `zip()`, the error only surfaces mid-loop. If the code is later refactored and `zip()` is replaced with something else, the guard disappears entirely. There is also no clear, human-readable error message that tells the caller which lengths were received.

**Fix:** Add an explicit `if len(user_ids) != len(scores): raise ValueError(...)` check at the top of the function, before the loop, with a message that includes the actual lengths of both lists.

**Explanation:** Failing fast at the function boundary makes debugging straightforward: the stack trace points directly to the entry of `build_score_report`, and the error message tells you exactly what the two lengths were, so you can correlate them with your query results immediately. Checking lengths explicitly also makes the contract of the function visible to anyone reading the code, rather than relying on a `zip()` keyword argument they might not notice. The two guards (`len` check and `strict=True`) are complementary: the `len` check gives a clear `ValueError` with a useful message, while `strict=True` acts as a second line of defence in case the length check is ever accidentally removed.
