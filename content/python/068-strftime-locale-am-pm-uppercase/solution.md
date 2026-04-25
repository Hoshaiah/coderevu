## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — strptime Locale Mismatch on Non-English Host
# ------------------------------------------------------------------------

import locale
from datetime import datetime

def parse_vendor_timestamp(raw: str) -> datetime:
    """
    Parses timestamps like '03/15/2024 02:45 PM' from the vendor feed.
    The feed always uses English (en_US) AM/PM notation regardless of host locale.
    """
    # CHANGE 1: Save the current LC_TIME locale, force it to C (POSIX/English) for strptime, then restore — this ensures %p matches 'AM'/'PM' on any host locale.
    saved_locale = locale.setlocale(locale.LC_TIME)
    try:
        locale.setlocale(locale.LC_TIME, 'C')
        # CHANGE 2: Wrap strptime in try/except to raise a descriptive error that includes the offending raw value, making production failures easier to diagnose.
        try:
            return datetime.strptime(raw.strip(), "%m/%d/%Y %I:%M %p")
        except ValueError as exc:
            raise ValueError(
                f"parse_vendor_timestamp: could not parse {raw!r} with format "
                f"'%m/%d/%Y %I:%M %p': {exc}"
            ) from exc
    finally:
        locale.setlocale(locale.LC_TIME, saved_locale)
```

## Explanation

### Issue 1: Locale-Dependent %p AM/PM Parsing

**Problem:** On a `fr_FR.UTF-8` host, Python's `datetime.strptime` delegates `%p` (AM/PM) matching to the C library's locale-aware time parsing. French locales do not recognise the English tokens `AM` and `PM`, so every PM timestamp raises `ValueError` and AM timestamps behave inconsistently across libc versions.

**Fix:** Before calling `strptime`, `locale.setlocale(locale.LC_TIME, 'C')` forces the time locale to the portable POSIX/English locale. The previous value is saved with `locale.setlocale(locale.LC_TIME)` (no second argument) and restored in a `finally` block so the rest of the process is unaffected.

**Explanation:** `datetime.strptime` internally calls `_strptime._strptime`, which reads `locale.getlocale(locale.LC_TIME)` to build the regex for `%p`. In the `C` locale the only valid values are the ASCII strings `AM` and `PM`, which matches the vendor feed exactly. In `fr_FR` the locale may define different strings or none at all, so the regex never matches `PM`. Saving and restoring the locale is necessary because `locale.setlocale` is process-global; changing it without restoring would break any other code in the same process that legitimately depends on the French locale. A related pitfall: this approach is not thread-safe if other threads call locale-sensitive code simultaneously — in a multi-threaded server consider using `babel` or a manual parser instead of `setlocale`.

---

### Issue 2: Silent Propagation of Unparseable Records

**Problem:** When `strptime` raises `ValueError`, the raw string that caused the failure is not included in the error message. In production logs operators see a generic message like `time data '03/15/2024 02:45 PM' does not match format '...'` only if they happen to be looking at the right place; nothing in the traceback identifies which feed record or what the input value was at the call site.

**Fix:** A `try/except ValueError` block around `strptime` catches the original exception and re-raises a new `ValueError` whose message includes `raw!r` (the exact input string) and the original exception text, using `raise ... from exc` to preserve the chain.

**Explanation:** Python's `strptime` error message contains the format string and the input value, but once the exception travels up several call frames through a feed ingestion pipeline the original message is often swallowed or logged at a low level. Embedding the raw value in the exception at the point closest to the failure means any logger or error tracker that captures the exception message automatically records what the parser received. Using `raise ... from exc` keeps the original traceback available for debugging while the new message surfaces in the summary line.
