---
slug: borrowed-value-escapes-match-arm
track: rust
orderIndex: 10
title: Temporary Dropped Mid-Match
difficulty: medium
tags:
  - lifetimes
  - borrowing
  - ownership
language: rust
---

## Context

This snippet is from `src/config/loader.rs`. A configuration loader reads environment variables and falls back to a default string literal when a variable is absent. The result is stored as a `&str` slice that is passed down to an HTTP client builder.

The code fails to compile with: `error[E0716]: temporary value dropped while borrowed`. The developer cannot figure out why — the match looks symmetric: both arms produce a `&str`, and the successful arm returns a reference to a `String` owned by the environment, which seems fine.

Swapping to `String` everywhere was suggested as a fix, but the downstream API only accepts `&str` and the team wants to avoid changing it.

## Buggy code

```rust
use std::env;

pub fn get_base_url() -> &'static str {
    let url: &str = match env::var("BASE_URL") {
        Ok(val) => &val,
        Err(_) => "http://localhost:8080",
    };
    url
}

pub fn build_client_url(path: &str) -> String {
    let base = get_base_url();
    format!("{}/{}", base, path)
}
```
