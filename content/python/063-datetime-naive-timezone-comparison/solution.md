## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Mixing naive and timezone-aware datetimes causes incorrect scheduling decisions
# ------------------------------------------------------------------------
from datetime import datetime, timezone

def is_in_maintenance_window(start_iso: str, end_iso: str) -> bool:
    """
    start_iso and end_iso may be timezone-aware ISO strings like
    '2024-03-15T22:00:00+05:30' or naive strings like '2024-03-15T22:00:00'.
    """
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso)

    # CHANGE 2 & 3: Normalize naive datetimes to UTC-aware by attaching the UTC
    # timezone. A naive string is assumed to have been entered in UTC. This prevents
    # both the wall-clock shift bug and allows comparison with an aware 'now'.
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    # CHANGE 1 & 3: Use datetime.now(timezone.utc) instead of datetime.utcnow().
    # This produces a timezone-aware datetime so it can be compared with aware
    # start/end without a TypeError, and works correctly in Python 3.12+.
    now = datetime.now(timezone.utc)

    return start <= now <= end
```

## Explanation

### Issue 1: Mixing naive and aware datetimes raises TypeError

**Problem:** When `start_iso` or `end_iso` includes a UTC offset (e.g., `+05:30`), `fromisoformat` produces a timezone-aware `datetime`. `datetime.utcnow()` always produces a naive `datetime`. Python refuses to compare a naive and an aware `datetime` with `<=`, raising `TypeError: can't compare offset-naive and offset-aware datetimes`. The gate crashes rather than returning a correct answer.

**Fix:** Replace `datetime.utcnow()` with `datetime.now(timezone.utc)` (CHANGE 1), which returns a timezone-aware `datetime`. After also normalizing naive `start`/`end` to aware (CHANGE 2), all three operands share the same type and the comparison succeeds.

**Explanation:** Python's `datetime` comparison operators do a strict type check: both sides must either both be naive or both be aware. `datetime.utcnow()` looks like it returns "UTC time" but the object carries no `tzinfo`, so Python sees it as naive. The moment one of `start` or `end` is parsed from an offset-bearing string, the comparison throws. `datetime.now(timezone.utc)` returns the same instant but marks it with `tzinfo=timezone.utc`, satisfying the type check. A related pitfall: if you catch the `TypeError` somewhere up the call stack and default to `False`, the gate silently allows deployments through every time a tz-aware window is active.

---

### Issue 2: Naive ISO strings treated as local time, not UTC

**Problem:** Some maintenance windows are stored without a timezone offset (e.g., `2024-03-15T22:00:00`). `fromisoformat` on such a string produces a naive `datetime` whose numeric values match wall-clock time in whatever timezone the operator typed them — often their local time. When later compared to UTC, the window boundary is off by the operator's UTC offset (could be ±12 hours), causing the gate to block or allow deployments at the wrong times.

**Fix:** After parsing, check `start.tzinfo is None` and `end.tzinfo is None` (CHANGE 2). If either is naive, call `.replace(tzinfo=timezone.utc)` to declare it UTC-aware. This treats the raw numbers as UTC, which is the correct assumption for a UTC server environment.

**Explanation:** `datetime.replace(tzinfo=...)` does not shift the numeric values — it just attaches metadata. So `2024-03-15T22:00:00` becomes `2024-03-15T22:00:00+00:00`, meaning "22:00 UTC". If the operator actually typed a local time, the underlying data is still wrong, but that is a data-entry problem. The server-side code must consistently interpret ambiguous naive strings as UTC rather than leaving them naked, because the comparison against `now` (which is UTC) would otherwise be off by the server's local offset. On a server already running in UTC (`/etc/localtime` → UTC), this bug is hidden in testing but appears immediately on a developer's machine in a different timezone.

---

### Issue 3: datetime.utcnow() deprecated and semantically misleading

**Problem:** `datetime.utcnow()` is deprecated as of Python 3.12 and emits `DeprecationWarning` in newer runtimes. More importantly, it returns a naive `datetime`, which means downstream code (including comparisons in this function) has no machine-readable proof that the value is in UTC — it is purely a convention.

**Fix:** Replace `datetime.utcnow()` with `datetime.now(timezone.utc)` (CHANGE 3). The returned object carries `tzinfo=timezone.utc`, making the UTC intent explicit and machine-verifiable, and the deprecation warning disappears.

**Explanation:** The Python core developers deprecated `utcnow()` because it produces a "lie": the numbers represent UTC but the object claims to be naive (no timezone). Any code that later serializes, stores, or compares that object without knowing the convention will silently produce wrong results. `datetime.now(timezone.utc)` returns the same point in time but with `tzinfo` set, so any subsequent comparison, conversion, or serialization is unambiguous. Because this fix also resolves Issue 1 (the TypeError), it is not an optional style change — it is required for correctness whenever aware datetimes are involved.
