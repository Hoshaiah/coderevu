## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Bounded Deque Drops Events Silently
# ------------------------------------------------------------------------

import threading
from collections import deque
from typing import Any

class EventBuffer:
    # CHANGE 2: Remove maxlen so the deque is unbounded and never silently drops events on overflow.
    def __init__(self, maxlen: int = 10_000):
        self._buf: deque = deque()  # CHANGE 2: no maxlen argument — unbounded deque preserves every event under load.
        self._lock = threading.Lock()

    def append(self, event: Any) -> None:
        with self._lock:
            self._buf.append(event)

    def drain(self) -> list[Any]:
        # CHANGE 1: Do both snapshot and clear inside the same lock acquisition so no events appended between the two steps can be lost.
        with self._lock:
            snapshot = list(self._buf)
            self._buf.clear()  # CHANGE 1: moved clear() inside the lock, atomically paired with the snapshot.
        return snapshot
```

## Explanation

### Issue 1: Clear Outside Lock Loses Events

**Problem:** During high-throughput periods, events appended between `list(self._buf)` and `self._buf.clear()` are captured in neither the returned snapshot nor the next drain call — they are simply erased. The metrics dashboard shows gaps of 30–60 seconds because entire bursts of events land in this window and are wiped away.

**Fix:** Move `self._buf.clear()` to immediately after `snapshot = list(self._buf)`, both inside the `with self._lock` block. This is the `CHANGE 1` site in `drain()`.

**Explanation:** The original code releases the lock after building the snapshot, then calls `clear()` without the lock held. Any producer thread that runs `append()` in that gap writes an event into `self._buf` before `clear()` executes. When `clear()` runs it deletes those freshly appended events — they were never in the snapshot and will never be seen again. Moving `clear()` inside the lock means the buffer cannot accept new events between the snapshot and the wipe; the next `append()` call starts filling a freshly empty deque after the lock is released. A related pitfall: even if you swap `clear()` for `self._buf = deque()`, you must do it under the lock, otherwise the producer may append to the old object that is about to be abandoned.

---

### Issue 2: Bounded Deque Silently Drops Oldest Events

**Problem:** With `maxlen=10_000` and a producer rate of 50,000 events/second, the deque fills in about 200 ms. Every subsequent `append()` pushes out the oldest element without any error, warning, or counter increment. The on-call team sees dashboard gaps and has no log evidence of drops because `collections.deque` discards silently.

**Fix:** Remove the `maxlen` argument from the `deque()` constructor at `CHANGE 2`, making the buffer unbounded. Memory grows under sustained overload instead of losing data.

**Explanation:** `collections.deque(maxlen=N)` is designed for use cases like "keep the last N log lines" where dropping old data is intentional. Here the intent is the opposite: buffer events temporarily while the consumer catches up, then drain them all. When the producer outpaces the consumer by 5× even briefly, `maxlen=10_000` is exhausted in well under a second and every subsequent `append()` silently evicts an event from the left end. Removing `maxlen` trades bounded memory for guaranteed delivery. If memory is a real constraint, the right approach is to add an explicit capacity check inside `append()` that raises an exception or records a metric so the drop is observable, rather than using deque's silent eviction.
