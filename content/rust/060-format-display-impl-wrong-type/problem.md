---
slug: format-display-impl-wrong-type
track: rust
orderIndex: 60
title: Display Delegates to Wrong Field
difficulty: easy
tags:
  - errors
  - ownership
  - formatting
language: rust
---

## Context

This struct is defined in `src/models/user_id.rs`. It wraps a raw integer user ID with a newtype so that IDs cannot be accidentally confused with other integer quantities. The `Display` implementation is meant to render the inner ID number so it can be embedded in log messages and API responses.

QA noticed that all user IDs in logs appear as `UserId(42)` instead of the bare number `42`. The format strings in the log macros look correct; the issue is in the `Display` impl itself.

A code search shows the same pattern is repeated for `OrderId` and `ProductId` in nearby files, so fixing it in one place informs the broader fix.

## Buggy code

```rust
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(pub u64);

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

pub fn format_log_line(user_id: UserId, message: &str) -> String {
    format!("[user={}] {}", user_id, message)
}
```
