## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Worker Exception Silently Swallowed in Pool
# ------------------------------------------------------------------------

import multiprocessing
from pathlib import Path
from PIL import Image

def _resize_worker(args: tuple[str, str, tuple[int, int]]) -> None:
    src, dst, size = args
    with Image.open(src) as img:
        img.thumbnail(size)
        img.save(dst)

def resize_all(
    jobs: list[tuple[str, str, tuple[int, int]]],
    workers: int = 4,
) -> None:
    pool = multiprocessing.Pool(processes=workers)
    # CHANGE 2: Use try/finally so the pool is always terminated on error or timeout, preventing process leaks.
    try:
        result = pool.map_async(_resize_worker, jobs)
        pool.close()
        # CHANGE 1: Replace result.wait() with result.get() so worker exceptions are re-raised here in the main process; wait() discards them.
        # CHANGE 3: Pass the same 10-minute timeout to result.get() so a hung worker raises multiprocessing.TimeoutError instead of blocking forever.
        result.get(timeout=600)
    except Exception:
        # CHANGE 2: Terminate all worker processes immediately on any failure before re-raising.
        pool.terminate()
        raise
    finally:
        pool.join()
```

## Explanation

### Issue 1: Worker exceptions discarded by `result.wait()`

**Problem:** Workers raise exceptions (e.g., `PIL.UnidentifiedImageError` on a corrupt file), but the main process exits with code 0 and reports success. The output files for those workers are simply absent, with no error logged.

**Fix:** Replace `result.wait(timeout=600)` with `result.get(timeout=600)`. The `result.get()` call re-raises the first worker exception in the main process exactly as if it happened locally.

**Explanation:** `AsyncResult.wait()` blocks until the result is ready but intentionally does not surface exceptions — it only checks whether the computation finished. `AsyncResult.get()` does the same waiting AND then inspects the result: if any worker raised, `get()` re-raises that exception in the caller. Because `wait()` was used, every worker failure was silently absorbed, the job continued, and the missing output files were the only evidence. A related pitfall: if you call `result.ready()` after `wait()`, it returns `True` even when every worker failed, because "ready" means "done", not "successful".

---

### Issue 2: Pool not terminated on failure, leaking worker processes

**Problem:** If `result.get()` raises (after the fix above), `pool.join()` is never reached. The worker processes stay alive until the OS cleans them up, which on a nightly batch host can exhaust the process table before the next run.

**Fix:** Wrap the `map_async` / `get` block in a `try/except/finally`. In the `except` block, call `pool.terminate()` before re-raising. The `finally` block always calls `pool.join()` to reap the workers.

**Explanation:** `pool.close()` signals that no more work will be submitted and lets workers finish normally, but it does not stop them if an exception occurs in the main thread. `pool.terminate()` sends SIGTERM to each worker immediately. Without it, an exception in the main process exits the `resize_all` function while workers are still running, holding file handles and memory. The `finally: pool.join()` ensures the main process waits for those processes to fully exit regardless of success or failure, which also prevents zombie processes.

---

### Issue 3: No timeout on the result fetch causes indefinite blocking

**Problem:** Before the fix, `result.wait(timeout=600)` had a timeout, but after switching to `result.get()` without a timeout argument, a single hung worker (e.g., blocked on a network-mounted filesystem) would cause the main process to block forever with no exception and no exit.

**Fix:** Pass `timeout=600` to `result.get(timeout=600)`, matching the original intent. If the batch does not complete within 10 minutes, `multiprocessing.TimeoutError` is raised, the `except` block terminates the pool, and the job exits non-zero.

**Explanation:** `AsyncResult.get()` without a timeout is an indefinite block. The original code passed a timeout only to `wait()`, so the timeout logic was lost when switching to `get()`. With `timeout=600` on `get()`, a hung worker causes a `multiprocessing.TimeoutError` to propagate up through the `except Exception` handler, which calls `pool.terminate()` to kill the stuck workers before re-raising. This ensures the nightly job always terminates within a bounded window and operators get a clear traceback rather than a job that runs until manually killed.
