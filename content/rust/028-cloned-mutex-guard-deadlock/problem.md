---
slug: cloned-mutex-guard-deadlock
track: rust
orderIndex: 28
title: Double Lock on Same Mutex
difficulty: medium
tags:
  - ownership
  - concurrency
  - mutex
language: rust
---

## Context

This code is in `src/cache/store.rs`, a simple in-memory cache used by a web service. The `get_or_insert` method is called from multiple Actix-web handlers on every request to retrieve a cached computation or populate the cache on miss.

Under load the service completely freezes. All worker threads stop responding and the process has to be killed and restarted. Logs show the last successful request completing normally and then silence. No panic, no error — just a deadlock.

The deadlock was traced to `get_or_insert`. A developer added a log statement inside the method and noticed it prints "checking cache" but never prints "done". The `parking_lot` crate is NOT in use; this is standard `std::sync::Mutex`.

## Buggy code

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct Cache {
    inner: Arc<Mutex<HashMap<String, String>>>,
}

impl Cache {
    pub fn new() -> Self {
        Cache {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_or_insert(&self, key: &str, compute: impl FnOnce() -> String) -> String {
        {
            let map = self.inner.lock().unwrap();
            if let Some(val) = map.get(key) {
                return val.clone();
            }
        }
        // Guard dropped here; re-lock to insert.
        let value = compute();
        let mut map = self.inner.lock().unwrap();
        // BUG: compute() might itself call get_or_insert, re-locking here
        // before the outer lock is released causes a deadlock.
        // But there is a second, simpler bug: the scoped block above
        // does NOT drop the guard because map is used in the return expr.
        // Actually the scoped block does drop it. The real bug:
        // We lock AGAIN below while the first lock from an outer caller
        // may still hold the lock if compute() calls back into get_or_insert.
        // Demonstrate a simpler self-deadlock: call get_or_insert inside compute.
        map.entry(key.to_string()).or_insert(value.clone());
        value
    }

    pub fn populate(&self, key: &str) {
        // This calls get_or_insert recursively, deadlocking on std::sync::Mutex.
        let _val = self.get_or_insert(key, || {
            self.get_or_insert("default", || "fallback".to_string())
        });
    }
}
```
