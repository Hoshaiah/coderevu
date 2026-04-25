## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Silent data loss when chaining iterators that yield `Option` without flattening
// ------------------------------------------------------------------------
pub fn parse_scores(raw: &[&str]) -> Vec<f64> {
    raw.iter()
        // CHANGE 1: Replace .map(...).map(|opt| opt.unwrap_or(0.0)) with .filter_map(...). filter_map keeps only the Some(_) values and drops None, so bad entries are skipped entirely instead of being replaced with 0.0.
        // CHANGE 2: Collapse the two-map chain into one filter_map call.
        .filter_map(|s| s.trim().parse::<f64>().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_bad_entries() {
        // Expects [1.5, 3.0], not [1.5, 0.0, 3.0]
        let result = parse_scores(&["1.5", "bad", "3.0"]);
        assert_eq!(result.len(), 2);
    }
}
```

## Explanation

### Issue 1: `unwrap_or` substitutes instead of skipping

**Problem:** Every entry that fails to parse becomes `0.0` in the output. The caller asked for malformed entries to be dropped, but instead they appear as `0.0`. A test checking `result.len() == 2` for input `["1.5", "bad", "3.0"]` will fail because the result has length 3.

**Fix:** Remove the second `.map(|opt| opt.unwrap_or(0.0))` call entirely and replace `.map(|s| s.trim().parse::<f64>().ok())` with `.filter_map(|s| s.trim().parse::<f64>().ok())`. `filter_map` discards `None` values and unwraps `Some` values automatically.

**Explanation:** `.parse::<f64>().ok()` turns a `Result` into an `Option`, giving `Some(f64)` on success and `None` on failure. The original code then calls `.unwrap_or(0.0)` on every `Option`, which converts `None` into `0.0` rather than removing the element. The iterator still yields one item per input element — it just replaces bad parses with a default value. `filter_map` is the standard iterator adapter for "transform and maybe discard": it applies a closure that returns `Option<T>`, keeps only the `Some` variants, and unwraps them. A related pitfall is using `.flatten()` after `.map(...)`: that also works, but `filter_map` is the idiomatic single-step solution.

---

### Issue 2: Two-map chain obscures filtering intent

**Problem:** The two chained `.map()` calls make it look like the code is doing two pure transformations, hiding the fact that one of them is supposed to act as a filter. A reader scanning the code sees no filtering happening and cannot easily spot that the `unwrap_or` is the wrong behavior.

**Fix:** Collapse `.map(|s| s.trim().parse::<f64>().ok()).map(|opt| opt.unwrap_or(0.0))` into a single `.filter_map(|s| s.trim().parse::<f64>().ok())` call at the same position in the chain.

**Explanation:** `filter_map` combines a map and a filter into one adapter. Passing a closure that returns `Option<T>` makes the intent explicit: returning `None` means "drop this element", returning `Some(v)` means "keep `v`". The previous two-map approach required a reader to mentally track the `Option` type across two closures to understand what happened to bad values. By using `filter_map`, the type flowing out of the adapter is `f64`, not `Option<f64>`, so there is no `Option` left to accidentally mishandle with `unwrap_or` or similar methods.
