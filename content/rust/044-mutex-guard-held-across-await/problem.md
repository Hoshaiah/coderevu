---
slug: mutex-guard-held-across-await
track: rust
orderIndex: 44
title: MutexGuard Held Across Await Point
difficulty: hard
tags:
  - ownership
  - concurrency
  - async
language: rust
---

## Context

This async handler lives in `src/handlers/counter.rs` in a Tokio-based web service. It increments a shared hit counter and then performs a slow async call (fetching geo-location data for analytics) before responding. The counter is wrapped in `std::sync::Mutex` because a teammate said 'Mutex is fine for simple shared state'.

Under moderate load the service deadlocks: all worker threads stall and requests time out. The deadlock does not occur during testing because tests hit the endpoint sequentially. The Tokio runtime's thread count is set to 4 in production.

A profiler shows all threads blocked on `Mutex::lock`. The fix does not require switching to `tokio::sync::Mutex` — the guard simply must not be held while the runtime is free to schedule other tasks on the same thread.

## Buggy code

```rust
// Requires: tokio = { version = "1", features = ["full"] }
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub hit_count: Mutex<u64>,
}

pub async fn handle_request(state: Arc<AppState>) -> String {
    // Bug: the MutexGuard is kept alive across the `.await` point
    // below. If Tokio parks this task and schedules another one
    // that also calls handle_request on the same thread, it will
    // try to lock the same Mutex — deadlocking the thread.
    let mut count = state.hit_count.lock().unwrap();
    *count += 1;
    let current = *count;

    // Simulated slow async operation (e.g., HTTP call)
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    drop(count); // too late: the guard crosses the await
    format!("hit #{}", current)
}
```
