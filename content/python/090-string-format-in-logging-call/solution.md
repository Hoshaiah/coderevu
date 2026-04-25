## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Eager String Format in Log Call
# ------------------------------------------------------------------------

import json
import logging

logger = logging.getLogger(__name__)

def log_request(method: str, path: str, body: bytes) -> None:
    """
    Log request details at DEBUG level for tracing.
    Called on every inbound HTTP request.
    """
    # CHANGE 2: Guard all expensive work behind isEnabledFor so JSON decode and pretty-print are skipped entirely when DEBUG is not active.
    if not logger.isEnabledFor(logging.DEBUG):
        return

    decoded = body.decode("utf-8", errors="replace")
    try:
        pretty = json.dumps(json.loads(decoded), indent=2)
    except (ValueError, TypeError):
        pretty = decoded

    # CHANGE 1: Replace % string formatting with lazy %-style arguments passed to logger.debug so the stdlib defers formatting until it is certain the message will be emitted.
    logger.debug(
        "Incoming request: %s %s\nBody:\n%s", method, path, pretty
    )
    logger.debug(
        "Request size: %d bytes", len(body)
    )
```

## Explanation

### Issue 1: Eager `%` String Formatting in Logger Call

**Problem:** Every call to `logger.debug("..." % (method, path, pretty))` builds a fully formatted string in Python before `logger.debug` is even invoked. In production with log level `WARNING`, the logging system will immediately discard the message, but the string was already allocated and filled — this happens on every single HTTP request.

**Fix:** Replace the `%`-operator pre-formatting with separate positional arguments passed directly to `logger.debug`: `logger.debug("Incoming request: %s %s\nBody:\n%s", method, path, pretty)`. The same change is applied to the second `logger.debug` call.

**Explanation:** Python's `logging` module accepts a format string plus arguments and deliberately defers the `%` interpolation until after it has confirmed the message will actually be handled (i.e., the effective log level is low enough). When you pre-format with `"..." % (...)` before passing the result to `logger.debug`, you bypass that deferral entirely — the string is always constructed. Passing the format string and arguments separately lets the logger do the interpolation only when needed. A related pitfall: f-strings (`f"..."`) have the same eager-evaluation problem as `%`-operator pre-formatting and should also be avoided in log calls.

---

### Issue 2: Unconditional JSON Decode and Pretty-Print

**Problem:** `body.decode(...)`, `json.loads(decoded)`, and `json.dumps(..., indent=2)` all run on every request before any log-level check. In production the log level is `WARNING`, so this work is always discarded, but it still consumes CPU and memory proportional to the request body size on every inbound request — which is what the profiler flagged as the latency source.

**Fix:** Add an early-return guard `if not logger.isEnabledFor(logging.DEBUG): return` at the top of the function, before the `decode` and JSON serialization work.

**Explanation:** The `logger.isEnabledFor(logging.DEBUG)` call is extremely cheap — it reads a single integer comparison on the logger's effective level. Placing it before the decode/serialize block means the entire body of expensive work is skipped when the production log level is `WARNING` or higher. Without this guard, even switching to lazy `%` arguments in `logger.debug` (Issue 1) doesn't help, because `pretty` must still be computed to pass as an argument — the guard is what makes the body computation conditional. One pitfall to watch: if the function is refactored to log at multiple levels, the guard level must match the lowest level used, or some messages will be silently skipped.
