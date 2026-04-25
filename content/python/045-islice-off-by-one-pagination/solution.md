## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Off-by-One in islice Pagination
# ------------------------------------------------------------------------

from itertools import islice
from typing import TypeVar

T = TypeVar("T")

def paginate(items: list[T], page: int, page_size: int) -> list[T]:
    """Return a single page from `items`. `page` is 1-based."""
    start = (page - 1) * page_size
    end = start + page_size
    # CHANGE 1: Use `start` directly (not `start - 1`); `start` is already 0-based after multiplying (page-1)*page_size, so no further adjustment is needed.
    # CHANGE 2: Use `end` directly (not `end - 1`); `end` is the correct exclusive stop index for islice, subtracting 1 was dropping the last item of every page.
    return list(islice(items, start, end))
```

## Explanation

### Issue 1: Incorrect start index shifts page window left

**Problem:** Every page begins one position too early in the list. With 10 items and `page_size=3`, page 2 should start at index 3 (item 4) but actually starts at index 2 (item 3), so the last item of page 1 re-appears as the first item of page 2.

**Fix:** Remove the `- 1` from the `islice` start argument, changing `start - 1` to `start` at the `CHANGE 1` site.

**Explanation:** `start = (page - 1) * page_size` already produces a zero-based index. For page 1 that gives `start = 0`, which is exactly where `islice` should begin. Subtracting another 1 makes it `-1`, and Python's `islice` treats negative values as `0`, so page 1 appears correct and masks the bug. For page 2, `start` is `3` but `start - 1` is `2`, so `islice` starts at item 3 (0-based), which is item 4 in 1-based terms — one position too early. Every page beyond page 1 therefore duplicates the final item of the preceding page.

---

### Issue 2: Incorrect stop index truncates every page by one item

**Problem:** Every page is missing its last item. With `page_size=3`, page 1 returns only 2 items instead of 3 because the stop index passed to `islice` is one less than it should be.

**Fix:** Remove the `- 1` from the `islice` stop argument, changing `end - 1` to `end` at the `CHANGE 2` site.

**Explanation:** `islice(seq, start, stop)` returns elements from index `start` up to but not including index `stop`, so `end = start + page_size` is already the correct exclusive stop. Subtracting 1 makes the stop `start + page_size - 1`, which cuts the window to `page_size - 1` items. Combined with Issue 1 (start shifted left by 1), the two bugs partially cancel for page 1 — the window still covers 2 items starting at the right place for page 1 when the list is long enough — but they compound differently for later pages. Fixing both independently restores the correct `page_size`-wide, non-overlapping window for every page.
