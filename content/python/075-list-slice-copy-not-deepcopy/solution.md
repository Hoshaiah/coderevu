## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Shallow Slice Shares Nested Objects
# ------------------------------------------------------------------------

import copy


def split_into_batches(jobs: list[dict], batch_size: int) -> list[list[dict]]:
    batches = []
    for i in range(0, len(jobs), batch_size):
        # CHANGE 1: deep-copy each batch so worker mutations don't bleed back into the original `jobs` list
        batch = [copy.copy(record) for record in jobs[i : i + batch_size]]
        batches.append(batch)
    return batches


def process_batch(batch: list[dict]) -> list[dict]:
    for record in batch:
        # Annotate records in-place with processing metadata
        record["_processed"] = True
        record["_worker_id"] = id(batch)
    return batch


def run_pipeline(jobs: list[dict]) -> list[dict]:
    # CHANGE 2: `split_into_batches` now returns copies, so `jobs` stays clean and downstream schema validation sees no extra keys
    batches = split_into_batches(jobs, batch_size=10)
    results = []
    for batch in batches:
        results.extend(process_batch(batch))
    return results
```

## Explanation

### Issue 1: Shallow Slice Shares Dict References

**Problem:** After `run_pipeline` runs, the original `jobs` list contains dicts that now have `_processed` and `_worker_id` keys. This breaks the downstream schema validation step, which rejects unknown keys. The caller never asked for those keys; they appear as a surprise side-effect.

**Fix:** In `split_into_batches`, replace `jobs[i : i + batch_size]` with a list comprehension that calls `copy.copy(record)` on each element: `[copy.copy(record) for record in jobs[i : i + batch_size]]`. This makes each batch hold its own shallow copies of the dicts rather than references to the originals.

**Explanation:** A list slice like `jobs[0:10]` creates a new list object, but every element of that new list is still the exact same dict object that lives in `jobs`. When `process_batch` does `record["_processed"] = True`, it writes into that shared dict, so the change is visible through both the batch list and the original `jobs` list. `copy.copy` on a dict produces a new dict with the same key-value pairs, breaking the shared reference. Because the record dicts themselves only contain flat values (strings, numbers) in the typical case, a shallow copy of each dict is sufficient; if records contained nested mutable objects you would need `copy.deepcopy` instead.

---

### Issue 2: Mutated Objects Propagate to Caller via Shared Identity

**Problem:** Even if a caller inspects `jobs` only after `run_pipeline` returns, they see the extra keys, because `run_pipeline` never promised it would work on copies. The bug is invisible when `batch_size >= len(jobs)` because a single-batch run still mutates every record, but the effect is consistently wrong in all cases — the symptom just happens to be noticed when multiple batches are compared.

**Fix:** The comment at the `run_pipeline` call site (CHANGE 2) documents that `split_into_batches` now owns the copy responsibility, so `run_pipeline` itself requires no logic change — it relies on the guarantee established by CHANGE 1.

**Explanation:** The root contract issue is that `run_pipeline` looks like a read-then-return function but silently writes back into its input. Once CHANGE 1 ensures every batch element is a fresh dict, `process_batch` can mutate freely without touching `jobs`. The `results` list returned by `run_pipeline` then contains the annotated copies, while `jobs` stays in its original state. A related pitfall: if you later add nested dicts inside job records (e.g., `record["meta"] = {}`), `copy.copy` will still share that nested dict, and you would need `copy.deepcopy` to get full isolation.
