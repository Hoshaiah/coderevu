---
slug: trait-object-missing-send-bound
track: rust
orderIndex: 33
title: Trait Object Sent Across Threads
difficulty: medium
tags:
  - ownership
  - errors
  - concurrency
language: rust
---

## Context

This module is `src/jobs/dispatcher.rs`. It implements a simple job dispatcher that spawns a worker thread per job. Each job is represented as a boxed trait object so the dispatcher can be generic over job types without monomorphization.

The code fails to compile with `error[E0277]: \'dyn Job\' cannot be sent between threads safely`. The developer is confused because they are already wrapping the job in a `Box` and expected the heap allocation to make it safe to send.

The pattern is copied from an older part of the codebase that worked, but that older code used concrete types rather than trait objects.

## Buggy code

```rust
use std::thread;

pub trait Job {
    fn run(&self);
}

pub struct Dispatcher;

impl Dispatcher {
    pub fn dispatch(&self, job: Box<dyn Job>) {
        thread::spawn(move || {
            job.run();
        });
    }
}
```
