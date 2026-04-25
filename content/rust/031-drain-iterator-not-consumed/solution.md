## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Drain Iterator Dropped Unconsumed
// ------------------------------------------------------------------------

pub struct Job {
    pub id: u64,
    pub payload: String,
}

pub fn process_batch(queue: &mut Vec<Job>, max: usize) -> usize {
    let mut processed = 0;

    // CHANGE 1: Iterate the drain iterator directly instead of binding it to `_drain` and dropping it; this both removes the jobs from the vec AND processes them, rather than silently dropping them all unprocessed.
    // CHANGE 2: Remove the stale `queue.iter()` loop that iterated the wrong elements (the remainder left in the vec after draining); all processing now happens inside the single drain loop.
    for job in queue.drain(0..max.min(queue.len())) {
        println!("processing job {}: {}", job.id, job.payload);
        processed += 1;
    }

    processed
}
```

## Explanation

### Issue 1: Drain Iterator Dropped Without Consuming

**Problem:** Every job in the batch range disappears from the queue immediately, but none of the processing logic runs. Operators see the queue length drop to zero and memory spike (the drained `Job` values are heap-allocated and then freed), while the job-completion counter stays flat.

**Fix:** Replace `let _drain = queue.drain(...);` followed by a separate loop with a single `for job in queue.drain(...)` loop. The drain iterator is now consumed by the `for` loop, so each element passes through the processing code before being dropped.

**Explanation:** `Vec::drain` is lazy in the sense that it returns an iterator; the removal from the vec is finalized when the `Drain` struct is dropped, regardless of how many items were actually yielded. Binding the result to `_drain` and never calling `.next()` on it means the destructor runs at the end of the `let` statement's scope, removing all elements from the vec without yielding a single one to any consumer. Iterating the `Drain` directly with `for` drives the iterator to completion, yielding each element one at a time so the loop body can act on it. A related pitfall: calling `drain` and then `drop`-ping the result early (e.g., via `mem::drop`) has the same effect — elements are removed and discarded.

---

### Issue 2: Post-Drain `queue.iter()` Iterates Wrong Elements

**Problem:** The second loop — `for job in queue.iter()` — runs over whatever is left in the vec after the drain, which is the tail of jobs that were not supposed to be processed in this batch. Those jobs get processed twice (once here, once in a future batch) or, if the drain already emptied the vec, the loop iterates nothing and `processed` stays zero.

**Fix:** Remove the `queue.iter()` loop entirely. All processing is now done inside the `for job in queue.drain(...)` loop introduced in CHANGE 1, so there is no need for a second pass.

**Explanation:** `Vec::drain(0..max)` removes elements at indices 0 through `max-1` and shifts the remaining elements to the front. After the drain completes, `queue` holds only the jobs that were intentionally left behind. Iterating `queue` at that point walks over jobs that belong to future batches, not the current one. Consolidating both the removal and the processing into one iterator loop eliminates this class of bug entirely — there is one code path, one place where `processed` is incremented, and the queue state after the function returns is exactly the unconsumed tail.
