---
slug: shared-global-state-in-test
track: rust
orderIndex: 41
title: Global Mutation Breaks Parallel Tests
difficulty: hard
tags:
  - ownership
  - concurrency
  - test-isolation
language: rust
---

## Context

In `src/config/global.rs`, a module exposes a global configuration registry backed by a `static` `Mutex<HashMap>`. Application code calls `register` at startup and `lookup` at request time. This works fine in production where startup happens once.

The integration test suite runs tests in parallel by default (`cargo test` uses one thread per test by default on multi-core machines). Tests that call `register` and then `lookup` fail non-deterministically: sometimes they get the right value, sometimes they get `None`, and sometimes they get a value registered by a different test.

The problem is that tests share the same process and therefore the same static, and they race on insertions and lookups. The developer tried wrapping the whole test in `std::sync::Mutex::lock()` but used a different mutex than the one guarding the map, which fixed nothing.

## Buggy code

```rust
// src/config/global.rs
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

static REGISTRY: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<String, String>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register(key: &str, value: &str) {
    registry().lock().unwrap().insert(key.to_string(), value.to_string());
}

pub fn lookup(key: &str) -> Option<String> {
    registry().lock().unwrap().get(key).cloned()
}

// In tests/integration_test.rs:
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_lookup_a() {
        register("timeout", "30");
        assert_eq!(lookup("timeout"), Some("30".to_string()));
    }

    #[test]
    fn test_register_and_lookup_b() {
        register("timeout", "60");
        assert_eq!(lookup("timeout"), Some("60".to_string()));
    }
}
```
