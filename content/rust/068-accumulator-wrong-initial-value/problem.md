---
slug: accumulator-wrong-initial-value
track: rust
orderIndex: 68
title: fold Initial Value Wrong Type Truncates
difficulty: easy
tags:
  - errors
  - overflow
  - iterator
language: rust
---

## Context

This is in `src/analytics/stats.rs`. The `total_bytes` function sums a slice of file sizes reported as `u64` values. It's called from the dashboard API to show total storage consumed across all user uploads. Values can easily exceed 4 GB for active users.

The dashboard started showing negative storage values for users with more than ~4 GB of uploads. The Sentry error tracker showed no panics. The API was returning silently wrong data. A data engineer noticed the discrepancy when cross-referencing with S3 billing reports.

The code was written quickly and the initial value passed to `fold` was typed as an integer literal without an explicit type suffix, causing it to be inferred as `i32` rather than `u64`. Rust's type inference resolved the accumulator to the wrong type.

## Buggy code

```rust
/// Returns the total number of bytes across all provided file sizes.
pub fn total_bytes(sizes: &[u64]) -> u64 {
    sizes.iter().fold(0, |acc, &size| acc + size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_files() {
        let sizes = vec![100u64, 200u64, 300u64];
        assert_eq!(total_bytes(&sizes), 600);
    }
}
```
