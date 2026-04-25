---
slug: slice-window-off-by-one-panic
track: rust
orderIndex: 59
title: windows() Size Zero Panics
difficulty: easy
tags:
  - errors
  - ownership
  - panics
language: rust
---

## Context

This function is in `src/analytics/signal.rs` and computes a simple moving average over a time-series buffer. It is called by a background worker every 30 seconds and the results are written to a Redis sorted set for the dashboard to read.

Ops reported that the worker crashes intermittently with `thread 'worker-4' panicked at 'size is zero'`. The stack trace points directly into `std::slice::Windows::new`. The crash only appears when the input slice is very short — typically at startup when fewer than the expected number of samples have been collected.

The developer who originally wrote this checked for an empty slice but did not consider the edge case that triggers the stdlib panic.

## Buggy code

```rust
pub fn moving_average(samples: &[f64], window: usize) -> Vec<f64> {
    if samples.is_empty() {
        return Vec::new();
    }

    samples
        .windows(window)
        .map(|w| w.iter().sum::<f64>() / w.len() as f64)
        .collect()
}
```
