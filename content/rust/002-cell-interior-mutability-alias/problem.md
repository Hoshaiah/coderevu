---
slug: cell-interior-mutability-alias
track: rust
orderIndex: 2
title: Shared Reference Hides Mutation
difficulty: easy
tags:
  - borrowing
  - interior-mutability
  - correctness
language: rust
---

## Context

This is a small caching layer in `src/cache/scored.rs`. It wraps a `Vec<f64>` of pre-computed scores and hands out shared references to slices so callers can read scores without cloning. A `Cell<usize>` tracks how many times the cache has been read, purely for diagnostics.

Operators noticed that hit counts reported in the dashboard are always zero, no matter how many requests come through. The metric pipeline reads `cache.hit_count()` every 30 seconds and the value is consistently `0`.

The code compiles and runs without error. Adding `println!` inside `record_hit` confirmed it is being called, but the value that comes back from `hit_count()` never changes. The developer who wrote this recently switched from `Cell<usize>` to a plain field to "simplify" the code.

## Buggy code

```rust
pub struct ScoredCache {
    scores: Vec<f64>,
    hits: usize,
}

impl ScoredCache {
    pub fn new(scores: Vec<f64>) -> Self {
        ScoredCache { scores, hits: 0 }
    }

    pub fn get(&self, idx: usize) -> Option<&f64> {
        self.record_hit();
        self.scores.get(idx)
    }

    fn record_hit(&self) {
        // Increment the hit counter through a shared reference.
        let mut copy = self.hits;
        copy += 1;
        // Intended to write back, but self is &self, not &mut self.
        // This silently does nothing to the original field.
    }

    pub fn hit_count(&self) -> usize {
        self.hits
    }
}
```
