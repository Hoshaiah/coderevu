## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — collect() Silently Wraps Wrong Error
// ------------------------------------------------------------------------

use std::num::ParseIntError;

pub fn parse_records(records: &[&str]) -> Result<Vec<i32>, ParseIntError> {
    // CHANGE 1: Replace filter_map+ok() with map() so parse errors are kept as Err variants instead of being discarded.
    // CHANGE 2: Let collect() drive the Result<Vec<i32>, ParseIntError> directly; remove the wrapping Ok().
    records
        .iter()
        .map(|s| s.parse::<i32>())
        .collect()
}
```

## Explanation

### Issue 1: `filter_map` silently discards parse errors

**Problem:** Any record that fails to parse as `i32` — for example `"abc"` — is quietly dropped from the output. The caller receives `Ok(vec![...])` containing only the successfully parsed values, with no indication that any input was malformed.

**Fix:** Replace `.filter_map(|s| s.parse::<i32>().ok())` with `.map(|s| s.parse::<i32>())`. This keeps each item as a `Result<i32, ParseIntError>` instead of converting errors to `None` and throwing them away.

**Explanation:** `filter_map` expects a closure that returns `Option<T>`. Calling `.ok()` on a `Result` converts `Err(_)` to `None`, which `filter_map` then silently skips. The developer used this pattern after `?` failed inside a closure (closures don't propagate `?` to the outer function's return type), but the correct answer is to keep the `Result` values intact and let `collect()` handle them. Once you switch to `.map()`, each element in the iterator is a `Result`, and `collect::<Result<Vec<i32>, _>>()` short-circuits on the first `Err` it encounters, returning that error to the caller.

---

### Issue 2: Manual `Ok(values)` wrap prevents `collect()` from propagating errors

**Problem:** By first collecting into `Vec<i32>` and then wrapping in `Ok`, the code forces every element to already be a plain `i32` before collection. This means errors must be eliminated before `collect()` runs — which is exactly what the `filter_map`/`.ok()` workaround was doing. The result is a function that structurally cannot return `Err`.

**Fix:** Remove the intermediate `let values: Vec<i32>` binding and the trailing `Ok(values)`. Instead, call `.collect()` directly and let type inference resolve it as `Result<Vec<i32>, ParseIntError>`, which is the function's declared return type.

**Explanation:** `collect()` has a blanket implementation for `Result<Collection, E>` when the iterator yields `Result<T, E>` items. As it pulls items from the iterator, the first `Err` causes the entire `collect()` call to return that `Err` immediately — subsequent items are not even evaluated (fail-fast). By collecting first into `Vec<i32>` the code bypassed this mechanism entirely: all items had to be `i32` before the collection step, so there was nowhere for a `ParseIntError` to live. Removing the intermediate binding and letting the return type guide `collect()` restores the intended behavior with no extra code.
