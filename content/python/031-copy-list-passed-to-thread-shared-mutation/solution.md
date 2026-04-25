## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Shared List Mutated Across Threads
# ------------------------------------------------------------------------

import threading
import copy
from typing import Callable

def process_chunk(chunk: list[dict], results: list, lock: threading.Lock, transform: Callable):
    for record in chunk:
        # CHANGE 1: work on a deep copy of each record so mutations here do not affect the original shared dict or any other thread's view of it
        record = copy.deepcopy(record)
        record["processed"] = True
        transformed = transform(record)
        with lock:
            results.append(transformed)

def parallel_process(records: list[dict], transform: Callable, n_threads: int = 4) -> list:
    chunk_size = max(1, len(records) // n_threads)
    results = []
    lock = threading.Lock()
    threads = []

    for i in range(n_threads):
        start = i * chunk_size
        # CHANGE 2: for the last thread extend the slice to the end of the list so remainder records are not silently dropped when len(records) % n_threads != 0
        end = (i + 1) * chunk_size if i < n_threads - 1 else len(records)
        chunk = records[start:end]
        t = threading.Thread(target=process_chunk, args=(chunk, results, lock, transform))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    return results
```

## Explanation

### Issue 1: Shared Dict Objects Mutated Across Threads

**Problem:** Users see duplicate or corrupted records in bulk imports. Threads receive different slices of `records`, but each slice contains references to the same underlying `dict` objects. When one thread writes `record["processed"] = True`, every other thread that holds a reference to that same dict sees the mutation immediately, even mid-iteration.

**Fix:** Inside `process_chunk`, replace the in-place mutation target with `record = copy.deepcopy(record)` before writing `record["processed"] = True`. This gives each thread its own independent copy of the dict to work on.

**Explanation:** Python list slicing (`records[a:b]`) creates a new list object, but its elements are still the same object references — a shallow copy. The teammate's `copy.copy()` on the chunk had the same problem: it copied the list container but not the dicts inside it. `copy.deepcopy` recursively copies every nested object, so the thread's local `record` is fully isolated. The practical failure mode is a race where thread A is mid-`transform(record)` using a dict that thread B has already modified, producing a record that is neither the original nor a correctly processed version. If `transform` reads `record` fields, it may see half-written state.

---

### Issue 2: Remainder Records Silently Dropped

**Problem:** When `len(records)` is not evenly divisible by `n_threads`, the integer division `len(records) // n_threads` rounds down. The final thread's slice ends at `n_threads * chunk_size`, which is less than `len(records)`, so the trailing records are never assigned to any thread and never appear in `results`. For example, 102 records with 4 threads yields `chunk_size = 25`, covering only 100 records.

**Fix:** Change the `end` index calculation so the last thread's slice uses `len(records)` as its upper bound instead of `(i + 1) * chunk_size`. The line `end = (i + 1) * chunk_size if i < n_threads - 1 else len(records)` achieves this without changing any other logic.

**Explanation:** Python slice notation is forgiving — `records[100:102]` on a 102-element list is valid and returns the last 2 elements — so no bounds check is needed. The fix only affects the final iteration of the loop (`i == n_threads - 1`). All earlier threads still get exactly `chunk_size` records. A related pitfall: if `n_threads > len(records)`, some threads receive empty slices (`[]`), which is harmless because the `for record in chunk` loop simply does nothing; but `chunk_size` is clamped to 1 via `max(1, ...)` precisely to avoid zero-length chunks in the earlier threads.
