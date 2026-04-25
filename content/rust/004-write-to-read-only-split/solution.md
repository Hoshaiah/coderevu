## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Mutable Alias After Slice Split
// ------------------------------------------------------------------------

pub fn normalize_halves(samples: &mut [f32]) {
    let mid = samples.len() / 2;

    // split_at_mut yields two non-overlapping mutable sub-slices
    let (left, right) = samples.split_at_mut(mid);

    // CHANGE 1: use `left` (the already-split sub-slice) instead of going back to `samples[..mid]`, which would re-borrow `samples` immutably while `left` and `right` hold live mutable borrows of it.
    let max_val = left
        .iter()
        .cloned()
        .fold(f32::NEG_INFINITY, f32::max);

    if max_val > 0.0 {
        for s in right.iter_mut() {
            *s /= max_val;
        }
    }

    // CHANGE 2: drop the `let _ = left` suppression — `left` is now genuinely used above for the fold, so no unused-variable warning exists to silence.
}
```

## Explanation

### Issue 1: Re-borrow of original slice after split

**Problem:** The code calls `samples.split_at_mut(mid)` and correctly receives `left` and `right`, but then immediately turns around and reads from `samples[..mid]` to compute `max_val`. Because `left` and `right` already hold live mutable borrows into `samples`, taking even an immutable borrow of `samples` at the same time is rejected by the borrow checker, and the code fails to compile.

**Fix:** Replace `samples[..mid].iter()` with `left.iter()`. `left` already covers exactly the same memory (`samples[0..mid]`) and its borrow is already accounted for — no new borrow of `samples` is needed.

**Explanation:** Rust's borrow checker tracks borrows at the level of the original variable. When `split_at_mut` is called, it takes a mutable borrow of `samples` and hands back two sub-slice references (`left` and `right`) that together represent the whole buffer. While those sub-slices exist, `samples` itself is considered mutably borrowed and cannot be borrowed again in any form. Using `samples[..mid]` requests an immutable re-borrow of `samples`, which violates that rule even though the actual memory ranges don't overlap. The fix works because `left` already represents exactly `samples[0..mid]`; reading through it doesn't introduce any new borrow of `samples`.

---

### Issue 2: Unused `left` suppression comment is now misleading

**Problem:** The original code has `let _ = left;` at the bottom to suppress an "unused variable" warning. After the fix in Issue 1 uses `left` for the fold, this line is both unnecessary and confusing — it implies `left` goes unused when it does not.

**Fix:** Remove the `let _ = left;` line entirely. Because `left` is now passed to `.iter()` earlier in the function, the compiler sees it as used and emits no warning.

**Explanation:** `let _ = left;` is a Rust idiom for intentionally discarding a value to silence an unused-variable lint. It was placed here because the original code never actually read from `left`. Once `left.iter()` is called to compute `max_val`, the binding is demonstrably used, making the suppression line dead. Leaving dead suppression lines in code is a maintenance hazard: future readers may think `left` is still unused and miss that it now carries meaningful data.
