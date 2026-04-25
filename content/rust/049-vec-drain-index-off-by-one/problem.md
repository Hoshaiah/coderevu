---
slug: vec-drain-index-off-by-one
track: rust
orderIndex: 49
title: Drain Range Removes Wrong Elements
difficulty: easy
tags:
  - errors
  - correctness
  - collections
language: rust
---

## Context

This function is in `src/queue/batch.rs`, part of a background job processor. `drain_batch` is called periodically to remove the oldest `n` items from the front of a `Vec`-based queue and return them for processing. The queue is protected by a `Mutex` elsewhere; this function operates on the raw `Vec`.

In production, batches consistently contain one fewer item than expected. For example, when `n=10` and the queue has 20 items, the processor receives 9 items and 11 remain. After processing the queue drains much more slowly than designed, causing a backlog that eventually causes OOM.

The bug was assumed to be in the Mutex locking logic, but a unit test that bypasses the lock reproduces the issue with a plain `Vec`. The drain range is the culprit.

## Buggy code

```rust
pub fn drain_batch(queue: &mut Vec<String>, n: usize) -> Vec<String> {
    let take = n.min(queue.len());
    // BUG: the range end is exclusive, so 1..take drains items at
    // indices 1 through take-1, skipping index 0 and taking take-1 items.
    queue.drain(1..take).collect()
}
```
