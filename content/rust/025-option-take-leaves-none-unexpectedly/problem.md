---
slug: option-take-leaves-none-unexpectedly
track: rust
orderIndex: 25
title: 'Option::take Empties Field Silently'
difficulty: easy
tags:
  - ownership
  - option
  - correctness
language: rust
---

## Context

This struct lives in `src/session/manager.rs` and represents an authenticated user session. It holds an optional token that gets consumed exactly once when the session is finalized and handed off to the audit log. The method `finalize` is called at the end of every HTTP request handler that requires authentication.

Operators started noticing that the audit log occasionally contains blank tokens for sessions that definitely authenticated successfully. After adding more logging they found the blank entries always correspond to requests where `display_token` was called before `finalize` — for example in a debug middleware layer that logs session state early in the request lifecycle.

The team ruled out threading issues (sessions are never shared across threads) and double-finalization (there are guards against that). The bug is purely in this file.

## Buggy code

```rust
pub struct Session {
    pub user_id: u64,
    token: Option<String>,
}

impl Session {
    pub fn new(user_id: u64, token: String) -> Self {
        Session {
            user_id,
            token: Some(token),
        }
    }

    /// Returns the token for display/logging purposes.
    pub fn display_token(&mut self) -> Option<String> {
        self.token.take()
    }

    /// Consumes the token and returns it for audit logging.
    pub fn finalize(&mut self) -> Option<String> {
        self.token.take()
    }
}
```
