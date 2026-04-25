## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Panic Hidden Inside Iterator Map
// ------------------------------------------------------------------------

pub fn parse_sensor_readings(rows: &[Vec<String>], col_index: usize) -> Vec<f64> {
    rows.iter()
        // CHANGE 1: Use filter_map instead of map so that rows returning None are silently skipped rather than collected.
        .filter_map(|row| {
            // CHANGE 1: Use `?` (via and_then chain) to return None when the column is missing instead of unwrap-panicking.
            let cell = row.get(col_index)?;
            // CHANGE 2: Use `ok()` to convert the parse Result to Option, returning None on any parse failure instead of unwrap-panicking.
            cell.trim().parse::<f64>().ok()
        })
        .collect()
}
```

## Explanation

### Issue 1: Missing column causes panic

**Problem:** When a CSV row has fewer fields than `col_index`, `row.get(col_index)` returns `None`. Calling `.unwrap()` on that `None` immediately panics with `called Option::unwrap() on a None value`, killing the worker thread and losing all progress on the current batch.

**Fix:** Replace `.map` with `.filter_map` and replace `.unwrap()` on `row.get(col_index)` with the `?` operator. When `get` returns `None`, the `?` inside `filter_map` causes that closure to return `None`, and `filter_map` drops the row from the output instead of panicking.

**Explanation:** `Vec::get` is the bounds-safe alternative to indexing; it returns `Option<&T>` rather than panicking on out-of-bounds access. Inside a `filter_map` closure, returning `None` means "skip this element", so pairing `get` with `?` achieves the desired skip-on-missing-column behavior in one token. If you used plain `.map` with `?`, the code would not compile because the closure's return type would be `Option<f64>` but `map` would collect `Option<f64>` values, not `f64` values — that is why switching to `filter_map` is the correct pairing. A related pitfall: using `unwrap_or_default()` would silently inject a `0.0` into aggregation results, which is worse than skipping because it corrupts the data.

---

### Issue 2: Non-numeric cell content causes panic

**Problem:** Rows where the sensor column is blank or contains a string like `"N/A"` cause `cell.trim().parse::<f64>()` to return `Err(...)`. Calling `.unwrap()` on that error panics, crashing the worker. Operators confirmed these malformed rows appear regularly in production files.

**Fix:** Replace `.unwrap()` on the `parse` result with `.ok()`. `Result::ok()` converts `Ok(v)` to `Some(v)` and `Err(_)` to `None`. Combined with `filter_map`, any row whose cell fails to parse is silently dropped from the output `Vec<f64>`.

**Explanation:** `str::parse` returns a `Result`, and the idiomatic way to treat a parse failure as "skip this item" rather than "abort" is to convert it to `Option` with `.ok()`. The `Err` variant (and its error message) is discarded, which is acceptable here because the team explicitly decided malformed rows should be skipped without logging. If you later need to count or log bad rows, you could use `inspect_err` before calling `.ok()` without changing the control flow. Using `unwrap_or` with a sentinel value like `f64::NAN` would be wrong because NaN propagates silently through arithmetic and would corrupt downstream aggregation results.
