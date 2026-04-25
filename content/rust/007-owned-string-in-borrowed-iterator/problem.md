---
slug: owned-string-in-borrowed-iterator
track: rust
orderIndex: 7
title: Temporary String Dropped Too Early
difficulty: easy
tags:
  - lifetimes
  - ownership
  - iterators
language: rust
---

## Context

This code lives in `src/filters.rs` inside a CLI tool that processes log lines. The function `active_prefixes` is supposed to return an iterator over only those prefix strings that are marked active in the config map. It's called once at startup to build a filter set.

The code refuses to compile with an error like `temporary value dropped while borrowed` pointing at the `format!` call inside the closure. A junior engineer tried returning `impl Iterator<Item = &str>` instead of collecting, to avoid an allocation, and hit this wall.

The root cause is a lifetime mismatch: the `&str` slices yielded by the iterator borrow from a `String` that is created inside the closure and dropped at the end of each iteration, so the references dangle before the caller ever sees them.

## Buggy code

```rust
use std::collections::HashMap;

pub fn active_prefixes<'a>(
    config: &'a HashMap<String, bool>,
) -> impl Iterator<Item = &'a str> {
    config
        .iter()
        .filter(|(_, &active)| active)
        .map(|(key, _)| {
            let prefixed: String = format!("prefix::{}", key);
            prefixed.as_str()
        })
}
```
