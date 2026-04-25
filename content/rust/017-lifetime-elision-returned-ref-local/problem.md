---
slug: lifetime-elision-returned-ref-local
track: rust
orderIndex: 17
title: Elided Lifetime Ties Ref to Wrong Scope
difficulty: hard
tags:
  - lifetimes
  - borrowing
  - api-misuse
language: rust
---

## Context

This is in `src/cache/lookup.rs`. A read-through cache wraps an in-memory map; `get_or_insert` is supposed to return a reference into the map. A second function, `resolve`, takes a key and a default string slice, inserts the default if absent, and returns a reference valid as long as the cache is alive.

The code doesn't compile. The error points at the return statement of `resolve` and says the returned reference's lifetime is tied to the `default` parameter rather than `self`, so the reference can't outlive the call. The developer expected lifetime elision to infer the correct lifetimes automatically.

This is a pure compilation failure — there is no runtime bug — but the wrong lifetime annotation makes the API unusable: callers can't store the returned reference.

## Buggy code

```rust
use std::collections::HashMap;

pub struct Cache {
    store: HashMap<String, String>,
}

impl Cache {
    pub fn new() -> Self {
        Cache { store: HashMap::new() }
    }

    // Inserts `value` if `key` is absent; returns a ref to the stored value.
    pub fn get_or_insert(&mut self, key: String, value: String) -> &String {
        self.store.entry(key).or_insert(value)
    }

    // Should return a reference that lives as long as `self`, not `default`.
    pub fn resolve(&mut self, key: &str, default: &str) -> &str {
        self.get_or_insert(key.to_owned(), default.to_owned())
    }
}
```
