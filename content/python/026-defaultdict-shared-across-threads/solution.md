## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Shared defaultdict Mutated Concurrently
# ------------------------------------------------------------------------

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import threading

# Module-level shared state
event_counts: defaultdict[str, int] = defaultdict(int)

# CHANGE 1: Add a module-level lock to guard all reads and writes to event_counts.
_lock = threading.Lock()

def record_event(user_id: str, event_type: str) -> None:
    key = f"{user_id}:{event_type}"
    # CHANGE 1: Acquire the lock before the += so the read-check-write is atomic and no increment is lost.
    with _lock:
        event_counts[key] += 1

def flush_counts() -> dict[str, int]:
    """Return a snapshot and reset the counts."""
    # CHANGE 2: Hold the lock for the entire snapshot-and-clear so no writer can mutate the dict between the two operations.
    with _lock:
        snapshot = dict(event_counts)
        event_counts.clear()
    return snapshot

def start_workers(events: list[tuple[str, str]]) -> None:
    with ThreadPoolExecutor(max_workers=16) as pool:
        for user_id, event_type in events:
            pool.submit(record_event, user_id, event_type)
```

## Explanation

### Issue 1: Lost increments from non-atomic read-modify-write

**Problem:** Event counts come out lower than expected. Two threads can both read the same value for `event_counts[key]`, each add 1 to their local copy, and both write that same result back, so one of the increments is silently discarded. With 16 workers and popular keys, this happens frequently.

**Fix:** A `threading.Lock` named `_lock` is introduced. `record_event` wraps `event_counts[key] += 1` in `with _lock:`, making the read-add-write a single critical section that only one thread executes at a time.

**Explanation:** In CPython, `x += 1` on a dict value compiles to a `BINARY_SUBSCR` (read), `INPLACE_ADD`, and `STORE_SUBSCR` (write) — three bytecode instructions. The GIL can release between any of them at a thread switch, so two threads can interleave those steps on the same key. Thread A reads 5, thread B reads 5, thread A writes 6, thread B writes 6 — one increment is gone. Holding a lock for the full triplet prevents any other thread from entering the section until the write is done. A related pitfall: using `threading.local()` instead would appear to fix the race but would silo each thread's counts so they never aggregate at all.

---

### Issue 2: Unsynchronized snapshot-and-clear in `flush_counts`

**Problem:** The service logs `RuntimeError: dictionary changed size during iteration` during flush, and counts recorded between the `dict(event_counts)` line and the `event_counts.clear()` line are dropped entirely — they are not in the snapshot yet but are wiped by the clear.

**Fix:** The entire body of `flush_counts` — both `dict(event_counts)` and `event_counts.clear()` — is moved inside a single `with _lock:` block, so no `record_event` call can touch the dict while the flush is in progress.

**Explanation:** `dict(event_counts)` iterates the defaultdict to copy it. If any worker thread calls `record_event` with a brand-new key during that iteration, Python raises `RuntimeError` because the dict's size changed mid-iteration. Even when that exception does not fire, a count that arrives after the snapshot is taken but before `clear()` runs is in `event_counts` momentarily, then erased, and never appears in the snapshot. Holding `_lock` across both operations means all writers queue up and wait; the flush sees a consistent view and clears exactly what it snapshotted.
