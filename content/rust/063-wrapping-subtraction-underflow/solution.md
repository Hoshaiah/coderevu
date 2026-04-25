## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Unsigned Subtraction Silent Underflow
// ------------------------------------------------------------------------

pub struct CounterSample {
    pub timestamp_ms: u64,
    pub value: u64,
}

pub fn compute_delta(prev: &CounterSample, curr: &CounterSample) -> u64 {
    // CHANGE 1: use wrapping_sub instead of `-` so that a counter wrap-around (curr.value < prev.value) yields the correct forward delta via modular arithmetic rather than silently underflowing to a near-u64::MAX garbage value in release mode.
    curr.value.wrapping_sub(prev.value)
}
```

## Explanation

### Issue 1: Unsigned subtraction underflows on counter wrap

**Problem:** Roughly once every 18 months the hardware counter rolls over past `u64::MAX` back to a small number. At that moment `curr.value` is smaller than `prev.value`. The expression `curr.value - prev.value` is a `u64` subtraction, so it wraps silently in release mode to a value near `u64::MAX`. Operators see a one-sample spike of ~1.8 × 10¹⁹ in the Prometheus gauge, then it returns to normal the next tick.

**Fix:** Replace `curr.value - prev.value` with `curr.value.wrapping_sub(prev.value)` at the CHANGE 1 site. `wrapping_sub` performs modular (two's-complement) subtraction, which is the mathematically correct operation for a monotonically-increasing counter that may overflow its storage type.

**Explanation:** For a monotonic counter stored in a `u64`, an overflow wrap is not an error — it is expected behavior that happens to cross the type boundary. The forward distance from `prev` to `curr` in the ring of integers mod 2⁶⁴ is exactly `curr.value.wrapping_sub(prev.value)`. For example, if `prev.value = u64::MAX - 2` and `curr.value = 3`, the actual number of increments is 6, and `wrapping_sub` returns 6. The bare `-` operator in Rust performs the same bit operation in release mode, but with no semantic intent expressed and with a panic in debug mode, making it fragile and misleading. Using `wrapping_sub` documents the intent, behaves identically at the bit level for the normal (non-wrapping) case, and produces the correct result for the wrap case. A related pitfall: if the counter could also reset to zero for reasons other than overflow (e.g., a driver restart), `wrapping_sub` would still return a huge number; in that scenario you would need an additional bounds check, but the problem statement says the hardware guarantees no resets.

---

### Issue 2: Debug-mode panic masks the bug during testing

**Problem:** In debug builds, Rust's `-` operator on integers panics on overflow. Because the wrap event happens roughly once every 18 months, it is virtually never hit during local testing or CI, so the unsafe subtraction survives code review. In production release builds the panic is compiled out, and the silent underflow reaches users.

**Fix:** The same `wrapping_sub` call at CHANGE 1 resolves this issue too. `wrapping_sub` has identical, explicit, non-panicking semantics in both debug and release builds, so the behavior is consistent and correct in all build profiles.

**Explanation:** Rust intentionally makes integer overflow panic in debug mode as a safety net, but disables that check in release mode for performance. This means code that only overflows rarely can pass all tests (debug builds panic, but the event never occurs in the test window) and then silently misbehave in production. By using the explicit `wrapping_sub` method, you opt into defined wrapping behavior in every build profile, eliminating the debug/release inconsistency entirely. The broader lesson: any arithmetic on values that have defined overflow semantics (counters, checksums, hash mixing) should use the `wrapping_*` family of methods rather than bare operators, so the intent is clear and behavior is uniform.
