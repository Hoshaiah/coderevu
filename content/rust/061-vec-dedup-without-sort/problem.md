---
slug: vec-dedup-without-sort
track: rust
orderIndex: 61
title: dedup Without Prior Sort Misses Dupes
difficulty: easy
tags:
  - errors
  - ownership
  - correctness
language: rust
---

## Context

This utility function lives in `src/tags/normalize.rs` and is responsible for deduplicating a list of string tags before storing them in the database. Tags arrive from user input in arbitrary order and are lowercased before deduplication.

Users have reported that duplicate tags occasionally make it into the database, causing UI elements that iterate over tags to show the same tag twice. The bug is intermittent because it only manifests when identical tags happen to be non-adjacent in the input.

The function passes all unit tests because the test fixtures happen to supply tags in sorted order. A fuzz test that randomizes input order exposes the failure immediately.

## Buggy code

```rust
pub fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized: Vec<String> = tags
        .into_iter()
        .map(|t| t.to_lowercase())
        .collect();

    normalized.dedup();
    normalized
}
```
