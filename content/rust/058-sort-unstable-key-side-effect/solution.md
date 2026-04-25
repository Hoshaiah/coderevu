## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Mutable Closure Side Effect in Sort
// ------------------------------------------------------------------------

pub struct Record {
    pub id: u64,
    pub score: f64,
    pub flags: u32,
}

pub fn sort_records(records: &mut Vec<Record>) -> usize {
    // CHANGE 1: Count bonus records in a separate pass before sorting, so the counter is never inside the sort closure where it can be called an unpredictable number of times.
    let bonus_count: usize = records.iter().filter(|r| r.flags & 0x1 != 0).count();

    // CHANGE 2: Use a pure key closure with no side effects; sort_by_key may invoke the key function more than once per element, so any mutation inside it produces incorrect counts.
    records.sort_by_key(|r| {
        let base = (r.score * 100.0) as i64;
        if r.flags & 0x1 != 0 {
            base + 50
        } else {
            base
        }
    });

    bonus_count
}
```

## Explanation

### Issue 1: Side-effecting closure inside sort_by_key

**Problem:** `sort_by_key` is documented to call the key function an unspecified number of times per element — it can call it more than once during the comparison phase of the sort algorithm. When `bonus_count += 1` lives inside that closure, the counter gets incremented once per *key evaluation*, not once per *record*, so the final value is wrong (usually too high, but can vary by input size and sort implementation).

**Fix:** Move the bonus counting into a separate `iter().filter(...).count()` call before the sort (CHANGE 1), and strip all mutation out of the sort closure (CHANGE 2), leaving it as a pure function of each record.

**Explanation:** Rust's standard `sort_by_key` is implemented on top of `sort_unstable_by`, which uses a pattern-defeating quicksort. That algorithm re-evaluates keys during partitioning and pivot selection, so a record with the bonus flag set might have its key function called two, three, or more times in a single sort run. Each call increments `bonus_count`, inflating it beyond the actual number of qualifying records. The fix separates concerns: one linear pass counts the bonuses accurately, then the sort runs with a side-effect-free key. A related pitfall: if you try to sort by a key that has external I/O or caching inside the closure, the same over-invocation problem applies — always treat sort key closures as pure functions.

---

### Issue 2: Mutable capture discarded after sort_by_key consumes the closure

**Problem:** `sort_by_key` takes the closure by value. The closure captures `bonus_count` by mutable reference (`&mut usize`). After `sort_by_key` returns and the closure is dropped, the local `bonus_count` variable in the outer function is whatever value it had *before* the sort, because the borrow checker forces the closure to release the mutable borrow only after it is dropped — but in practice the compiler may also arrange a copy, meaning the outer `bonus_count` stays 0 the entire time. The test always sees 0.

**Fix:** By counting bonuses in a plain iterator chain assigned directly to `bonus_count` before the sort (CHANGE 1), the value is computed once and owned outright by the outer function, with no closure borrowing involved.

**Explanation:** When a closure captures a local variable by `&mut` reference, Rust guarantees the borrow is exclusive for the lifetime of the closure. Because `sort_by_key` takes ownership of the closure (it is `FnMut`, passed by value), the mutable borrow lives for the entire duration of the sort. Writes the closure makes go to the original local through the reference, which sounds correct — but the interaction with how the sort invokes the closure multiple times (Issue 1) means the count is wrong anyway. Even if the borrow mechanics were perfectly transparent, relying on a sort closure to accumulate state is fragile: the caller has no contract guaranteeing single invocations. Splitting the counting pass from the sorting pass eliminates both the borrow complexity and the invocation-count dependency in one change.
