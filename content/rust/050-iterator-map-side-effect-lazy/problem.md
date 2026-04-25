---
slug: iterator-map-side-effect-lazy
track: rust
orderIndex: 50
title: Lazy Iterator Side Effects Never Run
difficulty: easy
tags:
  - errors
  - iterators
  - api-misuse
language: rust
---

## Context

This function is in `src/metrics/recorder.rs`. It is called at the end of a request to persist per-endpoint counters to Redis. The function maps a list of metric keys to Redis `INCR` commands using a pipeline. The developer used `Iterator::map` to apply the side-effecting call.

In production, Redis counters never increment. The metrics dashboard is blank. No errors appear in logs. The function returns without panicking. A developer added a `println!` inside the closure and confirmed it never prints.

This is a classic Rust footgun: `map` on an iterator is lazy. Without a terminal operation, the closure never executes.

## Buggy code

```rust
// Simplified: pretend `pipeline` is a Redis pipeline that queues commands.
pub struct Pipeline {
    commands: Vec<String>,
}

impl Pipeline {
    pub fn incr(&mut self, key: &str) {
        self.commands.push(format!("INCR {}", key));
    }

    pub fn commands(&self) -> &[String] {
        &self.commands
    }
}

pub fn record_metrics(pipeline: &mut Pipeline, keys: &[&str]) {
    // BUG: `map` is lazy — the closure never runs because there is
    // no terminal operation (collect, for_each, count, etc.) to drive it.
    keys.iter().map(|key| pipeline.incr(key));
}
```
