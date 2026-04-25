## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Silent Mismatch in Column Mapping
# ------------------------------------------------------------------------

from typing import Any

def rows_to_dicts(
    headers: list[str],
    rows: list[list[Any]],
) -> list[dict[str, Any]]:
    # CHANGE 1: Validate that every row has the same length as headers before zipping; zip silently truncates to the shorter sequence, which maps values to wrong keys with no error.
    if len(set(headers)) != len(headers):  # CHANGE 2: Reject duplicate header names up front so no value silently overwrites another in the resulting dict.
        raise ValueError(
            f"headers contains duplicate column names: "
            f"{[h for h in headers if headers.count(h) > 1]}"
        )
    result = []
    for i, row in enumerate(rows):
        if len(row) != len(headers):  # CHANGE 1: Raise instead of silently truncating; mismatched lengths mean the schema and data are out of sync and must not be papered over.
            raise ValueError(
                f"Row {i} has {len(row)} columns but headers has {len(headers)} columns"
            )
        record = dict(zip(headers, row))
        result.append(record)
    return result
```

## Explanation

### Issue 1: Silent Truncation on Length Mismatch

**Problem:** When the schema registry returns a header list that is shorter or longer than the actual row data, `zip(headers, row)` stops at whichever sequence is shorter and discards the rest — no exception, no warning. The analytics team sees `user_id` and `region` values paired with the wrong column names because the mapping has shifted, but only for rows whose length differs from the header count.

**Fix:** Before calling `zip`, compare `len(row)` to `len(headers)` and raise a `ValueError` that names the offending row index and both lengths. This check is added inside the `for` loop so every row is validated, not just the first one.

**Explanation:** `zip` is designed to stop at the shortest iterable — that is useful in many contexts but fatal here because a mismatch means the data and schema have diverged. If `headers` has 5 entries and a row has 6 values, the 6th value is dropped. If `headers` has 6 entries and a row has 5 values, the 6th header gets no value in the dict, and all five values are paired with the first five headers — which may themselves be wrong if the schema shifted at a different position. Raising immediately surfaces the root cause (schema registry out of sync) rather than letting corrupted records flow into aggregations where the error is nearly impossible to trace back.

---

### Issue 2: Duplicate Headers Silently Overwrite Values

**Problem:** If the schema registry returns a header list that contains the same column name twice (e.g., `["user_id", "region", "region"]`), `dict(zip(headers, row))` assigns the third value to `"region"`, overwriting the second value. The first occurrence's data is permanently lost with no indication that anything went wrong.

**Fix:** Before processing any rows, compute `len(set(headers))` and compare it to `len(headers)`. If they differ, raise a `ValueError` listing the repeated names. This check runs once at the top of the function, before the row loop.

**Explanation:** Python's `dict` constructor, when given duplicate keys, keeps the last value for each key. So `dict([("a", 1), ("a", 2)])` yields `{"a": 2}` — no error, no warning. In a column-mapping scenario this means the column that appears first in the header list is silently shadowed by the one that appears later at the same name. Detecting duplicates in `headers` before touching any rows is cheaper and clearer than trying to detect the data loss after the fact. A related pitfall: header names that differ only in case (e.g., `"Region"` vs `"region"`) are not caught by this check and may need a case-normalisation step if the schema registry is inconsistent about casing.
