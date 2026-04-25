## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Drain Range Removes Wrong Elements
// ------------------------------------------------------------------------

pub fn drain_batch(queue: &mut Vec<String>, n: usize) -> Vec<String> {
    let take = n.min(queue.len());
    // CHANGE 1: range must start at 0, not 1, so all `take` items from the front are drained; starting at 1 skipped index 0 and returned only take-1 items.
    queue.drain(0..take).collect()
}
```

## Explanation

### Issue 1: Drain range off-by-one at start

**Problem:** Every call to `drain_batch` returns one fewer item than requested. When `n=10` and the queue has 20 elements, the caller receives 9 items and 11 remain instead of 10. Over time the queue drains slower than items arrive, building a backlog that eventually exhausts memory.

**Fix:** Replace the range `1..take` with `0..take` at the `queue.drain(...)` call. The only token that changes is the range start: `1` becomes `0`.

**Explanation:** `Vec::drain` takes an exclusive range, meaning `drain(1..take)` covers indices 1, 2, … take-1 — that is `take-1` elements, and index 0 (the oldest item) is never touched. Changing the start to `0` gives `drain(0..take)`, which covers indices 0, 1, … take-1 — exactly `take` elements, all from the front. The value of `take` itself (clamped to `queue.len()`) is already correct as the exclusive upper bound because a range of length N starting at 0 ends at N. A related pitfall: if someone tried to fix this by writing `drain(0..take+1)` they would introduce an off-by-one in the other direction and could panic with an out-of-bounds index when `take == queue.len()`.

---
