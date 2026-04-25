---
slug: write-to-read-only-split
track: rust
orderIndex: 4
title: Mutable Alias After Slice Split
difficulty: medium
tags:
  - borrowing
  - slices
  - safety
language: rust
---

## Context

This function is in `src/signal/normalize.rs`, a DSP utility that normalizes a mono audio buffer in-place. The algorithm reads from the first half of the buffer to compute a scaling factor and then applies it to the second half. A teammate suggested using `split_at_mut` to get two non-overlapping mutable slices so both halves can be accessed simultaneously.

The code fails to compile with an error about `samples` being borrowed as immutable while it is also borrowed as mutable. The engineer who wrote this is confused because they did use `split_at_mut` — they believe the split should have resolved the conflict.

The root cause is subtler than a simple double-borrow: the split is done correctly, but afterward the code accidentally goes back to borrowing the original slice for the read phase.

## Buggy code

```rust
pub fn normalize_halves(samples: &mut [f32]) {
    let mid = samples.len() / 2;

    // split_at_mut yields two non-overlapping mutable sub-slices
    let (left, right) = samples.split_at_mut(mid);

    // Bug: after the split, `left` and `right` borrow `samples`
    // mutably. Accessing `samples[i]` here re-borrows `samples`
    // immutably while those mutable borrows are live.
    let max_val = samples[..mid]
        .iter()
        .cloned()
        .fold(f32::NEG_INFINITY, f32::max);

    if max_val > 0.0 {
        for s in right.iter_mut() {
            *s /= max_val;
        }
    }

    let _ = left; // silence unused warning
}
```
