---
slug: drop-order-lock-guard
track: rust
orderIndex: 29
title: Lock Guard Dropped Too Late
difficulty: medium
tags:
  - ownership
  - concurrency
  - deadlock
language: rust
---

## Context

This code lives in `src/worker/processor.rs`, a background worker that processes jobs from a shared queue. Two methods share the same `Mutex<VecDeque<Job>>`— one to enqueue jobs and one to process them. The worker runs in a tight loop calling `process_next` while the web handler calls `enqueue`.

Under load the service deadlocks within seconds. The queue lock is held for far longer than necessary. Thread dumps show the web handler thread permanently blocked on `enqueue` while the worker thread is inside `do_expensive_work`, which can take hundreds of milliseconds.

The developer assumed that `lock()` returns a guard that is dropped at the end of the enclosing `if let` block. They did not realize the guard's lifetime extends to the end of the entire `match` arm or statement.

## Buggy code

```rust
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

pub struct Job {
    pub id: u64,
    pub payload: Vec<u8>,
}

pub struct Processor {
    queue: Arc<Mutex<VecDeque<Job>>>,
}

impl Processor {
    pub fn enqueue(&self, job: Job) {
        self.queue.lock().unwrap().push_back(job);
    }

    pub fn process_next(&self) {
        // BUG: the guard (and therefore the lock) is held across
        // the entire if-let block, including do_expensive_work.
        if let Some(job) = self.queue.lock().unwrap().pop_front() {
            do_expensive_work(&job);
        }
    }
}

fn do_expensive_work(job: &Job) {
    // Simulates hundreds of milliseconds of CPU/IO work.
    let _ = job.payload.len();
}
```
