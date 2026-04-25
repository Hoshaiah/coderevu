## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Unchecked Arithmetic Wraps in Release
// ------------------------------------------------------------------------

pub struct RequestCounter {
    pub count: u64,
}

impl RequestCounter {
    pub fn new() -> Self {
        RequestCounter { count: 0 }
    }

    pub fn increment(&mut self) {
        self.count += 1;
    }

    /// Returns the count as a u64 for the metrics API and resets the counter.
    // CHANGE 1 & 2: Return u64 instead of u32 so no truncating cast is needed; a counter that exceeds u32::MAX would silently wrap with `as u32` in release builds.
    pub fn flush(&mut self) -> u64 {
        // CHANGE 1: Removed the narrowing `as u32` cast; snapshot is now the full u64 value, preserving counts above 4,294,967,295.
        let snapshot = self.count;
        self.count = 0;
        snapshot
    }
}
```

## Explanation

### Issue 1: Silent truncation via `as u32` cast

**Problem:** When `self.count` exceeds `4,294,967,295` (the max value of `u32`), the expression `self.count as u32` discards the high bits and returns a small or zero value. In release builds Rust never panics on this; the truncated number is quietly stored and sent to the dashboard, making metrics appear to reset randomly at high traffic.

**Fix:** Remove the `as u32` cast on the `snapshot` line and assign `self.count` directly to `snapshot`, which is now typed as `u64`.

**Explanation:** The Rust `as` cast for integer narrowing is defined to truncate — it takes only the low-order bits that fit in the target type. So a count of `4,294,967,296` (one more than `u32::MAX`) becomes `0` after `as u32`, and `4,294,967,300` becomes `4`. Debug builds do not catch this because overflow-checking only applies to arithmetic operators (`+`, `-`, etc.), not to explicit `as` casts. In a high-traffic service that accumulates millions of requests per flush interval, crossing `u32::MAX` is a realistic event. Removing the narrowing cast and keeping everything as `u64` eliminates the truncation entirely.

---

### Issue 2: Return type `u32` is too narrow for the counter's range

**Problem:** The method signature `pub fn flush(&mut self) -> u32` makes a promise to callers that the flushed count fits in 32 bits. Any caller that relies on this type for further arithmetic or storage will also silently lose data even if the cast inside `flush` is fixed but the return type stays `u32`.

**Fix:** Change the return type of `flush` from `u32` to `u64`, matching the type of the `count` field and removing the need for any narrowing conversion.

**Explanation:** The `count` field is `u64`, so the counter can accumulate values up to `18,446,744,073,709,551,615`. Returning `u32` from `flush` means the API contract and the internal capacity are mismatched. Any caller that stores or processes the `u32` return value is working with a potentially truncated number. Changing the return type to `u64` makes the API honest: callers see the full accumulated count, and the compiler will flag any downstream code that still tries to store it in a narrower type, giving engineers the opportunity to decide explicitly how to handle large values rather than silently losing data.
