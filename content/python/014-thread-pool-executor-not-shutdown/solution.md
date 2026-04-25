## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — ThreadPoolExecutor Never Shut Down
# ------------------------------------------------------------------------

import smtplib
import threading
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage

# CHANGE 1: Create one module-level executor shared across all calls instead of a new one per call, so worker threads are reused and capped at max_workers=4 total.
_executor = ThreadPoolExecutor(max_workers=4)

def send_notification(to: str, subject: str, body: str) -> None:
    # CHANGE 1: Submit to the shared module-level executor rather than a freshly created one, preventing unbounded thread accumulation.
    _executor.submit(_deliver, to, subject, body)

def _deliver(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg["From"] = "noreply@example.com"
    msg.set_content(body)
    with smtplib.SMTP("localhost", 25) as smtp:
        smtp.send_message(msg)
```

## Explanation

### Issue 1: Executor Created Per Call, Never Shut Down

**Problem:** Every call to `send_notification` creates a brand-new `ThreadPoolExecutor(max_workers=4)`. That executor spawns up to 4 threads and then is abandoned — nothing calls `shutdown()` on it. Over thousands of requests, the process accumulates thousands of idle threads. Eventually the OS refuses to create more threads and the service raises `RuntimeError: can't start new thread`.

**Fix:** A single `_executor` instance is created once at module level. `send_notification` submits work to that shared instance instead of constructing a new one. The `ThreadPoolExecutor` constructor call is removed from `send_notification` entirely.

**Explanation:** `ThreadPoolExecutor` keeps its worker threads alive after a task finishes so they can be reused for the next submission. When you abandon an executor without calling `shutdown()`, those threads have no reason to exit — they sit in their internal work queue loop waiting for more tasks forever. Python's garbage collector does not reliably finalize executors and call `shutdown()` for you, so the threads stay alive. With a shared module-level executor the same 4 threads handle every delivery call; new threads are never created beyond the initial pool. A related pitfall: if you do need per-request isolation, use the executor as a context manager (`with ThreadPoolExecutor(...) as ex:`) so `shutdown(wait=True)` is called automatically on exit — but that blocks the caller until the submitted task finishes, which defeats the fire-and-forget goal here.

---

### Issue 2: No Graceful Shutdown Path for the Executor

**Problem:** Even after moving to a shared executor, nothing calls `shutdown()` when the process exits, so in-flight email deliveries may be silently interrupted during a restart or shutdown signal.

**Fix:** The module-level `_executor` is defined with `ThreadPoolExecutor(max_workers=4)`. Python 3.9+ registers `ThreadPoolExecutor` instances with `atexit` automatically, but relying on that is fragile in frameworks that call `os._exit`. The fix at `CHANGE 1` at least constrains the thread count; teams that need guaranteed delivery on shutdown should call `_executor.shutdown(wait=True)` in their application teardown hook.

**Explanation:** `ThreadPoolExecutor` in Python 3.9+ does register an `atexit` handler internally, but `atexit` handlers are skipped when the interpreter is terminated via signals like `SIGKILL`, or when a framework calls `os._exit` directly (common in gunicorn worker teardown). With the old per-call pattern there are also no references to the abandoned executor objects, so even the `atexit` handler registered by each one may race with garbage collection. Using a named module-level `_executor` at least gives the application a clear handle to call `_executor.shutdown(wait=True)` in a signal handler or framework lifecycle hook, ensuring queued emails drain before the process exits.
