---
slug: wrapping-subtraction-underflow
track: rust
orderIndex: 63
title: Unsigned Subtraction Silent Underflow
difficulty: easy
tags:
  - errors
  - correctness
  - arithmetic
language: rust
---

## Context

This function is in `src/metrics/aggregator.rs` and computes the delta between two monotonically-increasing counters sampled from a hardware performance counter. It runs every second in a background thread and feeds into a Prometheus gauge.

Operators noticed that roughly once per day the reported delta spikes to an astronomically large number (near `u64::MAX`) for exactly one sample period, then returns to normal. The counter values themselves look correct in the raw logs — only the delta is wrong.

After ruling out clock skew and counter resets, the team suspects the issue is in the arithmetic itself. The hardware guarantees the counter never resets; but a counter wrapping around `u64::MAX` (which happens roughly once every 18 months of uptime on this hardware) produces a previous value larger than the current value.

## Buggy code

```rust
pub struct CounterSample {
    pub timestamp_ms: u64,
    pub value: u64,
}

pub fn compute_delta(prev: &CounterSample, curr: &CounterSample) -> u64 {
    // BUG: if the hardware counter wrapped, curr.value < prev.value
    // and this subtraction underflows silently in release mode.
    curr.value - prev.value
}
```
