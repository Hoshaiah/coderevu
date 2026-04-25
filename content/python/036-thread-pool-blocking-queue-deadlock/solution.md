## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Producer Queue Deadlocks Thread Pool
# ------------------------------------------------------------------------

import queue
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RESULT_QUEUE_SIZE = 100

def process_image(path: str) -> dict:
    # Simulate image processing
    return {"path": path, "width": 1920, "height": 1080}

def run_pipeline(image_dir: str) -> list[dict]:
    result_queue: queue.Queue = queue.Queue(maxsize=RESULT_QUEUE_SIZE)
    results = []

    # CHANGE 2: Catch exceptions in the worker and put a sentinel Exception object so the drain loop always receives exactly one item per submitted task, preventing an indefinite get() block.
    def worker(path: str) -> None:
        try:
            result = process_image(path)
            result_queue.put(result)
        except Exception as exc:
            result_queue.put(exc)

    paths = list(Path(image_dir).glob("*.jpg"))

    # CHANGE 1: Submit all tasks first without entering the `with` block's implicit shutdown, then drain the queue concurrently before allowing the executor to shut down, breaking the circular wait where workers block on put() while shutdown waits for workers.
    executor = ThreadPoolExecutor(max_workers=8)
    try:
        for path in paths:
            executor.submit(worker, str(path))

        # Drain results while workers are still running so the bounded queue never stays full long enough to block all workers simultaneously.
        for _ in paths:
            item = result_queue.get()
            # CHANGE 2: Re-raise or skip results that are exceptions so callers see real errors instead of silently missing results.
            if isinstance(item, Exception):
                raise item
            results.append(item)
    finally:
        # CHANGE 1: Shutdown only after the drain loop has consumed all results, so no worker is blocked on put() when we wait for threads to finish.
        executor.shutdown(wait=True)

    return results
```

## Explanation

### Issue 1: Queue drain loop runs after all tasks submitted, causing deadlock

**Problem:** The pipeline hangs indefinitely on large datasets. Workers stop making progress, CPU drops to 0%, and the process must be killed. Logging shows workers blocked on `result_queue.put()` and the main thread blocked inside `executor.shutdown(wait=True)`.

**Fix:** Move the `executor.shutdown(wait=True)` call (previously implicit in the `with` statement's `__exit__`) to after the drain loop by replacing the `with` block with an explicit `executor = ThreadPoolExecutor(...)` / `executor.shutdown(wait=True)` in a `try/finally`. The drain loop now runs while workers are still live, so the queue is consumed before shutdown waits.

**Explanation:** The bounded queue has `maxsize=RESULT_QUEUE_SIZE` (100). When 100 workers have written results that the main thread has not yet read, every subsequent `result_queue.put()` call blocks. In the original code the drain loop is placed after the `for path in paths: executor.submit(...)` loop but still inside the `with ThreadPoolExecutor` block. When the `with` block's body finishes, Python calls `executor.shutdown(wait=True)` before returning — but that line is never reached because the drain loop is also inside the `with` body and runs first. Concretely: all 8 worker threads fill the queue to 100, then block on `put()`; the main thread is still in the `for path in paths: executor.submit(...)` loop submitting futures (which do not block), then it reaches the drain loop. However, with the original code order, `executor.shutdown` is called by the `with` block exit *before* the drain runs — so the drain never gets a chance to free space in the queue. Workers wait for space; shutdown waits for workers; space is never freed. Moving `shutdown` to after the drain breaks the cycle: the main thread drains results at the same time workers produce them, the queue never stays full long enough to block all workers, and shutdown finds threads idle.

---

### Issue 2: Worker exceptions silently prevent results from being enqueued

**Problem:** If `process_image` raises any exception, the worker function exits without calling `result_queue.put()`. The drain loop then calls `result_queue.get()` one time per submitted path and blocks forever waiting for a result that was never placed in the queue.

**Fix:** Wrap the body of `worker` in a `try/except Exception` block. On exception, `put` the exception object itself into the queue. In the drain loop, check `isinstance(item, Exception)` and re-raise it so the caller sees the real error instead of a hang.

**Explanation:** The drain loop calls `result_queue.get()` exactly `len(paths)` times, assuming each submitted task contributes exactly one item. If one worker crashes silently, the count is off by one and the last `get()` waits indefinitely. By always putting something into the queue — either a result dict or an exception object — each submitted task contributes exactly one item regardless of success or failure. The `isinstance(item, Exception)` check in the drain loop surfaces real errors immediately rather than converting them into an invisible deadlock. A related pitfall: if you want to continue processing remaining images after one failure, collect exceptions in a separate list rather than re-raising immediately — re-raising in the drain loop will skip calling `result_queue.get()` for remaining items, leaving workers blocked on `put()` again unless the `finally` block's `shutdown` cancels them.
