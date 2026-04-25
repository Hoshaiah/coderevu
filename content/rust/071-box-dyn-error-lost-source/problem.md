---
slug: box-dyn-error-lost-source
track: rust
orderIndex: 71
title: Error Source Chain Broken
difficulty: medium
tags:
  - errors
  - trait-objects
  - api-misuse
language: rust
---

## Context

This file is `src/api/client.rs`, a small HTTP client wrapper used across several microservices. It maps lower-level network and JSON errors into a unified `ClientError` type. Callers use `ClientError::source()` (from the standard `Error` trait) to walk the error chain for logging and alerting.

Operators report that structured error logs from the alerting system show `ClientError` but the underlying cause (e.g., a `serde_json::Error` or `hyper::Error`) is missing. The `source()` method always returns `None`, so the root cause is invisible in dashboards.

A developer confirmed that `std::error::Error::source` is not overridden in the `impl Error for ClientError` block. The `cause` field is stored as a `String` (via `.to_string()`) rather than as a boxed error, so the chain information is permanently lost at conversion time.

## Buggy code

```rust
use std::fmt;

#[derive(Debug)]
pub struct ClientError {
    pub message: String,
    // BUG: storing the cause as a String discards the original error
    // and breaks the std::error::Error source chain.
    pub cause: String,
}

impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.message, self.cause)
    }
}

impl std::error::Error for ClientError {}
// source() is not overridden, so it returns None.

pub fn wrap_error(msg: &str, err: impl std::error::Error + 'static) -> ClientError {
    ClientError {
        message: msg.to_string(),
        cause: err.to_string(), // loses the original error
    }
}
```
