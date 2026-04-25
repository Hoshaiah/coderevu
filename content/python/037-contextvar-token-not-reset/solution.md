## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — ContextVar Token Never Reset
# ------------------------------------------------------------------------

from contextvars import ContextVar
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

_current_user: ContextVar[dict | None] = ContextVar("current_user", default=None)

def get_current_user() -> dict | None:
    return _current_user.get()

class UserContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        user = await _resolve_user_from_request(request)
        # CHANGE 1: Capture the Token returned by set() so we can reset to the exact previous state rather than hardcoding None.
        token = _current_user.set(user)
        try:
            response = await call_next(request)
        finally:
            # CHANGE 2: Call reset(token) instead of set(None) to atomically restore whatever value _current_user held before this middleware ran, preventing cross-request bleed.
            _current_user.reset(token)
        return response

async def _resolve_user_from_request(request: Request) -> dict | None:
    token = request.headers.get("X-Auth-Token", "")
    # Simplified: look up user by token
    if token == "valid-token":
        return {"user_id": 42, "role": "user"}
    return None
```

## Explanation

### Issue 1: Token From `set()` Discarded

**Problem:** `ContextVar.set()` returns a `Token` object that records the previous value of the variable. The buggy code throws this token away, so there is no way to undo the `set()` precisely. Under high concurrency, when Starlette reuses or shares asyncio task contexts, the user set for one request can leak into another.

**Fix:** Assign the return value of `_current_user.set(user)` to a local variable named `token` (the line marked `# CHANGE 1`), then pass that token to `_current_user.reset(token)` in the `finally` block (the line marked `# CHANGE 2`).

**Explanation:** `ContextVar.set()` is designed to be paired with `ContextVar.reset(token)`. The token encodes not just the old value but also which specific `set()` call it belongs to — the runtime uses this to validate that resets happen in the correct order. Discarding the token and calling `set(None)` instead writes a brand-new value of `None`; it does not undo the earlier `set()`. In a normal asyncio setup each request gets a copy of the context, so the leak is contained. But `BaseHTTPMiddleware` in Starlette runs `call_next` in a background task that shares context in ways that can expose a prior request's value if the reset is not done through the token. Using `reset(token)` atomically restores the variable to whatever it was before `set(user)` was called, even if that was something other than `None` — for example, in test harnesses or nested middleware that also writes to `_current_user`.

---

### Issue 2: `set(None)` Does Not Restore Previous Context State

**Problem:** Writing `_current_user.set(None)` in the `finally` block always forces the value to `None`, regardless of what it was before the middleware ran. If any outer middleware or test fixture had already set a non-`None` value, this destroys it. More practically, if an exception fires and the asyncio task is recycled, the next request may briefly observe `None` or, in edge cases where the finally block itself is interrupted, a stale user dict.

**Fix:** Replace `_current_user.set(None)` with `_current_user.reset(token)` (the line marked `# CHANGE 2`), where `token` is captured at `# CHANGE 1`. This makes the cleanup operation idempotent and context-safe.

**Explanation:** `ContextVar.reset(token)` is the only sanctioned way to undo a `set()`. It checks that the token was issued by this exact variable and has not already been consumed, raising `ValueError` if something is wrong — giving you a loud failure instead of silent data corruption. Calling `set(None)` bypasses this check and produces a new token of its own that is also discarded. Under load, when 422 or 500 responses cause the exception path to run in a different continuation than the happy path, the ordering of `set()` calls can diverge from what `reset()` expects. Using the token keeps the variable's internal state consistent regardless of which code path the exception takes.
