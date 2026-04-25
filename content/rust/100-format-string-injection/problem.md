---
slug: format-string-injection
track: rust
orderIndex: 100
title: >-
  User-controlled format string passed directly to a logging macro enables log
  injection
difficulty: medium
tags:
  - security
  - logging
  - format-strings
language: rust
---

## Context

This HTTP handler logs incoming requests for audit purposes. The team reports that a security pen-test flagged it for log injection: an attacker can craft a `User-Agent` header containing newlines and fake log entries, contaminating the audit log and potentially fooling log-analysis tools.

## Buggy code

```rust
use std::collections::HashMap;

fn handle_request(headers: &HashMap<String, String>) {
    let user_agent = headers
        .get("User-Agent")
        .map(|s| s.as_str())
        .unwrap_or("unknown");

    // Audit log — sent to a centralized log aggregator
    println!(user_agent);

    // ... rest of handler
}
```
