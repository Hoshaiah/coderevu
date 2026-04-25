## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Busy-Wait Polling Starves CPU
# ------------------------------------------------------------------------

import threading
from queue import Queue, Empty

job_queue: Queue = Queue()

# CHANGE 2: add a stop event so the dispatch loop can be told to exit cleanly instead of spinning forever
_stop_event = threading.Event()

def dispatch_loop(pool_executor):
    while not _stop_event.is_set():
        try:
            # CHANGE 1: replace get_nowait() with a blocking get(timeout=…) so the thread sleeps when the queue is empty instead of spinning at 100% CPU
            job = job_queue.get(timeout=0.5)
            pool_executor.submit(job)
            job_queue.task_done()
        except Empty:
            pass  # timed out waiting — loop back and check _stop_event, then block again

def start_dispatcher(pool_executor):
    _stop_event.clear()
    t = threading.Thread(target=dispatch_loop, args=(pool_executor,), daemon=True)
    t.start()
    return t

# CHANGE 2: expose stop_dispatcher so callers can signal the loop to exit without killing the process
def stop_dispatcher():
    _stop_event.set()
```

## Explanation

### Issue 1: Busy-wait spin burns idle CPU

**Problem:** When there are no jobs in the queue, `dispatch_loop` calls `get_nowait()`, immediately catches `Empty`, does nothing (`pass`), and immediately tries again — thousands of times per second. One CPU core sits at 100% even though the system is completely idle, which triggers cloud auto-scaling alerts and wastes compute budget.

**Fix:** Replace `job_queue.get_nowait()` with `job_queue.get(timeout=0.5)`. The thread now blocks inside the queue's internal `Condition.wait()` for up to 500 ms before raising `Empty`, so the OS parks the thread and the core goes idle.

**Explanation:** `Queue.get_nowait()` is equivalent to `Queue.get(block=False)` — it checks the internal deque and returns immediately whether or not an item is present. When the queue is empty, the caller gets `Empty` with no waiting at all. The loop therefore runs at whatever speed the interpreter allows, consuming a full CPU timeslice every iteration. Switching to `get(timeout=0.5)` makes the thread call `Condition.wait(timeout=0.5)` under the hood, which releases the GIL and lets the OS scheduler put the thread to sleep until either a `put()` wakes it via `notify()` or the timeout expires. The 0.5 s timeout is a balance: short enough that the thread notices a shutdown request promptly, long enough that it doesn't spin. A timeout of `None` would block indefinitely and prevent the loop from reacting to the stop event, so a finite timeout is necessary here.

---

### Issue 2: No shutdown mechanism for the daemon thread

**Problem:** The dispatch thread is started as a daemon, so the process will not wait for it on exit — but there is no way for application code to ask it to stop cooperatively during, say, a graceful server shutdown or a test teardown. Any cleanup that depends on the dispatcher finishing its current job and exiting cleanly cannot be implemented.

**Fix:** Add a module-level `threading.Event` called `_stop_event` and a `stop_dispatcher()` function that sets it. The `while True` loop condition is changed to `while not _stop_event.is_set()`, and `start_dispatcher` calls `_stop_event.clear()` to reset state before launching the thread.

**Explanation:** Without a stop signal, the only way to terminate the thread is to let the process die (daemon behaviour) or raise an exception from outside, neither of which allows in-flight jobs to finish. A `threading.Event` is a lightweight, thread-safe boolean flag: `set()` makes `is_set()` return `True` in any thread with no locking needed by the caller. Because the blocking `get(timeout=0.5)` from Issue 1 will unblock at least every 500 ms, the loop will see `_stop_event.is_set()` as `True` and exit within half a second of `stop_dispatcher()` being called. One pitfall: if `_stop_event` is never cleared before `start_dispatcher` is called a second time (e.g., in tests), the new thread exits immediately — the `_stop_event.clear()` call in `start_dispatcher` prevents that.
