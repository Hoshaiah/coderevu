---
slug: closure-borrow-outlives-data
track: rust
orderIndex: 11
title: Closure Captures Reference to Dropped Local
difficulty: medium
tags:
  - lifetimes
  - borrowing
  - closures
language: rust
---

## Context

This code is in `src/pipeline/stages.rs`, part of a data-processing pipeline where stages are built by composing closures. Each stage is represented as a `Box<dyn Fn(i64) -> i64 + Send>`. The `make_multiplier_stage` function is supposed to build a stage that multiplies its input by a runtime-determined factor loaded from a config file.

The code doesn't compile — the error message says the returned closure captures a reference to a local variable that does not live long enough. A teammate patched it by adding `.clone()` in a wrong place that made it compile but silently used the wrong value under concurrent load.

The actual fix is straightforward but requires understanding what the closure captures and why.

## Buggy code

```rust
pub type Stage = Box<dyn Fn(i64) -> i64 + Send + 'static>;

fn load_factor(config_key: &str) -> i64 {
    // Simulated config lookup.
    match config_key {
        "double" => 2,
        "triple" => 3,
        _        => 1,
    }
}

pub fn make_multiplier_stage(config_key: &str) -> Stage {
    let factor = load_factor(config_key);
    // `config_key` is a &str with the caller's lifetime —
    // capturing it in a 'static closure is illegal.
    Box::new(move |input: i64| -> i64 {
        let _ = config_key; // accidentally captured
        input * factor
    })
}
```
