## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Redundant Allocation in Hot Loop
// ------------------------------------------------------------------------

use std::fmt::Write as _;

pub struct Row {
    pub id: u64,
    pub label: String,
    pub value: f64,
}

pub fn build_csv(rows: &[Row]) -> String {
    // CHANGE 2: pre-allocate a reasonable capacity to avoid repeated buffer reallocation as rows are pushed.
    let mut out = String::with_capacity(rows.len() * 32 + 16);
    out.push_str("id,label,value\n");

    for row in rows {
        // CHANGE 1: write! formats directly into `out` with no temporary String allocation, removing the per-iteration heap alloc.
        write!(out, "{},{},{}\n", row.id, row.label, row.value).unwrap();
    }

    out
}
```

## Explanation

### Issue 1: Per-iteration `format!` temporary allocation

**Problem:** Every loop iteration calls `format!`, which allocates a fresh `String` on the heap, writes the formatted row into it, then immediately copies it into `out` via `push_str` and drops the temporary. On a 100k-row dataset this produces 100,000 short-lived heap allocations, each requiring a `malloc`/`free` round-trip, which is what the profiler is measuring.

**Fix:** Replace the `let line = format!(...)` + `push_str(&line)` pair with a single `write!(out, ...)` call (from `std::fmt::Write`). `write!` formats the data directly into the existing `out` buffer with no intermediate allocation.

**Explanation:** `format!` always produces a new owned `String`; it has no way to target an existing buffer. `std::fmt::Write::write_fmt`, which the `write!` macro dispatches to, is implemented for `String` to append directly to the existing backing storage. This means the formatted bytes go straight into `out`'s heap buffer, bypassing the allocator entirely when the buffer has spare capacity. The `unwrap()` is safe here because `write!` on a `String` is infallible — the `fmt::Error` type for `String` is never actually produced. A related pitfall: `writeln!(out, ...)` can replace `write!(out, "...\n", ...)` for slightly cleaner code if you prefer.

---

### Issue 2: Output buffer grows via repeated reallocation

**Problem:** `String::new()` starts with zero capacity. As rows are appended, the buffer doubles whenever it runs out of space, meaning for 100k rows it reallocates roughly 17 times, each time copying all previously written data to a new allocation. On large datasets this adds measurable latency and memory churn on top of the per-row allocation problem.

**Fix:** Replace `String::new()` with `String::with_capacity(rows.len() * 32 + 16)`. The multiplier `32` is a conservative estimate of bytes per row; the `+ 16` covers the header line.

**Explanation:** Rust's `String` (backed by `Vec<u8>`) uses an amortized doubling strategy, which is efficient in the average case but still performs O(log n) reallocations and O(n) total copy work. When the final size is predictable — here it is, since `rows.len()` is known before the loop — pre-allocating eliminates all those intermediate copies. The estimate does not need to be exact: over-allocating wastes a small amount of memory that is reclaimed when the caller drops the `String`, and under-allocating just means one extra reallocation instead of many. A more precise estimate can be computed by summing `row.label.len()` across all rows, but the constant-factor approximation is good enough in practice and avoids an extra pass over the data.
