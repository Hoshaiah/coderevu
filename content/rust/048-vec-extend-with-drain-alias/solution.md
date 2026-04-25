## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Drain Alias on Same Vec
// ------------------------------------------------------------------------

pub struct PipelineBuffer {
    /// Items not yet ready are kept at the front; ready items are at the back.
    buf: Vec<u64>,
    ready_threshold: u64,
}

impl PipelineBuffer {
    pub fn new(threshold: u64) -> Self {
        PipelineBuffer { buf: Vec::new(), ready_threshold: threshold }
    }

    pub fn push(&mut self, item: u64) {
        self.buf.push(item);
    }

    /// Move all items >= threshold into `out`, keep the rest in `self.buf`.
    pub fn flush_ready(&mut self, out: &mut Vec<u64>) {
        // CHANGE 1: Drain everything into a single temporary, then partition into ready vs not-ready. The original code drained self.buf twice: the first drain consumed all items, leaving self.buf empty, so the second drain always produced an empty iterator and not_ready was always empty.
        let (ready, not_ready): (Vec<u64>, Vec<u64>) = self.buf
            .drain(..)
            .partition(|&x| x >= self.ready_threshold);
        // CHANGE 2: Restore the not-ready items back into self.buf after the single drain, which was impossible in the original because the second drain on an already-empty buf silently dropped them.
        self.buf.extend(not_ready);
        out.extend(ready);
    }
}
```

## Explanation

### Issue 1: First `drain` empties buffer before second `drain`

**Problem:** After the first `drain(..)` call collects `ready`, `self.buf` is completely empty. The second `drain(..)` therefore iterates over nothing, `not_ready` is always an empty `Vec`, and every item below the threshold is silently dropped from the pipeline.

**Fix:** Replace both `drain`/`filter`/`collect` calls with a single `drain(..).partition(...)` at the `CHANGE 1` site. `partition` splits the drained iterator into two `Vec`s in one pass, so both halves are populated correctly.

**Explanation:** `Vec::drain` removes elements from the vec as it yields them. By the time the first `drain` iterator is fully consumed (at `.collect()`), `self.buf` has zero elements left. The second `drain` on an empty vec produces an empty iterator immediately, so `not_ready` collects nothing. The fix drains once and uses `partition` to split items into two destinations in the same iteration. A related pitfall: even trying `self.buf.extend(self.buf.drain(...))` hits the same borrow-checker error because `drain` holds a mutable borrow of `self.buf` while `extend` also needs one — so the two-pass approach was never going to compile regardless of ordering.

---

### Issue 2: Not-ready items never restored to buffer

**Problem:** Even if the second `drain` produced items (which it cannot, per Issue 1), `self.buf.extend(not_ready)` comes after `out.extend(ready)`, which is fine in isolation, but the overall structure made the restoration path dead code because `not_ready` was always empty.

**Fix:** At the `CHANGE 2` site, `self.buf.extend(not_ready)` is kept but now runs after a correct `partition`, so it actually restores the items that failed the threshold test. The call order is: partition → restore not-ready into `self.buf` → push ready into `out`.

**Explanation:** The restoration line `self.buf.extend(not_ready)` is structurally correct — extend onto `self.buf` after draining it is fine because the drain iterator is no longer alive. The problem was purely that `not_ready` was always empty. With `partition` feeding both halves in one drain pass, `not_ready` now holds every item where `x < ready_threshold`, and `self.buf.extend(not_ready)` correctly rebuilds the staging buffer with those items.
