## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Bare except clause hides all errors and returns stale data silently
# ------------------------------------------------------------------------
import urllib.request
import urllib.error
import json
import logging

logger = logging.getLogger(__name__)

_price_cache: dict[str, float] = {}

def get_current_price(ticker: str) -> float:
    try:
        url = f"https://prices.internal/api/v1/quote?symbol={ticker}"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read().decode())
            price = float(data["last_price"])
            _price_cache[ticker] = price
            return price
    # CHANGE 1: Replace bare `except:` with specific network/HTTP exceptions so that programming errors (KeyError, AttributeError, etc.) are NOT swallowed.
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        # CHANGE 3: Log the exception so operators see failures in the log stream instead of discovering them through bad trade executions.
        logger.error(
            "Failed to fetch price for %s: %r — using cached value",
            ticker,
            exc,
        )
        # CHANGE 2: Raise when no cached value exists rather than returning 0.0, so callers know the price is unavailable and can reject the order.
        if ticker not in _price_cache:
            raise RuntimeError(
                f"No price available for {ticker} and fetch failed: {exc}"
            ) from exc
        return _price_cache[ticker]
```

## Explanation

### Issue 1: Bare `except` swallows all exception types

**Problem:** The bare `except:` clause catches every exception Python can raise, including `KeyboardInterrupt`, `SystemExit`, `KeyError` (if the API response changes its field name), and any `AttributeError` introduced by a library upgrade. When the team upgraded the HTTP library, a new exception type was raised, but it landed in this catch-all and was silently discarded.

**Fix:** Replace `except:` with `except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:` — the exact set of exceptions that represent genuine network-layer failures.

**Explanation:** Python's bare `except:` is broader than `except Exception:` — it also catches `BaseException` subclasses like `KeyboardInterrupt` and `SystemExit`. More practically, if the API response no longer contains `"last_price"`, the `KeyError` raised on `data["last_price"]` is caught here and the function falls back to cache. The caller never sees the data-shape bug. By naming only the network exceptions, any unexpected exception propagates up the call stack where it will be noticed and logged by the framework. A related pitfall: if you later add retry logic inside the `except` block, a bare clause would retry on `KeyboardInterrupt`, making the process unresponsive to Ctrl-C.

---

### Issue 2: Returning `0.0` when no cache entry exists

**Problem:** When a ticker has never been successfully fetched and a network error occurs, `_price_cache.get(ticker, 0.0)` returns `0.0`. An order for that instrument then executes using a price of zero, which is a valid-looking float that passes any downstream type check.

**Fix:** Check `if ticker not in _price_cache:` and raise a `RuntimeError` with a descriptive message instead of returning the default `0.0`. When a cached value does exist, return it as before.

**Explanation:** The `dict.get` default parameter is convenient for read-heavy code, but here the default value `0.0` is indistinguishable from a real price in a zero-price instrument (though uncommon, some derivative contracts can price near zero). Raising an exception forces the caller — the order-execution path — to handle the unavailable price explicitly, typically by rejecting the order. The stale-cache path (returning the last known good price during a brief outage) is reasonable behaviour, but only when a real price was previously stored. Separating the two cases makes the intent explicit.

---

### Issue 3: No logging means failures are invisible to operators

**Problem:** When an exception is caught, nothing is written to any log. Operators watching dashboards or log aggregators see no signal that prices are being fetched from cache or are unavailable. The symptom surfaces only as wrong trade prices, which are hard to correlate back to this function.

**Fix:** Add `logger.error("Failed to fetch price for %s: %r — using cached value", ticker, exc)` immediately inside the `except` block, using the standard `logging` module.

**Explanation:** Error handling without logging is operationally blind. When the HTTP library upgrade changed exception types, the bare `except` caught the new exception and returned stale data — but because nothing was logged, the incident appeared as a data quality problem rather than a fetch failure. Adding `logger.error` with the ticker and the exception repr gives operators the information needed to correlate log spikes with bad price windows. Using `%r` on the exception includes the exception type and message in the log line, which is what made the library-upgrade failure diagnosable in post-mortem.
