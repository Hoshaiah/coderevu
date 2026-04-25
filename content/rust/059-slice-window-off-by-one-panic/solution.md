## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — windows() Size Zero Panics
// ------------------------------------------------------------------------

pub fn moving_average(samples: &[f64], window: usize) -> Vec<f64> {
    // CHANGE 1: Also guard against window == 0; `slice::windows` panics with 'size is zero' when window is 0, even for non-empty slices.
    if samples.is_empty() || window == 0 {
        return Vec::new();
    }

    samples
        .windows(window)
        .map(|w| w.iter().sum::<f64>() / w.len() as f64)
        .collect()
}
```

## Explanation

### Issue 1: `windows(0)` panics on zero window size

**Problem:** The worker crashes with `thread 'worker-4' panicked at 'size is zero'` whenever `window` is `0`. The existing guard only checks `samples.is_empty()`, so a zero-valued `window` argument slips through and reaches `slice::windows`, which calls `assert!(size != 0)` unconditionally in the stdlib.

**Fix:** Add `|| window == 0` to the early-return condition on the same line as the `samples.is_empty()` check (the `// CHANGE 1` site), so the function returns an empty `Vec` instead of reaching `windows`.

**Explanation:** `std::slice::Windows::new` always panics when the requested window size is zero — it does not matter how many elements the slice contains. The original developer guarded only the empty-slice path, which is a separate condition. At startup the worker may call this function before a valid window size is configured, passing `0`. That call reaches `windows(0)`, which hits the assert and unwinds the worker thread. Returning an empty `Vec` for a zero window size is safe and consistent: a window of zero elements has no mathematical meaning for a moving average. A related pitfall: if `window` is larger than `samples.len()`, `windows` returns an empty iterator rather than panicking, so that case is already handled correctly by the existing code without an explicit guard.

---
