## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Logger Handler Added on Every Call
# ------------------------------------------------------------------------

import logging
import sys

def get_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    """
    Return a logger with a StreamHandler attached to stdout.
    Safe to call multiple times — always returns the same named logger.
    """
    logger = logging.getLogger(name)

    # CHANGE 1: Only configure the logger when it has no handlers yet, preventing duplicate handlers from being added on repeated calls with the same name.
    if not logger.handlers:
        # CHANGE 2: Set the level only during initial setup so runtime level changes made after the first call are not silently overwritten.
        logger.setLevel(level)

        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter(
            "%(asctime)s %(name)s %(levelname)s %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
```

## Explanation

### Issue 1: Handler Added on Every Call

**Problem:** Every time `get_logger` is called with the same logger name, a brand-new `StreamHandler` is appended to the logger. Because `logging.getLogger` returns the same `Logger` object for a given name, the logger accumulates one extra handler per call. A worker function called 4 times produces 4 handlers, so each log line is written 4 times. The longer the process runs, the worse the duplication gets.

**Fix:** Wrap the handler creation and `logger.addHandler` call inside `if not logger.handlers:` so the setup block only executes when the logger has no handlers attached yet.

**Explanation:** Python's `logging` module stores named loggers in a global registry. `logging.getLogger('foo')` always returns the exact same object. `addHandler` appends to an internal list — it does not check for duplicates. So calling `get_logger('foo')` ten times results in ten identical `StreamHandler` objects all firing for every log record. The guard `if not logger.handlers:` short-circuits the setup on every call after the first. One edge case to keep in mind: if external code attaches its own handler before `get_logger` is called, the guard will skip setup entirely, which may leave the logger without your custom formatter. If that matters, you can instead check specifically for your handler type rather than the generic `handlers` list.

---

### Issue 2: Level Overwritten on Every Call

**Problem:** `logger.setLevel(level)` runs unconditionally on every call. If any code raises the log level at runtime (e.g., switching to `DEBUG` for a troublesome request), the next call to `get_logger` with the default `level=INFO` silently resets it back, discarding the change without any error or warning.

**Fix:** Move `logger.setLevel(level)` inside the `if not logger.handlers:` block alongside the handler setup, so the level is set only during initial configuration.

**Explanation:** The `Logger` object is shared across the entire process. Setting its level is a stateful mutation. Calling `get_logger` again should be idempotent — it should return the logger as-is rather than resetting it. By placing `setLevel` inside the initialization guard, the first call configures the level and subsequent calls leave it alone. A related pitfall: if you need to support changing the level via `get_logger` intentionally (e.g., a reconfiguration call), you would need a separate `set_level` function or an explicit `force` parameter rather than relying on repeated calls to `get_logger`.
