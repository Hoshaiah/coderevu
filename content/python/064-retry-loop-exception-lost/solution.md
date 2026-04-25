## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Original Exception Lost in Retry Loop
# ------------------------------------------------------------------------

import time
import requests

def get_with_retry(url: str, retries: int = 3, backoff: float = 0.5) -> requests.Response:
    last_exc = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            return resp
        except (requests.RequestException, IOError) as exc:
            last_exc = exc
            time.sleep(backoff * (2 ** attempt))
    # CHANGE 2: Guard against last_exc being None (retries=0 or no iteration ran) before raising.
    if last_exc is None:
        raise RuntimeError(f"get_with_retry called with retries={retries}, no attempts made")
    # CHANGE 1: Use `raise ... from last_exc` so the original exception is chained, preserving its type, message, and traceback.
    raise RuntimeError(f"all {retries} retries exhausted") from last_exc
```

## Explanation

### Issue 1: Original Exception Lost on Re-raise

**Problem:** After retries are exhausted, Sentry (and any other exception tracker) shows only `RuntimeError: all 3 retries exhausted` with no cause attached. Engineers cannot tell whether the failure was a `ConnectTimeout`, a `ConnectionError`, or a 500 response, so diagnosing production incidents is much harder.

**Fix:** Replace `raise RuntimeError(f"all {retries} retries exhausted")` with `raise RuntimeError(f"all {retries} retries exhausted") from last_exc`, adding the `from last_exc` clause.

**Explanation:** Python's `raise X from Y` syntax sets `X.__cause__ = Y` and marks the exception as explicitly chained. When the runtime prints the traceback (and when Sentry serialises it), it walks `__cause__` and shows the full chain: the original `requests.Timeout` (or whatever) followed by the wrapping `RuntimeError`. Without `from last_exc`, the original exception object is stored in `last_exc` but is never attached to the new exception, so it is garbage-collected and vanishes from the traceback. A related pitfall: using a bare `raise` inside the `except` block re-raises the current exception directly but exits the loop early; `raise ... from last_exc` after the loop is the right place because it only fires once all attempts are exhausted.

---

### Issue 2: RuntimeError Raised When No Attempt Was Made

**Problem:** If `retries=0` is passed, `range(0)` produces no iterations, `last_exc` stays `None`, and the original code still raises `RuntimeError: all 0 retries exhausted`. The message is misleading and a caller catching the exception cannot inspect `__cause__` for a network error because there was none.

**Fix:** Add a guard `if last_exc is None: raise RuntimeError(...)` with a distinct message before the chained raise, so the two failure modes produce clearly different errors.

**Explanation:** When `range(retries)` iterates zero times the `try` block never runs, so `last_exc` is never assigned. Passing `None` to `raise RuntimeError(...) from None` is legal Python but explicitly suppresses chaining, which is the opposite of what we want. By checking `last_exc is None` first and raising a separate `RuntimeError` with a message that says no attempts were made, callers get an accurate signal that the problem is the call-site configuration (zero retries) rather than a network failure. This also makes it safe to use `from last_exc` unconditionally in the chained raise below, because by that point `last_exc` is guaranteed to be a real exception object.
