---
slug: drop-in-wrong-order-rwlock
track: rust
orderIndex: 40
title: RwLock Write Guard Held Too Long
difficulty: medium
tags:
  - ownership
  - concurrency
  - drop-order
language: rust
---

## Context

This is in `src/registry/service_map.rs`. A `ServiceRegistry` wraps a `RwLock<HashMap<String, String>>`. The `update_and_snapshot` method updates a key and then immediately takes a snapshot of the entire map to return to the caller. It's called from an HTTP handler on every registration request.

Under moderate load the service starts exhibiting lock contention: read-heavy workloads stall for hundreds of milliseconds even though writes are rare. Thread dumps show many reader threads blocked waiting to acquire the read lock. The write lock is held far longer than necessary.

A senior engineer suspects the write guard is being kept alive through the snapshot operation, blocking all readers during the entire clone of the map. The fix is a small structural change to release the write guard before taking the snapshot.

## Buggy code

```rust
use std::collections::HashMap;
use std::sync::RwLock;

pub struct ServiceRegistry {
    map: RwLock<HashMap<String, String>>,
}

impl ServiceRegistry {
    pub fn new() -> Self {
        ServiceRegistry { map: RwLock::new(HashMap::new()) }
    }

    /// Insert or update `key` and return a snapshot of the entire registry.
    pub fn update_and_snapshot(
        &self,
        key: String,
        value: String,
    ) -> HashMap<String, String> {
        let mut guard = self.map.write().unwrap();
        guard.insert(key, value);
        // Intended: release the write lock before cloning, but the guard
        // is still live here, so readers are blocked during the clone.
        let snapshot = guard.clone();
        snapshot
    }
}
```
