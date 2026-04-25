---
slug: returning-reference-to-local
track: rust
orderIndex: 6
title: Reference Outlives Local String
difficulty: easy
tags:
  - lifetimes
  - ownership
  - strings
language: rust
---

## Context

This helper lives in `src/config/parser.rs` and is responsible for extracting a default username from a configuration map. The surrounding code passes the returned `&str` to a logging subsystem that stores it for the session lifetime.

The code fails to compile with a lifetime error. A junior developer tried adding `'static` to the return type to make it compile, but that caused a different error. The symptom is a hard compiler rejection — the function simply cannot be called.

The root cause is subtle: the function builds a new `String` from owned data and then tries to hand out a reference to that temporary, but the temporary is dropped at the end of the function body before the reference can escape.

## Buggy code

```rust
use std::collections::HashMap;

pub fn get_default_user<'a>(config: &'a HashMap<String, String>) -> &'a str {
    if let Some(user) = config.get("default_user") {
        user.as_str()
    } else {
        let fallback = String::from("anonymous");
        fallback.as_str()
    }
}
```
