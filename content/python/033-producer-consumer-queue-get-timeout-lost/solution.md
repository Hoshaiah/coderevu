## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Queue Timeout Swallows Shutdown Signal
# ------------------------------------------------------------------------

import queue
import threading
from typing import Any

_stop = threading.Event()
_q: queue.Queue = queue.Queue()

def worker() -> None:
    while not _stop.is_set():
        try:
            # CHANGE 1: Use a short timeout (0.1 s) instead of 30 s so the loop re-checks _stop frequently and exits promptly after shutdown is requested.
            item = _q.get(timeout=0.1)
        except queue.Empty:
            continue
        try:
            _handle(item)
        finally:
            _q.task_done()
    # CHANGE 2: Drain any items that arrived before or during shutdown so in-flight work is not lost.
    while True:
        try:
            item = _q.get_nowait()
        except queue.Empty:
            break
        try:
            _handle(item)
        finally:
            _q.task_done()

def _handle(item: Any) -> None:
    pass

def shutdown() -> None:
    _stop.set()
```

## Explanation

### Issue 1: Long Blocking Timeout Delays Shutdown

**Problem:** After `_stop.set()` is called the worker does not exit until the current `_q.get(timeout=30)` call returns. If the queue is idle and a `get` was just entered, the worker blocks for up to 30 seconds before it loops back and checks `_stop.is_set()`. Operators see the container hang well past when shutdown was requested, eventually getting killed by SIGKILL.

**Fix:** Replace `timeout=30` with `timeout=0.1` at the `_q.get` call. This shrinks the maximum delay between when `_stop` is set and when the loop condition is re-evaluated to 100 ms.

**Explanation:** `threading.Event.is_set()` is only evaluated at the top of the `while` loop. Once execution enters `_q.get(timeout=30)`, the thread is parked inside the queue's internal condition variable for up to 30 seconds regardless of what happens to `_stop`. Reducing the timeout to a small value (100 ms is a common convention) means the thread wakes up, falls into the `queue.Empty` handler, loops back, and sees `_stop.is_set()` returning `True` almost immediately. A related pitfall: setting the timeout to 0 and catching `Empty` in a tight spin-loop would burn CPU; a small nonzero value is the right balance.

---

### Issue 2: Queue Not Drained After Shutdown Signal

**Problem:** When `_stop` is set the `while not _stop.is_set()` loop exits immediately, abandoning any items that were sitting in `_q` at that moment. Those events are silently dropped, which can cause data loss during rolling restarts.

**Fix:** After the main loop exits, add a drain loop that calls `_q.get_nowait()` in a `try/except queue.Empty` block until the queue is empty, processing each item the same way as normal.

**Explanation:** At the moment shutdown is signalled the queue may still hold events that were enqueued by producers. The original code exits the loop and returns without touching those items. The drain loop added after `CHANGE 2` uses `get_nowait()` (a non-blocking get) to pull and process every remaining item before the function returns. Because `get_nowait()` raises `queue.Empty` as soon as no items are left, the loop exits cleanly without blocking. One edge case to keep in mind: if producers keep enqueuing faster than the worker can drain, this loop could run indefinitely; in practice, shutdown should be coordinated so producers stop before or immediately after `_stop` is set.
