## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Pool starmap Result Order Lost
# ------------------------------------------------------------------------

from multiprocessing import Pool
from typing import Callable

def transform_worker(args):
    record_id, payload, transform_fn = args
    result = transform_fn(payload)
    return record_id, result

def parallel_transform(
    records: list[tuple[int, bytes]],
    transform_fn: Callable,
    n_workers: int = 4,
) -> list[tuple[int, bytes]]:
    args = [(rid, payload, transform_fn) for rid, payload in records]
    with Pool(processes=n_workers) as pool:
        # CHANGE 1: replaced imap_unordered with starmap so results are returned in the same order as the input list, preserving record_id/payload correspondence
        results = list(pool.starmap(transform_worker, [(a,) for a in args]))
    return results

def write_results(db_conn, results: list[tuple[int, bytes]]):
    for i, (record_id, transformed) in enumerate(results):
        db_conn.execute(
            "UPDATE records SET payload = ? WHERE id = ?",
            # CHANGE 2: replaced results[i][0] with record_id so the UPDATE uses the ID carried in the result tuple, not the loop index
            (transformed, record_id),
        )
```

## Explanation

### Issue 1: imap_unordered Discards Result Order

**Problem:** `pool.imap_unordered` yields each result as soon as the worker finishes, with no guarantee about order. Under real CPU load, faster workers finish earlier and their results land at earlier positions in the list regardless of which record they processed. Because the code later relies on position to correlate a result with its record, roughly 1–2% of rows (those whose workers finished out of order) end up with the wrong payload written to the database.

**Fix:** Replace `pool.imap_unordered` with `pool.starmap` at the CHANGE 1 site. `starmap` blocks until all workers finish and reassembles results in the same order as the input argument list, so `results[i]` always corresponds to `args[i]`.

**Explanation:** `imap_unordered` is documented to return results "in arbitrary order" as tasks complete. With 4 workers and thousands of records, tasks that finish milliseconds apart swap positions silently — there is no error, just wrong ordering. The bug is invisible in small unit tests because with a handful of records and similar payload sizes all workers tend to finish in submission order. `pool.starmap` (or `pool.map`) collects results into an internal buffer keyed by task index and only yields them in order, so ordering is guaranteed regardless of completion time. The trade-off is that `starmap` holds finished results in memory until all tasks complete, but for this use case that is acceptable and the ordering guarantee is required.

---

### Issue 2: write_results Uses Positional Index Instead of record_id

**Problem:** Inside `write_results`, the `WHERE id = ?` clause is bound to `results[i][0]` rather than to `record_id`. Because `i` is the loop counter and `results[i][0]` is just the first element of the tuple at that position, this is functionally identical to using `record_id` only when the list happens to be in the expected order. When it is not (see Issue 1), the UPDATE targets whichever ID sits at position `i`, writing the wrong payload into that row.

**Fix:** At the CHANGE 2 site, replace `results[i][0]` with `record_id`. `record_id` is already unpacked from the current tuple in the `for` loop header, so no additional lookup is needed.

**Explanation:** The loop `for i, (record_id, transformed) in enumerate(results)` gives `record_id` directly — it is the ID that was returned alongside the transformed payload by `transform_worker`. Using `results[i][0]` instead is redundant when the list is ordered, and silently wrong when it is not. Even after fixing Issue 1, relying on index re-lookup is fragile: any future change that sorts or filters `results` before passing it to `write_results` would reintroduce the bug. Binding the UPDATE to the `record_id` variable from the tuple makes the intent explicit and keeps correctness independent of list ordering.
