---
slug: impl-display-infinite-recursion
track: rust
orderIndex: 76
title: Display Calls Itself Recursively
difficulty: medium
tags:
  - errors
  - api-misuse
  - traits
language: rust
---

## Context

This snippet is in `src/errors/app_error.rs`. `AppError` is the crate-wide error type, used throughout request handlers to produce human-readable messages in API responses and log lines. The `Display` impl is meant to delegate to the inner `message` string.

In production, certain error paths cause the process to crash with a stack overflow. The crash only happens when the error is being serialised for logging — not when it is constructed. `RUST_BACKTRACE=1` shows hundreds of frames, all `<AppError as Display>::fmt`, before hitting the OS stack limit.

The developer suspected a recursive data structure but confirmed `AppError` doesn't contain another `AppError`. The recursion is in the formatting logic itself.

## Buggy code

```rust
use std::fmt;

pub struct AppError {
    pub code: u32,
    pub message: String,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "error {}: {}", self.code, self)
    }
}

impl fmt::Debug for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AppError {{ code: {}, message: {:?} }}", self.code, self.message)
    }
}
```
