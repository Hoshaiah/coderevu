## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Repeated Timer Leak on Reschedule
# ------------------------------------------------------------------------

import threading
import urllib.request

HEARTBEAT_URL = "http://discovery.internal/heartbeat"
INTERVAL = 30.0

_timer: threading.Timer | None = None
# CHANGE 2: Add a lock to guard _timer access across the ping callback and stop_heartbeat to eliminate the race window.
_lock = threading.Lock()
# CHANGE 2: Add a flag so an in-flight _ping() knows stop_heartbeat() was called and must not reschedule.
_running = False

def _ping() -> None:
    try:
        urllib.request.urlopen(HEARTBEAT_URL, timeout=5)
    except Exception:
        pass
    _schedule()

def _schedule() -> None:
    global _timer
    # CHANGE 2: Check _running under the lock before rescheduling so a concurrent stop_heartbeat() prevents a new Timer from being created.
    with _lock:
        if not _running:
            return
        # CHANGE 1: Cancel the existing timer before creating a new one so the old thread is released and does not accumulate.
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(INTERVAL, _ping)
        _timer.daemon = True
        _timer.start()

def start_heartbeat() -> None:
    global _running
    # CHANGE 2: Set _running=True under the lock before scheduling so the flag is consistent from the first call.
    with _lock:
        _running = True
    _schedule()

def stop_heartbeat() -> None:
    global _timer, _running
    # CHANGE 2: Set _running=False under the lock so any concurrent _schedule() call sees it and exits without creating a new Timer.
    with _lock:
        _running = False
        if _timer is not None:
            _timer.cancel()
            _timer = None
```

## Explanation

### Issue 1: Timer thread not cancelled on reschedule

**Problem:** Every 30 seconds `_schedule()` assigns a brand-new `threading.Timer` to `_timer` without ever calling `.cancel()` on the previous one. A `Timer` that has already fired is in a finished state, but CPython does not immediately reclaim its OS thread until the `Thread` object is garbage-collected. Because `_timer` is the only reference and it is immediately overwritten, the old object becomes eligible for GC, but in practice the thread accumulates faster than it is reaped. Ops sees `threading.active_count()` climb by one every 30 seconds.

**Fix:** At the top of `_schedule()`, inside the new `_lock` block, call `_timer.cancel()` before overwriting `_timer` with the new `threading.Timer` instance. This is the `# CHANGE 1` site.

**Explanation:** A `threading.Timer` is a subclass of `Thread`. When the timer fires, the thread finishes its `run()` method and the underlying OS thread exits, but the Python `Thread` object lingers until nothing holds a reference to it. Overwriting `_timer` without cancelling drops the reference but does not force immediate cleanup. Under CPython the GC will eventually collect it, but the rate of collection lags the rate of creation under normal load, so the count drifts up. Calling `.cancel()` before reassignment is a no-op if the timer has already fired (it just sets an internal `Event`), so it is always safe to call. The cancel does not accelerate GC, but it does prevent a still-pending timer from firing a second time if `_schedule()` is ever called early.

---

### Issue 2: Race between stop_heartbeat() and in-flight _ping()

**Problem:** `stop_heartbeat()` cancels `_timer` and sets it to `None`, but a `_ping()` call that is already executing concurrently finishes its HTTP request and then calls `_schedule()`, which creates and starts a fresh `Timer` after the stop. The heartbeat continues running after it was told to stop, and the new timer is never stored where `stop_heartbeat()` can reach it.

**Fix:** Introduce a module-level `threading.Lock` (`_lock`) and a boolean flag `_running`. `start_heartbeat()` sets `_running = True` under the lock before scheduling. `_schedule()` checks `_running` under the lock and returns immediately if it is `False`, skipping the new `Timer` creation. `stop_heartbeat()` sets `_running = False` and cancels the current timer, both under the same lock. These are the `# CHANGE 2` sites.

**Explanation:** Without synchronization there is a window: `stop_heartbeat()` reads `_timer`, calls `cancel()`, and sets `_timer = None`; meanwhile `_ping()` completes its HTTP call and enters `_schedule()`, where it creates a new `Timer` and starts it. That new `Timer` is never assigned to `_timer` before `stop_heartbeat()` finishes, so it escapes the cancel. The lock closes this window by making the check-and-set of `_running` atomic with respect to both callers. The `_running` flag is necessary in addition to the lock because the lock alone only serialises the two functions — without the flag, `_schedule()` still does not know whether it should proceed.
