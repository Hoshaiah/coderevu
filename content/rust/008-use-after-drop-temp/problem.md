---
slug: use-after-drop-temp
track: rust
orderIndex: 8
title: >-
  Temporary MutexGuard is dropped immediately, leaving the critical section
  unprotected
difficulty: medium
tags:
  - lifetimes
  - drop
  - concurrency
  - mutex
language: rust
---

## Context

This snippet is from a rate-limiter used by an API gateway. It checks and increments a per-client request counter inside what the author thought was a single locked section. Under concurrent load, counters frequently exceed the configured limit, allowing traffic that should be rejected.

## Buggy code

```rust
use std::sync::Mutex;
use std::collections::HashMap;

pub struct RateLimiter {
    counts: Mutex<HashMap<String, u32>>,
    limit: u32,
}

impl RateLimiter {
    pub fn new(limit: u32) -> Self {
        RateLimiter {
            counts: Mutex::new(HashMap::new()),
            limit,
        }
    }

    pub fn check_and_increment(&self, client_id: &str) -> bool {
        let count = *self.counts.lock().unwrap()
            .get(client_id)
            .unwrap_or(&0);

        if count >= self.limit {
            return false;
        }

        self.counts.lock().unwrap()
            .insert(client_id.to_string(), count + 1);
        true
    }
}
```
