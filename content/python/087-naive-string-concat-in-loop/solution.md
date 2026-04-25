## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Quadratic String Concat in Loop
# ------------------------------------------------------------------------

import json
from typing import Any

def to_jsonlines(records: list[dict[str, Any]]) -> str:
    """
    Serialise a list of dicts to newline-delimited JSON (NDJSON).
    """
    # CHANGE 1: Collect serialised lines into a list instead of concatenating strings in a loop; avoids O(n^2) copying.
    lines = []
    for record in records:
        lines.append(json.dumps(record))
    # CHANGE 1: Join once at the end — a single allocation of the full result string, O(n) total work.
    return "\n".join(lines) + "\n" if lines else ""
```

## Explanation

### Issue 1: Quadratic String Concatenation in Loop

**Problem:** For large batches, the function gets dramatically slower as row count grows. A 200,000-row batch takes over 40 seconds because each `output += json.dumps(record) + "\n"` must allocate a brand-new string that is the full accumulated output so far, copy every byte of it, then append the new line. Runtime and memory usage both grow as O(n²) in the number of records.

**Fix:** Replace the `output = ""` / `output +=` pattern with a `lines = []` list that collects each serialised line via `lines.append(json.dumps(record))`, then produce the final string with a single `"\n".join(lines) + "\n"` call after the loop.

**Explanation:** In CPython, `str` objects are immutable. Every `+=` on a string creates a new `str` object in memory, copies all existing content into it, and then appends the new chunk. For a batch of n rows whose average serialised size is s bytes, the total bytes copied across the loop is roughly s×(1 + 2 + … + n) = s×n×(n+1)/2 — classic O(n²) growth. With 200,000 rows this means tens of billions of bytes copied in total. Using a list avoids all intermediate copies; `list.append` is amortised O(1), and `str.join` makes exactly one pass over all the data to build the output string. CPython does have a small optimisation that sometimes avoids the copy when a string has only one reference, but it is not reliable across Python versions and fails in practice once the string grows beyond a few kilobytes. Switching to `join` is the idiomatic, guaranteed-linear solution.
