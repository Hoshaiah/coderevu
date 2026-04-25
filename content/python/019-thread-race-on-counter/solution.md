## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Unsynchronised counter increments lose updates under concurrent load
# ------------------------------------------------------------------------
import threading
from concurrent.futures import ThreadPoolExecutor

# CHANGE 1+2: protect all counter state with a lock so that initialisation,
# increment, and flush are mutually exclusive across threads.
_lock = threading.Lock()
counters: dict[str, int] = {}

def record_event(event_type: str) -> None:
    # CHANGE 1+2: acquire the lock before the check-then-set and the increment
    # so no two threads can interleave these operations.
    with _lock:
        if event_type not in counters:
            counters[event_type] = 0
        counters[event_type] += 1

def flush_counters() -> dict[str, int]:
    # CHANGE 3: hold the lock for the entire snapshot-then-clear so that no event increments are lost between the two operations.
    with _lock:
        snapshot = dict(counters)
        counters.clear()
    return snapshot

def process_events(events: list[str]) -> None:
    with ThreadPoolExecutor(max_workers=8) as pool:
        pool.map(record_event, events)
```

## Explanation

### Issue 1: Non-atomic increment loses concurrent updates

**Problem:** Under concurrent load the flushed totals are lower than the number of messages the broker confirmed. For example, with 8 worker threads all calling `record_event("click")` at the same time, many increments are silently lost.

**Fix:** Wrap the body of `record_event` in `with _lock:` (a `threading.Lock` created at module level). The lock is acquired at `CHANGE 1+2` before both the check and the increment.

**Explanation:** The expression `counters[event_type] += 1` compiles to a `LOAD`, an `INPLACE_ADD`, and a `STORE`. The GIL releases between any of these bytecode instructions, so thread A can load the value `5`, thread B can load the same `5`, both add 1, and both store `6` — the counter should now be `7` but it is `6`. With 8 workers under peak load this happens thousands of times per minute. Holding `_lock` for the full load-add-store sequence makes the operation atomic: only one thread executes it at a time, so no intermediate value is ever overwritten.

---

### Issue 2: Non-atomic key initialisation overwrites a concurrent write

**Problem:** Two threads processing the same `event_type` for the first time can both reach `if event_type not in counters` at the same moment, both find the key absent, and both execute `counters[event_type] = 0`. One of those stores happens after the other thread has already incremented the value, resetting it back to `0`.

**Fix:** The same `with _lock:` block introduced at `CHANGE 1+2` covers the `not in` check and the initialisation assignment, making the check-then-set a single atomic step.

**Explanation:** The check `event_type not in counters` and the subsequent assignment are two separate operations. The GIL can release between them. Thread A sees the key is missing and is about to initialise it; the GIL switches to thread B, which also sees the key is missing, initialises it to `0`, then increments it to `1`. Control returns to thread A, which overwrites the now-`1` value back to `0`. Even if thread A then increments to `1`, thread B's increment is gone. The lock eliminates this window entirely.

---

### Issue 3: Flush races with concurrent increments between snapshot and clear

**Problem:** Any `record_event` call that arrives after `snapshot = dict(counters)` but before `counters.clear()` is captured in neither the snapshot nor the next flush cycle — the event is permanently lost from the time-series database.

**Fix:** At `CHANGE 3`, `snapshot = dict(counters)` and `counters.clear()` are both placed inside `with _lock:`, so `record_event` cannot execute between them.

**Explanation:** Without the lock, the flush function takes a point-in-time copy of the dict and then clears it in two distinct steps. A worker thread can increment a counter in the gap between those two lines. That increment is not in `snapshot` (the copy was already taken) and it is erased by `counters.clear()`. Because the same `_lock` is used in both `record_event` and `flush_counters`, the flush holds exclusive access for the entire snapshot-and-clear operation. Workers block briefly during the flush and resume once the lock is released, so no increment falls into the gap.
