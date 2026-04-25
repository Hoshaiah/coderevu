---
slug: clone-to-satisfy-move-in-closure
track: rust
orderIndex: 9
title: Closure Captures Reference Past Its Owner
difficulty: medium
tags:
  - lifetimes
  - ownership
  - closures
language: rust
---

## Context

This is in `src/jobs/scheduler.rs`. The scheduler spawns a thread for each registered job and passes a reference to the job's configuration into the closure. The configuration `Config` struct is created locally inside `run`, and the spawned thread is expected to use it for the duration of its work.

The code fails to compile: `std::thread::spawn` requires `'static` closures because it may outlive the calling frame, but the closure captures a reference to `config`, which is local to `run` and therefore not `'static`.

The developer tried adding `&'static Config` annotations everywhere but that is the wrong approach — the config is not static, it is just owned data that should be moved into the thread.

## Buggy code

```rust
use std::thread;

#[derive(Debug)]
pub struct Config {
    pub interval_secs: u64,
    pub endpoint: String,
}

pub struct Scheduler;

impl Scheduler {
    pub fn run(name: &'static str, config: Config) {
        // BUG: `config` is captured by reference (&config) inside the move closure,
        // but the closure must be 'static. The reference does not outlive `run`.
        let handle = thread::spawn(move || {
            let cfg = &config; // implicit reborrow; config itself is moved, but...
            loop {
                // In the real version this reference is captured *before* move:
                println!("[{}] polling {} every {}s", name, cfg.endpoint, cfg.interval_secs);
                thread::sleep(std::time::Duration::from_secs(cfg.interval_secs));
            }
        });
        handle.join().unwrap();
    }
}
```
