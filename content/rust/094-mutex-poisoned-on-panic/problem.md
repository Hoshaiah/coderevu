---
slug: mutex-poisoned-on-panic
track: rust
orderIndex: 94
title: >-
  Worker thread panics poison a shared Mutex, causing all subsequent tasks to
  fail
difficulty: medium
tags:
  - concurrency
  - mutex
  - panic
  - error-handling
language: rust
---

## Context

This is a background job runner used in a web service. A thread pool picks up tasks from a queue and runs them while updating a shared counter. Under load testing the team noticed that after any single task panics, every subsequent task starts returning an error immediately without even running.

## Buggy code

```rust
use std::sync::{Arc, Mutex};
use std::thread;

pub struct Runner {
    completed: Arc<Mutex<u64>>,
}

impl Runner {
    pub fn new() -> Self {
        Runner {
            completed: Arc::new(Mutex::new(0)),
        }
    }

    pub fn run_task<F>(&self, task: F) -> Result<(), String>
    where
        F: FnOnce() + Send + 'static,
    {
        let counter = Arc::clone(&self.completed);
        thread::spawn(move || {
            task();
            let mut count = counter.lock().unwrap();
            *count += 1;
        });
        Ok(())
    }

    pub fn completed_count(&self) -> Result<u64, String> {
        let count = self.completed.lock().unwrap();
        Ok(*count)
    }
}
```
