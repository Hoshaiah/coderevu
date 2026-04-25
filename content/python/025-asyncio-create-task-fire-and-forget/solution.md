## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Fire-and-Forget Task Silently Drops Exceptions
# ------------------------------------------------------------------------

import asyncio
import logging
import httpx

logger = logging.getLogger(__name__)

async def _send_notification(order_id: int, user_email: str) -> None:
    async with httpx.AsyncClient() as client:
        # CHANGE 3: call raise_for_status() so non-2xx responses surface as exceptions instead of being silently ignored.
        response = await client.post(
            "http://notifications.internal/send",
            json={"order_id": order_id, "email": user_email},
            timeout=5.0,
        )
        response.raise_for_status()

def _handle_task_result(task: asyncio.Task) -> None:
    """Callback attached to every background task to log exceptions that would otherwise be swallowed."""
    # CHANGE 1: retrieve the exception from the finished task so asyncio marks it as handled and we can log it.
    try:
        task.result()
    except Exception:
        logger.exception(
            "Background notification task raised an unhandled exception",
            extra={"task_name": task.get_name()},
        )

async def handle_order_created(order_id: int, user_email: str) -> dict:
    """
    Persist order and schedule notification without blocking the response.
    """
    # ... persist order to DB here ...

    # CHANGE 2: keep a strong reference to the task in the module-level set so the GC cannot destroy it before it finishes.
    task = asyncio.create_task(
        _send_notification(order_id, user_email),
        name=f"notify-order-{order_id}",
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    # CHANGE 1 (callback registration): attach the error-logging callback so every exception is captured and logged.
    task.add_done_callback(_handle_task_result)

    return {"status": "ok", "order_id": order_id}

# CHANGE 2: module-level set holds strong references to in-flight tasks so they are not garbage-collected prematurely.
_background_tasks: set[asyncio.Task] = set()
```

## Explanation

### Issue 1: Task exceptions silently discarded

**Problem:** When `_send_notification` raises (e.g., `ConnectionRefusedError` because the URL changed), the exception is stored inside the `asyncio.Task` object. Because nothing ever calls `task.result()`, asyncio only emits a low-priority warning when the task is garbage-collected — long after the error happened — and the warning is easy to miss. Operators see zero notifications delivered and zero log entries.

**Fix:** A `done_callback` named `_handle_task_result` is added at `CHANGE 1`. It calls `task.result()` inside a `try/except` block and forwards the exception to `logger.exception()`, which writes a full traceback to the application log. The callback is registered with `task.add_done_callback(_handle_task_result)` immediately after `create_task()`.

**Explanation:** asyncio stores the exception inside the `Task` until someone retrieves it. Calling `task.result()` in a done-callback counts as retrieval, which stops the "Task exception was never retrieved" warning and also gives you a place to act on the error. The callback fires in the same event-loop iteration that the task finishes, so the log entry appears close in time to the failure. One related pitfall: if you `await` the task instead of using a callback you block the response path — the whole point of `create_task()` is to avoid that — so the callback pattern is the right tool here.

---

### Issue 2: Task reference dropped, enabling premature GC

**Problem:** `asyncio.create_task()` returns a `Task` object, but the original code discards it immediately. CPython's garbage collector can collect an unreferenced object as soon as no strong references exist. If the task is collected before it runs, it is silently cancelled and the notification is never sent.

**Fix:** At `CHANGE 2`, a module-level `set` called `_background_tasks` is introduced. The `Task` is added to the set right after creation. A `done_callback` of `_background_tasks.discard` removes the task once it finishes, so the set does not grow unboundedly.

**Explanation:** The asyncio event loop keeps an internal weak reference to scheduled tasks, not a strong one, so holding the only strong reference yourself matters. By storing the task in a module-level set you guarantee CPython's reference count stays above zero for the whole lifetime of the coroutine. The `discard` callback in the done-callback chain cleans up the set entry without any race condition because done-callbacks run on the event loop thread, the same thread that manages the task.

---

### Issue 3: HTTP error responses not checked

**Problem:** `httpx` does not raise an exception for 4xx or 5xx responses by default — it returns a `Response` object with an error status code. Without inspecting the status, the code treats a `404 Not Found` or `503 Service Unavailable` from the notification service as a success, so failed deliveries are invisible even when the network path itself is working.

**Fix:** At `CHANGE 3`, `response.raise_for_status()` is called on the `Response` object returned by `client.post()`. This raises `httpx.HTTPStatusError` for any non-2xx status code, which then propagates out of `_send_notification` and is caught and logged by the `_handle_task_result` callback added in Issue 1.

**Explanation:** `httpx` follows the same design as `requests`: it separates transport-level errors (connection refused, timeout) from protocol-level errors (bad status codes). You get an exception for the former automatically, but you must opt in to exceptions for the latter by calling `raise_for_status()`. Without it, a misconfigured URL that returns a redirect loop or an error page looks identical to a successful delivery. Combining `raise_for_status()` with the logging callback means both categories of failure now produce a traceback in the application log.
