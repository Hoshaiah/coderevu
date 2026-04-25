---
slug: vec-retain-wrong-predicate-direction
track: rust
orderIndex: 55
title: Retain Predicate Removes Wrong Elements
difficulty: easy
tags:
  - errors
  - correctness
  - collections
language: rust
---

## Context

This function is in `src/session/cleanup.rs`. An HTTP session store prunes expired sessions during a background cleanup pass. Each `Session` has an `expires_at` Unix timestamp. The function is supposed to remove sessions that have expired (i.e., `expires_at < now`) and keep the rest.

After deploying, operators noticed the opposite of what was intended: all active sessions are being dropped and expired sessions are being kept. Users are getting logged out constantly, while stale sessions accumulate in memory. There are no panics or compilation errors.

The developer confirmed the `now` value is correct and the `expires_at` fields are populated correctly. The bug is purely in the filter logic.

## Buggy code

```rust
pub struct Session {
    pub id: String,
    pub expires_at: u64,
}

pub fn prune_expired(sessions: &mut Vec<Session>, now: u64) {
    // Remove sessions that have expired
    sessions.retain(|s| s.expires_at < now);
}
```
