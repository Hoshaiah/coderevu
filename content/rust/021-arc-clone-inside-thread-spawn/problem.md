---
slug: arc-clone-inside-thread-spawn
track: rust
orderIndex: 21
title: Move of Arc Before Clone
difficulty: easy
tags:
  - ownership
  - concurrency
  - threads
language: rust
---

## Context

This code is in `src/workers/dispatcher.rs`. The dispatcher spawns a fixed pool of worker threads that each receive a shared configuration object and a work receiver. The code is supposed to compile and run cleanly, handing each thread its own `Arc` handle to the config.

The code does not compile. The compiler reports that `config` is moved into the first closure and then used again in subsequent iterations. A developer tried wrapping the whole loop body in a block, but the error persisted because the clone was placed in the wrong order.

The fix is simple once you know where Rust's ownership rules require the clone to happen, but it trips up developers who are new to sharing state across threads with `Arc`.

## Buggy code

```rust
use std::sync::Arc;
use std::thread;

pub struct Config {
    pub workers: usize,
    pub timeout_ms: u64,
}

pub fn spawn_workers(config: Arc<Config>, count: usize) {
    for i in 0..count {
        // BUG: `config` is moved into the first closure.
        // The clone happens inside the thread, but by then `config` is
        // already consumed by the move — subsequent iterations fail.
        thread::spawn(move || {
            let _cfg = config.clone();
            println!("worker {} timeout={}", i, _cfg.timeout_ms);
        });
    }
}
```
