---
slug: to-string-via-display-recursion
track: rust
orderIndex: 78
title: ToString Recursion via Display
difficulty: medium
tags:
  - errors
  - api-misuse
  - traits
language: rust
---

## Context

This code is in `src/types/currency.rs`. The `Amount` type wraps a fixed-point integer (cents) and is meant to format itself as a human-readable dollar string like `"$12.34"`. The team uses `.to_string()` heavily throughout the codebase when building API response bodies.

In production, requests that return any monetary value cause a stack overflow. The crash shows a very deep call stack with repeated frames of `<Amount as Display>::fmt` and `to_string`. This was not caught in unit tests because the tests compared `Display` output using `format!("{}", amount)` rather than `.to_string()`.

The stack overflow is not caused by recursive data structures or infinite loops in business logic — the recursion is entirely within the formatting machinery.

## Buggy code

```rust
use std::fmt;

pub struct Amount {
    cents: i64,
}

impl Amount {
    pub fn new(cents: i64) -> Self {
        Amount { cents }
    }

    pub fn dollars(&self) -> i64 {
        self.cents / 100
    }

    pub fn remaining_cents(&self) -> i64 {
        self.cents.abs() % 100
    }
}

impl fmt::Display for Amount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Bug: calls self.to_string() inside Display::fmt,
        // which calls Display::fmt again — infinite recursion.
        let s = self.to_string();
        write!(f, "{}", s)
    }
}
```
