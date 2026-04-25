## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Integer division truncates percentage calculation to zero for small counts
# ------------------------------------------------------------------------
def compute_experiment_summary(
    variant_name: str,
    impressions: int,
    conversions: int,
) -> dict:
    if impressions == 0:
        # CHANGE 2: return 0.0 (float) to match the type returned by the else branch
        conversion_rate = 0.0
    else:
        # CHANGE 1: removed `// 1` floor-division so fractional percentages are preserved
        conversion_rate = conversions / impressions * 100

    return {
        "variant": variant_name,
        "impressions": impressions,
        "conversions": conversions,
        "conversion_rate_pct": conversion_rate,
    }


# Example: 5 conversions out of 200 impressions -> should be 2.5%, now returns 2.5
result = compute_experiment_summary("control", 200, 5)
```

## Explanation

### Issue 1: Floor Division Truncates Sub-1% Rates

**Problem:** Any experiment where `conversions / impressions * 100` produces a value less than 1.0 — e.g., 5 out of 200 impressions yields 2.5 — gets floored to `0` by the `// 1` operator. The dashboard displays 0% even though real conversions occurred.

**Fix:** Remove `// 1` from the expression `conversions / impressions * 100 // 1`, leaving it as `conversions / impressions * 100`. This is the `CHANGE 1` site.

**Explanation:** In Python 3, `/` always performs true (float) division, so `5 / 200 * 100` evaluates to `2.5`. Appending `// 1` applies floor division by 1, which strips the fractional part and returns `2.0` for 2.5, or `0.0` for anything below 1.0 — and since Python then returns an `int` from `float // int` when the result is a whole number internally, the value stored is `0`. Removing `// 1` lets the float pass through unchanged. If rounding to a fixed number of decimal places is needed in the future, `round(value, 2)` is the right tool; it does not silently zero out small values.

---

### Issue 2: Zero-Impression Branch Returns Inconsistent Type

**Problem:** When `impressions == 0`, `conversion_rate` is set to the integer `0`. The else branch always produces a `float`. Callers that do arithmetic or formatting with `conversion_rate_pct` may behave differently depending on which path executed, and type-checking tools will flag the inconsistency.

**Fix:** Replace `conversion_rate = 0` with `conversion_rate = 0.0` at the `CHANGE 2` site so both branches return the same `float` type.

**Explanation:** Python's dynamic typing means this won't raise an exception at runtime, but downstream code that expects a `float` — such as `f"{rate:.2f}%"` — will still work by accident because `format` coerces `int` to float presentation. However, code that does an `isinstance(rate, float)` check, or a type-annotated function expecting `float`, will fail or emit a warning. Keeping return types consistent across all branches of a function is a straightforward way to prevent subtle bugs when the function's output is passed into other systems.
