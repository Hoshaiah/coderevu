---
slug: channel-sender-never-dropped
track: rust
orderIndex: 35
title: Channel Sender Kept Alive Forever
difficulty: medium
tags:
  - ownership
  - concurrency
  - channels
language: rust
---

## Context

This code lives in `src/workers/dispatcher.rs` and implements a simple work-queue: a `Dispatcher` sends jobs to a pool of worker threads over an `std::sync::mpsc` channel. The `run_workers` function is called at startup and is supposed to return only after all workers have finished processing every queued job.

The program hangs indefinitely after all jobs are dispatched. Worker threads process their jobs correctly (confirmed by log output) but the `join()` calls in `run_workers` block forever. Adding `drop(tx)` inside the function before the joins resolves the hang, suggesting a sender lifetime issue.

The team confirmed the `rx` end is properly moved into the worker threads.

## Buggy code

```rust
use std::sync::mpsc;
use std::thread;

pub fn run_workers(jobs: Vec<String>) {
    let (tx, rx) = mpsc::channel::<String>();
    let rx = std::sync::Arc::new(std::sync::Mutex::new(rx));

    let mut handles = Vec::new();
    for _ in 0..4 {
        let rx_clone = rx.clone();
        let tx_clone = tx.clone(); // BUG: clone kept alive for no reason
        handles.push(thread::spawn(move || {
            let _keep_alive = tx_clone; // accidentally keeps sender alive
            loop {
                let job = rx_clone.lock().unwrap().recv();
                match job {
                    Ok(j) => println!("Processing: {}", j),
                    Err(_) => break, // channel closed
                }
            }
        }));
    }

    for job in jobs {
        tx.send(job).unwrap();
    }

    for h in handles {
        h.join().unwrap();
    }
}
```
