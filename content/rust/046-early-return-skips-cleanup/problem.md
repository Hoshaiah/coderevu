---
slug: early-return-skips-cleanup
track: rust
orderIndex: 46
title: Lock Guard Leak on Early Return
difficulty: hard
tags:
  - ownership
  - errors
  - concurrency
language: rust
---

## Context

This code is in `src/db/connection_pool.rs`. The `checkout` method hands a connection out of a pool protected by a `Mutex<Vec<Conn>>`. A `PoolGuard` RAII type is supposed to return the connection when dropped. The method is called thousands of times per second under production load.

Under load, the pool exhausts all connections after about 10 minutes and all subsequent calls to `checkout` block indefinitely. A heap dump shows `PoolGuard` objects being created correctly, but a subset of connections are never returned to the pool's Vec. Restarting the service recovers it temporarily.

The team confirmed that `PoolGuard::drop` is implemented correctly. The bug is in `checkout` itself — a subtle interaction between the `MutexGuard` scope and the `PoolGuard` construction.

## Buggy code

```rust
use std::sync::{Arc, Mutex, MutexGuard};

pub struct Conn {
    pub id: u32,
}

pub struct Pool {
    conns: Arc<Mutex<Vec<Conn>>>,
}

pub struct PoolGuard {
    conn: Option<Conn>,
    pool: Arc<Mutex<Vec<Conn>>>,
}

impl Drop for PoolGuard {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            self.pool.lock().unwrap().push(conn);
        }
    }
}

impl Pool {
    pub fn checkout(&self) -> Option<PoolGuard> {
        let mut guard: MutexGuard<Vec<Conn>> = self.conns.lock().unwrap();
        if guard.is_empty() {
            return None; // BUG: guard dropped here, but conn was already popped
        }
        let conn = guard.pop().unwrap();
        // If this line were to panic (e.g. Arc::clone OOM), conn is leaked.
        let pool = Arc::clone(&self.conns);
        // guard is still held here during PoolGuard construction.
        Some(PoolGuard {
            conn: Some(conn),
            pool,
        })
        // guard drops here, releasing the mutex.
    }
}
```
