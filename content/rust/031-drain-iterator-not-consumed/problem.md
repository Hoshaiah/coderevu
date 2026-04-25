---
slug: drain-iterator-not-consumed
track: rust
orderIndex: 31
title: Drain Iterator Dropped Unconsumed
difficulty: medium
tags:
  - ownership
  - iterators
  - api-misuse
language: rust
---

## Context

This function lives in `src/queue/processor.rs`. A background worker drains a bounded queue of pending jobs, processes each one, and is supposed to leave only the unprocessed remainder in the queue. The bounded queue is a plain `Vec<Job>` protected by a `Mutex`; a separate thread refills it periodically.

Operators observe that jobs are disappearing from the queue without being processed. Metrics show the queue length drops to zero periodically but the job-completion counter does not increase. Memory usage also spikes unexpectedly during each drain cycle.

The bug was introduced when a developer refactored the original `while let Some(job) = queue.pop()` loop into an iterator-based drain for readability. The logic looks correct on inspection because `Vec::drain` is called with the right range.

## Buggy code

```rust
pub struct Job {
    pub id: u64,
    pub payload: String,
}

pub fn process_batch(queue: &mut Vec<Job>, max: usize) -> usize {
    let mut processed = 0;

    // Bug: drain returns an iterator; dropping it without consuming
    // it still removes all elements from the vec but runs none of
    // the processing logic — jobs are lost.
    let _drain = queue.drain(0..max.min(queue.len()));

    for job in queue.iter() {
        println!("processing job {}: {}", job.id, job.payload);
        processed += 1;
    }

    processed
}
```
