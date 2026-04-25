---
slug: option-unwrap-or-closure-eagerly-evaluated
track: rust
orderIndex: 53
title: Eager Evaluation in unwrap_or
difficulty: easy
tags:
  - errors
  - api-misuse
  - option
language: rust
---

## Context

This lives in `src/config/loader.rs`, a small helper that reads a configuration value from an environment variable and falls back to a database lookup if the variable isn't set. The function is called once per request in a middleware layer.

In production, operators noticed that the database is hit on every request, even when the environment variable is clearly set. Adding log lines confirmed that `db_lookup` is always called, regardless of the `env::var` result. Latency charts show a 40 ms overhead per request that shouldn't be there.

The developer already verified that `std::env::var("APP_TIMEOUT")` correctly returns `Ok(...)` at runtime, so the environment variable is definitely present. The fallback path should never run in that case.

## Buggy code

```rust
use std::env;

fn db_lookup(key: &str) -> String {
    // Simulates an expensive database call
    println!("[db] fetching key: {}", key);
    String::from("30")
}

pub fn get_config_value(key: &str) -> String {
    env::var(key)
        .unwrap_or(db_lookup(key))
}
```
