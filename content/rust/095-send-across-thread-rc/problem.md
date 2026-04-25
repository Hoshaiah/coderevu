---
slug: send-across-thread-rc
track: rust
orderIndex: 95
title: >-
  Replacing `Arc` with `Rc` to avoid atomic overhead causes a compile error in
  disguise
difficulty: hard
tags:
  - concurrency
  - send-sync
  - rc-vs-arc
  - thread-safety
language: rust
---

## Context

A developer optimised a single-threaded configuration cache by replacing `Arc<Config>` with `Rc<Config>` to avoid the cost of atomic reference counting. They added a `#[allow(dead_code)]` to silence warnings and shipped it. The code compiled on their machine but a colleague reports it fails to compile with a cryptic `Send` error when they try to use the cache in an `async` context with `tokio::spawn`.

## Buggy code

```rust
use std::rc::Rc;
use std::collections::HashMap;

#[derive(Debug)]
pub struct Config {
    pub values: HashMap<String, String>,
}

#[derive(Clone)]
pub struct ConfigCache {
    inner: Rc<Config>,
}

impl ConfigCache {
    pub fn new(values: HashMap<String, String>) -> Self {
        ConfigCache {
            inner: Rc::new(Config { values }),
        }
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.inner.values.get(key).map(|s| s.as_str())
    }
}

pub async fn reload_worker(cache: ConfigCache) {
    tokio::spawn(async move {
        let _ = cache.get("version");
    }).await.unwrap();
}
```
