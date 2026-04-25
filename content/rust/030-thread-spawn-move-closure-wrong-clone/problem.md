---
slug: thread-spawn-move-closure-wrong-clone
track: rust
orderIndex: 30
title: Clone Inside Spawn Shares State
difficulty: medium
tags:
  - ownership
  - concurrency
  - thread-spawn
language: rust
---

## Context

This code is in `src/workers/dispatcher.rs`. A background dispatcher receives work items over a channel and fans them out to a fixed pool of worker threads. Each worker is supposed to have its own independent counter tracking how many jobs it has processed, which is printed in a health-check endpoint.

In staging, operators noticed that the per-worker counters always show identical values — if worker 0 has processed 42 jobs, every worker shows 42. The expectation was that each worker maintains its own separate count. There are no compilation errors and no panics.

The developer confirmed that each thread does increment its counter, and the `Arc` wrapping is intentional for the health-check endpoint to read the value. The bug is that all workers share one counter instead of each owning a distinct one.

## Buggy code

```rust
use std::sync::{Arc, Mutex};
use std::thread;

pub fn spawn_workers(n: usize) -> Vec<Arc<Mutex<u64>>> {
    let counter = Arc::new(Mutex::new(0u64));
    let mut handles = Vec::new();
    let mut counters = Vec::new();

    for _ in 0..n {
        let c = Arc::clone(&counter);
        counters.push(Arc::clone(&c));
        thread::spawn(move || {
            loop {
                // ... receive and process a job ...
                *c.lock().unwrap() += 1;
                thread::sleep(std::time::Duration::from_millis(100));
            }
        });
    }

    counters
}
```
