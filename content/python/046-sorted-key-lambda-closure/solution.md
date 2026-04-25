## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Closure Captures Loop Variable in Sort
# ------------------------------------------------------------------------

METRICS = ["revenue", "units_sold", "margin"]

def rank_categories(rows: list[dict], metric: str) -> list[str]:
    """
    rows: list of dicts like {"name": "Electronics", "revenue": 5000, ...}
    metric: one of METRICS
    """
    # CHANGE 2: validate metric before doing any work so invalid input fails fast.
    if metric not in METRICS:
        raise ValueError(f"Unknown metric: {metric}")

    sorters = []
    for m in METRICS:
        # CHANGE 1: use a default argument `m=m` to capture the current value of `m` at each iteration, breaking the late-binding closure bug.
        sorters.append(lambda row, m=m: row[m])

    key_fn = sorters[METRICS.index(metric)]
    return [row["name"] for row in sorted(rows, key=key_fn, reverse=True)]
```

## Explanation

### Issue 1: Closure Late-Binding Loop Variable

**Problem:** No matter which `metric` the caller passes, the results are always sorted as if `metric` were `'margin'` (the last entry in `METRICS`). Passing `'revenue'` or `'units_sold'` produces the wrong ordering every time.

**Fix:** Each `lambda` in the `for` loop gains a default argument `m=m`: `lambda row, m=m: row[m]`. This replaces the free-variable reference with a value captured at the moment the lambda is created.

**Explanation:** Python closures capture variables by reference, not by value. All three lambdas share the same binding for the name `m`. By the time the loop finishes, `m` holds `'margin'` — the last value assigned — so every lambda returns `row['margin']` when called. The default-argument trick works because default argument values are evaluated once at function-definition time (i.e., when `lambda row, m=m: ...` is executed inside the loop body), freezing the current value of `m` into the lambda's own local scope. After the fix each lambda independently closes over its own snapshot of `m`, so `sorters[0]` returns `row['revenue']`, `sorters[1]` returns `row['units_sold']`, and so on. An alternative fix is to replace the whole `sorters` list with `key_fn = lambda row: row[metric]` directly, since you only ever use one sorter — but the default-argument approach is the minimal change that matches the existing structure.

---

### Issue 2: Validation Placed After Unnecessary Work

**Problem:** The `if metric not in METRICS` guard sits after the loop that builds `sorters`, so every call — even one with a completely bogus metric name — pays the cost of constructing three lambda objects before the error is raised. This is harmless at this scale but is a logical ordering mistake.

**Fix:** Move the `if metric not in METRICS: raise ValueError(...)` block to the top of the function, before the `sorters` loop, as shown at the `CHANGE 2` site.

**Explanation:** Input validation should run before any side-effecting or allocating work so that bad input is rejected immediately. Here the allocation is trivial, but the principle matters: if the loop or any setup step were expensive (e.g., a database call), placing validation after it would waste resources on requests that are guaranteed to fail. Moving the guard up also makes the function's contract clearer to readers — the first thing they see is what values are accepted.
