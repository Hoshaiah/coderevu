---
slug: mutex-unlock-before-condvar-wait
track: rust
orderIndex: 92
title: Condvar Wait Drops Lock Too Early
difficulty: hard
tags:
  - errors
  - concurrency
  - mutex
  - correctness
language: rust
---

## Context

`src/worker/queue.rs` implements a simple bounded work queue used by a thread pool. A producer pushes jobs; consumers block on a `Condvar` when the queue is empty. The design follows the classic mutex + condvar pattern. It was written by adapting a Python threading example and has been running in production for several months.

Under heavy load (>= 8 producer threads) the consumer threads occasionally deadlock forever: they appear stuck inside the `wait_for_job` function according to stack traces from a core dump. A simpler single-producer test never reproduces it. Adding extra `notify_all` calls in the producer reduced the frequency but did not eliminate the deadlock, which is a clue that the issue is a race condition rather than a missed notification.

A coworker suggested the problem might be a spurious wakeup, but adding a loop around the `wait` did not help. The actual race is earlier.

## Buggy code

```rust
use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};

pub struct Queue<T> {
    inner: Arc<(Mutex<VecDeque<T>>, Condvar)>,
}

impl<T: Send> Queue<T> {
    pub fn new() -> Self {
        Queue {
            inner: Arc::new((Mutex::new(VecDeque::new()), Condvar::new())),
        }
    }

    pub fn push(&self, item: T) {
        let (lock, cvar) = &*self.inner;
        let mut queue = lock.lock().unwrap();
        queue.push_back(item);
        drop(queue); // release lock before notifying
        cvar.notify_one();
    }

    pub fn wait_for_job(&self) -> T {
        let (lock, cvar) = &*self.inner;
        let mut queue = lock.lock().unwrap();
        if queue.is_empty() {
            drop(queue); // release the lock before waiting
            cvar.wait(lock.lock().unwrap()).unwrap();
            queue = lock.lock().unwrap();
        }
        queue.pop_front().unwrap()
    }
}
```
