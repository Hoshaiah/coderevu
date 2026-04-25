## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — fold Initial Value Wrong Type Truncates
// ------------------------------------------------------------------------

/// Returns the total number of bytes across all provided file sizes.
pub fn total_bytes(sizes: &[u64]) -> u64 {
    // CHANGE 1: Use `0u64` instead of `0` so the fold accumulator is typed as u64, not i32, preventing silent truncation on large sums.
    sizes.iter().fold(0u64, |acc, &size| acc + size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_files() {
        let sizes = vec![100u64, 200u64, 300u64];
        assert_eq!(total_bytes(&sizes), 600);
    }

    // CHANGE 2: Add a test with values exceeding u32::MAX to catch accumulator type truncation bugs before they reach production.
    #[test]
    fn large_files_exceed_4gb() {
        let sizes = vec![3_000_000_000u64, 2_000_000_000u64];
        assert_eq!(total_bytes(&sizes), 5_000_000_000u64);
    }
}
```

## Explanation

### Issue 1: fold accumulator inferred as `i32`

**Problem:** The `fold` call passes `0` as the initial value with no type suffix. Rust's type inference resolves this literal to `i32` because nothing in the immediate expression forces it to `u64`. When the running sum of file sizes exceeds `i32::MAX` (~2.1 GB), the accumulator wraps or truncates, and the function returns a value that silently disagrees with reality. Users with more than ~4 GB of uploads see wrong — sometimes negative — storage totals on the dashboard.

**Fix:** Replace the bare `0` initial value with `0u64` at the `fold` call site. The reference solution changes `fold(0, ...)` to `fold(0u64, |acc, &size| acc + size)`, giving the accumulator the same type as the slice elements.

**Explanation:** Rust infers the type of an unadorned integer literal from context. Inside `fold`, the closure parameter `acc` takes its type from the initial value, not from `size`. Because `0` can fit in `i32`, the compiler happily picks `i32` for `acc`. Each iteration then adds a `u64` `size` to an `i32` accumulator; Rust coerces or truncates to make the types match at compile time, and the high bits of large sums are silently discarded. Suffixing the literal as `0u64` forces the accumulator type to `u64` from the start, so every addition happens in the correct domain with no truncation. A related pitfall: even if you annotate the return type as `u64`, that alone does not propagate back into the fold's initial-value inference in all cases, so the explicit suffix is the safest fix.

---

### Issue 2: Missing test for values above `u32::MAX`

**Problem:** The only test uses three small values totalling 600 bytes. This sum fits comfortably in `i32`, so the existing test passes even with the buggy accumulator type. The production bug with large files is completely invisible to the test suite.

**Fix:** Add the `large_files_exceed_4gb` test, which sums `3_000_000_000u64` and `2_000_000_000u64` and asserts the result is `5_000_000_000u64`. This value exceeds both `u32::MAX` and `i32::MAX`, so it would fail with the original buggy `0` initial value.

**Explanation:** A test that only exercises the happy path within `i32` range gives false confidence about correctness for the actual production workload. By choosing inputs whose sum exceeds `u32::MAX`, the test directly exercises the code path that was broken. If the accumulator were still `i32`, the sum would overflow and the assertion would catch the mismatch. This pattern — testing at and just above known type boundaries — is a practical way to surface type-sizing bugs before deployment.
