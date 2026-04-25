---
slug: hash-map-entry-double-lookup
track: rust
orderIndex: 98
title: Cache implementation does redundant map lookups by not using the Entry API
difficulty: hard
tags:
  - performance
  - api-misuse
  - collections
  - correctness
language: rust
---

## Context

This memoization cache is used in a hot path of a graph traversal algorithm. A profiler shows that under load, the `HashMap` is being hashed and probed twice for every cache hit — once for the `contains_key` check and once for the subsequent `get` or `insert`. On graphs with millions of nodes this adds up significantly.

## Buggy code

```rust
use std::collections::HashMap;

pub struct MemoCache {
    store: HashMap<u64, Vec<u64>>,
}

impl MemoCache {
    pub fn new() -> Self {
        MemoCache {
            store: HashMap::new(),
        }
    }

    pub fn get_or_compute<F>(&mut self, key: u64, compute: F) -> &Vec<u64>
    where
        F: FnOnce() -> Vec<u64>,
    {
        if !self.store.contains_key(&key) {
            let value = compute();
            self.store.insert(key, value);
        }
        self.store.get(&key).unwrap()
    }
}
```
