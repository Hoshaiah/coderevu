## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Progress percentage silently wraps to wrong value on large inputs
// ------------------------------------------------------------------------
pub fn upload_progress_pct(uploaded: u32, total: u32) -> u32 {
    // CHANGE 2: guard against division by zero; return 0 when total is 0
    if total == 0 {
        return 0;
    }
    // CHANGE 1: cast to u64 before multiplying to prevent u32 overflow; the intermediate value can reach 100 * 2^32 - 1 which exceeds u32::MAX
    ((uploaded as u64 * 100) / total as u64) as u32
}
```

## Explanation

### Issue 1: Silent u32 overflow on multiplication

**Problem:** When `uploaded` is larger than about 42,949,672 (roughly 42.9 MB), multiplying it by 100 exceeds `u32::MAX` (4,294,967,295). In debug builds Rust panics, but in release builds the multiplication wraps around modulo 2³², silently producing a small, wrong number. Users see the progress bar jump backwards or reset to a low percentage mid-upload.

**Fix:** Both `uploaded` and `total` are cast to `u64` before the multiplication (`uploaded as u64 * 100`), and the final result is cast back to `u32` after the division. This keeps all intermediate arithmetic in 64-bit space where overflow cannot occur for any realistic file size.

**Explanation:** A `u32` holds a maximum value of about 4.29 billion. Multiplying a byte count by 100 means you overflow at just ~42.9 MB of uploaded data — a very common file size. Rust's release profile compiles integer arithmetic with wrapping semantics (no overflow checks), so the bad value is returned without any signal. Widening to `u64` before the multiply gives headroom up to ~184 petabytes, which covers all practical inputs. A related pitfall: using `uploaded / total * 100` instead avoids the overflow but introduces integer truncation (e.g., 50 MB of 200 MB would compute as 0 before multiplying), so the multiply-then-divide order must be preserved — just in wider types.

---

### Issue 2: Division by zero panic when total is 0

**Problem:** If a caller passes `total = 0`, the function performs integer division by zero and panics in both debug and release builds. This crashes the thread and, depending on the application, can take down the whole upload process.

**Fix:** An early `if total == 0 { return 0; }` check is added before the division. When the total size is unknown or not yet set, the function returns 0% rather than panicking.

**Explanation:** Integer division by zero is undefined behaviour in many languages and a hard panic in Rust. A file-upload scenario can legitimately encounter a zero total if the file size header hasn't arrived yet or if the caller has a bug. Returning 0 is a safe, predictable sentinel that lets the UI show an indeterminate state rather than crashing. An alternative design is to return `Option<u32>` and signal `None` for the zero case, but that changes the function signature; the inline guard is the minimal fix that matches the existing interface.
