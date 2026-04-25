---
slug: arc-weak-upgrade-none-ignored
track: rust
orderIndex: 37
title: 'Weak::upgrade Returns None Silently'
difficulty: medium
tags:
  - ownership
  - arc
  - correctness
  - resource-management
language: rust
---

## Context

`src/cache/eviction.rs` implements an LRU-like in-memory cache. Each value is stored as an `Arc<T>` in the main map; the eviction worker holds only `Weak<T>` references so it does not prevent deallocation. When the eviction timer fires, the worker iterates its list of weak references and calls `refresh` on each live entry to reset usage counters.

Users report that cache entries occasionally fail to have their usage counters reset, causing premature eviction of hot entries. The bug manifests more frequently under load when the allocator is busy. Adding `println!` probes confirmed that `refresh` is sometimes not being called even for entries that are still alive and in the map.

The owner of the Arc values (the main map) is still holding them; the Weak references should be upgradeable. Heap profiling showed no unexpected drops of the Arc values.

## Buggy code

```rust
use std::sync::{Arc, Weak, Mutex};

pub struct CacheEntry {
    pub key: String,
    pub hits: u64,
}

pub struct EvictionWorker {
    tracked: Vec<Weak<Mutex<CacheEntry>>>,
}

impl EvictionWorker {
    pub fn refresh_all(&self) {
        for weak in &self.tracked {
            if let Some(entry) = weak.upgrade() {
                let mut e = entry.lock().unwrap();
                e.hits = 0;
            }
            // silently skip entries that failed to upgrade
        }
    }

    pub fn add(&mut self, entry: &Arc<Mutex<CacheEntry>>) {
        // Store a clone of the Arc as a Weak reference
        let weak = Arc::clone(entry);
        self.tracked.push(Arc::downgrade(&weak));
    }
}
```
