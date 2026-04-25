---
slug: iterator-chain-collect-wrong-type
track: rust
orderIndex: 97
title: >-
  Silent data loss when chaining iterators that yield `Option` without
  flattening
difficulty: medium
tags:
  - iterators
  - option
  - correctness
  - type-inference
language: rust
---

## Context

This ETL utility parses a list of raw score strings into validated `f64` values, skipping malformed entries. The function compiles and runs without warning, but the QA team discovered that the output always contains the same number of items as the input — including `0.0` for every entry that failed to parse.

## Buggy code

```rust
pub fn parse_scores(raw: &[&str]) -> Vec<f64> {
    raw.iter()
        .map(|s| s.trim().parse::<f64>().ok())
        .map(|opt| opt.unwrap_or(0.0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_bad_entries() {
        // Expects [1.5, 3.0], not [1.5, 0.0, 3.0]
        let result = parse_scores(&["1.5", "bad", "3.0"]);
        assert_eq!(result.len(), 2);
    }
}
```
