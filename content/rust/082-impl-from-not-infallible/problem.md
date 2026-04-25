---
slug: impl-from-not-infallible
track: rust
orderIndex: 82
title: Panicking Logic Inside From Impl
difficulty: medium
tags:
  - errors
  - ownership
  - api-misuse
language: rust
---

## Context

This code is in `src/model/user_id.rs`, part of a REST API service. `UserId` is a newtype wrapper around a `u64` that enforces a non-zero invariant. The `From<&str>` implementation is used throughout the codebase with `.into()` calls — including in request deserialization paths that handle untrusted user input.

The service crashes with a panic roughly once per day. The panic message is `invalid user id: '0'` and the stack trace leads back into the JSON deserialization layer. The crash is triggered when an API client sends `"user_id": "0"` in a POST body.

The team correctly identified that zero is invalid, but chose `From` instead of `TryFrom` for the conversion, which contracts the entire error-handling path and makes panics inevitable for bad input.

## Buggy code

```rust
use std::num::ParseIntError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UserId(u64);

impl UserId {
    pub fn value(self) -> u64 { self.0 }
}

// BUG: From is supposed to be infallible. Panicking here is wrong.
impl From<&str> for UserId {
    fn from(s: &str) -> Self {
        let n: u64 = s.parse().expect("user id must be a valid integer");
        if n == 0 {
            panic!("invalid user id: {:?}", s);
        }
        UserId(n)
    }
}

pub fn parse_user_id(s: &str) -> UserId {
    s.into()
}
```
