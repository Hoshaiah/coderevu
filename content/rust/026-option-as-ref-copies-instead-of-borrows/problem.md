---
slug: option-as-ref-copies-instead-of-borrows
track: rust
orderIndex: 26
title: Option Clone Instead of Borrow
difficulty: easy
tags:
  - ownership
  - borrowing
  - option
language: rust
---

## Context

This is in `src/cache/entry.rs`, part of a read-through cache layer. `CacheEntry` holds an optional `Vec<u8>` payload. The function `peek_payload` is supposed to return a reference into the entry's payload so callers can inspect the bytes without cloning — this is critical on the hot path where payloads can be hundreds of kilobytes.

A performance regression was flagged by the profiling team: allocations from the cache read path spiked by ~40% after a refactor. Heap profiling pointed directly at `peek_payload`. The function was supposed to be a zero-copy accessor but is secretly cloning on every call.

The code compiles and passes all unit tests because the tests only check the returned value's contents, not its allocation cost. The bug is purely a silent performance/ownership mistake.

## Buggy code

```rust
pub struct CacheEntry {
    key: String,
    payload: Option<Vec<u8>>,
    hits: u64,
}

impl CacheEntry {
    pub fn new(key: String, payload: Option<Vec<u8>>) -> Self {
        CacheEntry { key, payload, hits: 0 }
    }

    /// Returns a reference to the payload bytes, if present.
    pub fn peek_payload(&self) -> Option<Vec<u8>> {
        self.payload.clone()
    }

    pub fn record_hit(&mut self) {
        self.hits += 1;
    }

    pub fn hits(&self) -> u64 {
        self.hits
    }
}
```
