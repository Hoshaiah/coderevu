---
slug: mutex-lock-returns-ignored-error
track: rust
orderIndex: 62
title: "Poisoned Mutex Error Silently Swallowed"
difficulty: easy
tags: ["errors", "concurrency", "mutex"]
language: rust
---

## Context

This snippet is from `src/cache.rs` in a web service that maintains an in-memory request counter shared across worker threads. The counter is protected by a `Mutex<u64>`. The `increment` function is called from every request handler.

Operators noticed that after a panic in any one of the worker threads, the counter stops incrementing and requests appear to be counted correctly but the number never moves. Adding log statements revealed the counter value was frozen at whatever value it had when the thread panicked.

The team already confirmed that the `Mutex` is being shared via `Arc` correctly across threads. The issue is specifically in how `lock()` errors are handled in `increment`.

## Buggy code

```rust
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Counter {
    inner: Arc<Mutex<u64>>,
}

impl Counter {
    pub fn new() -> Self {
        Counter {
            inner: Arc::new(Mutex::new(0)),
        }
    }

    pub fn increment(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard += 1;
        }
        // silently does nothing on Err (poisoned mutex)
    }

    pub fn get(&self) -> u64 {
        *self.inner.lock().unwrap()
    }
}
```
