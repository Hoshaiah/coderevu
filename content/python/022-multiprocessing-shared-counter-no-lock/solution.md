## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Unsynchronised Shared Counter in Workers
# ------------------------------------------------------------------------

import csv
import multiprocessing as mp
from multiprocessing.sharedctypes import Value
import ctypes

def import_chunk(rows: list[dict], counter: Value) -> None:
    for row in rows:
        _insert_row(row)          # assume this writes to the DB
        # CHANGE 1: wrap the increment in the Value's built-in lock so the read-modify-write is atomic across processes.
        with counter.get_lock():
            counter.value += 1

def run_import(path: str, workers: int = 4) -> int:
    with open(path, newline="") as f:
        all_rows = list(csv.DictReader(f))

    chunk_size = len(all_rows) // workers
    # CHANGE 2: build chunks with a list comprehension that gives the last chunk all remaining rows so tail rows are never silently dropped.
    chunks = [
        all_rows[i * chunk_size:(i + 1) * chunk_size] if i < workers - 1
        else all_rows[i * chunk_size:]
        for i in range(workers)
    ]
    counter = Value(ctypes.c_int, 0)

    procs = [mp.Process(target=import_chunk, args=(chunk, counter))
             for chunk in chunks]
    for p in procs:
        p.start()
    for p in procs:
        p.join()

    return counter.value

def _insert_row(row: dict) -> None:
    pass  # DB insert omitted for brevity
```

## Explanation

### Issue 1: Unsynchronised read-modify-write on shared counter

**Problem:** The final counter value is consistently lower than the number of rows processed. The gap grows with core count and file size, and single-process runs are always correct.

**Fix:** Wrap `counter.value += 1` in `with counter.get_lock():` so each increment is protected by the `Value`'s built-in `Lock`.

**Explanation:** `counter.value += 1` compiles to three steps: read the current value into a local register, add 1, write the result back. When two processes execute this concurrently without synchronisation, both can read the same value (say, 42), both compute 43, and both write 43 — the net effect is one increment instead of two. `multiprocessing.Value` ships with a reentrant lock specifically for this purpose; calling `get_lock()` returns it so you can use it as a context manager. Any increment that happens between another process's read and write is simply lost, which explains why the shortfall scales with parallelism but the DB row count (written inside a proper transaction) stays correct.

---

### Issue 2: Tail rows silently dropped by integer division

**Problem:** When the row count is not evenly divisible by `workers`, the remainder rows (up to `workers - 1`) are never assigned to any chunk, so they are never imported and never counted.

**Fix:** Change the last chunk's slice to `all_rows[i * chunk_size:]` instead of `all_rows[i * chunk_size:(i + 1) * chunk_size]`, giving all leftover rows to the final worker.

**Explanation:** With 4 workers and 1001 rows, `chunk_size` is 250. The four slices cover indices 0–249, 250–499, 500–749, and 750–999 — the row at index 1000 is never included. The fix detects when `i` is the last worker index (`i < workers - 1`) and uses an open-ended slice for that final chunk, which Python bounds-clips safely to the end of the list. This is independent of the lock bug: even with perfect synchronisation, those tail rows would still be missing from the count and from the DB.
