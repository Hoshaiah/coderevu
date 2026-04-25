---
slug: wrapping-add-overflow-silent
track: rust
orderIndex: 80
title: Unchecked Arithmetic Wraps in Release
difficulty: medium
tags:
  - errors
  - ownership
  - arithmetic
language: rust
---

## Context

This function is in `src/metrics/counter.rs` and maintains an in-memory request counter for a high-traffic HTTP service. The counter is incremented on every request and periodically flushed to a time-series database. The code has been running in production for months without issues in debug builds.

After a recent deployment to a high-traffic production environment, the flushed counter values started appearing nonsensically small or even zero in the dashboard — as if the counter resets unexpectedly. Debug builds (which panic on integer overflow) have never triggered this path.

The team added logging and confirmed the counter reaches very large values between flushes, but did not initially connect that to the truncating cast in the flush path.

## Buggy code

```rust
pub struct RequestCounter {
    pub count: u64,
}

impl RequestCounter {
    pub fn new() -> Self {
        RequestCounter { count: 0 }
    }

    pub fn increment(&mut self) {
        self.count += 1;
    }

    /// Returns the count as a u32 for the metrics API and resets the counter.
    pub fn flush(&mut self) -> u32 {
        let snapshot = self.count as u32;
        self.count = 0;
        snapshot
    }
}
```
