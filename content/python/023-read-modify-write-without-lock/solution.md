## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Read-Modify-Write Race on Shared Dict
# ------------------------------------------------------------------------

import time
from collections import defaultdict
import threading

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._counts: dict[str, list[float]] = defaultdict(list)
        # CHANGE 1: Add a lock to serialize all read-modify-write operations on _counts.
        self._lock = threading.Lock()

    def is_allowed(self, client_id: str) -> bool:
        now = time.monotonic()
        window_start = now - self.window_seconds
        # CHANGE 1: Acquire the lock before touching _counts so that the evict-check-append sequence is atomic across threads; CHANGE 2: holding the lock also prevents defaultdict from racing on key creation.
        with self._lock:
            timestamps = self._counts[client_id]
            # Evict old entries
            self._counts[client_id] = [t for t in timestamps if t > window_start]
            if len(self._counts[client_id]) < self.max_requests:
                self._counts[client_id].append(now)
                return True
            return False
```

## Explanation

### Issue 1: Missing lock causes over-admission

**Problem:** Under concurrent load, multiple threads each read the timestamp list for the same `client_id`, all see a length below `max_requests`, all append their own timestamp, and all return `True`. The rate limiter can admit 2× or more requests than the configured limit.

**Fix:** A `threading.Lock` instance (`self._lock`) is created in `__init__`, and `is_allowed` wraps the entire evict-check-append sequence in `with self._lock:` so only one thread executes that block at a time.

**Explanation:** The bug is a textbook read-modify-write race. Thread A reads the list, sees 9 entries against a limit of 10, and is about to append. Before it appends, Thread B also reads the list, also sees 9 entries, and also decides to append. Both append and both return `True`, giving 11 entries. With many concurrent threads the overshoot grows proportionally. Making the whole evict-check-append sequence atomic under a single lock means each thread sees the final committed state left by the previous thread, so the count is always accurate. A per-client lock (a `defaultdict` of `Lock` objects) would allow better concurrency across different clients; the single global lock is correct and is the minimal change needed here.

---

### Issue 2: Unprotected defaultdict key creation loses timestamps

**Problem:** When two threads access a `client_id` key that does not yet exist in the `defaultdict` at the same time, CPython's `defaultdict.__missing__` can be called by both threads. Each thread gets its own fresh list, and whichever list is stored last wins — timestamps written to the other list are silently discarded, making the limiter under-count and admit even more requests.

**Fix:** The same `with self._lock:` block introduced for Issue 1 wraps the `self._counts[client_id]` lookup, so only one thread ever triggers key creation at a time.

**Explanation:** `defaultdict` is not thread-safe for key creation. When `__missing__` runs, it calls the factory, stores the result, and returns it — but that is not an atomic operation at the Python level even though the GIL gives some protection. In practice, with a list factory, two threads can each call `__missing__`, each construct a new empty list, and then one list silently overwrites the other in the dict. Any timestamps the losing thread recorded are gone. Because `is_allowed` then appends to the winning (empty) list, the length check starts from zero again and the rate limit is effectively reset for that client. Holding `self._lock` across the lookup ensures only one thread ever initializes a key.
