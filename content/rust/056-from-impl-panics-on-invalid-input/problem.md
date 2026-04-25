---
slug: from-impl-panics-on-invalid-input
track: rust
orderIndex: 56
title: From Impl Panics on Bad Input
difficulty: easy
tags:
  - errors
  - api-misuse
  - traits
language: rust
---

## Context

This code is in `src/types/port.rs`. The `Port` type wraps a `u16` and enforces that port numbers are in the range 1–65535 (rejecting 0). The `From<u16>` implementation is supposed to be a convenient constructor used throughout the codebase when building socket addresses from config.

In production, providing a port of `0` in the config file causes the process to crash with a panic message rather than returning a descriptive error to the operator. The crash happens deep in the startup sequence and leaves no useful error in the application log — only the panic backtrace.

The team considered removing the validation, but the real fix is to implement the right trait. `From` is guaranteed infallible by convention; fallible conversions should use `TryFrom`.

## Buggy code

```rust
use std::convert::From;

#[derive(Debug, Clone, Copy)]
pub struct Port(u16);

impl Port {
    pub fn value(self) -> u16 {
        self.0
    }
}

// Bug: From is documented as infallible. Using it for a conversion
// that can fail (port == 0 is invalid) and panicking instead of
// returning an error violates the trait contract and gives callers
// no way to handle the failure gracefully.
impl From<u16> for Port {
    fn from(n: u16) -> Self {
        if n == 0 {
            panic!("port 0 is invalid");
        }
        Port(n)
    }
}

pub fn make_port(raw: u16) -> Port {
    Port::from(raw)
}
```
