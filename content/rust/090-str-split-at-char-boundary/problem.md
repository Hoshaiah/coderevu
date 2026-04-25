---
slug: str-split-at-char-boundary
track: rust
orderIndex: 90
title: String Slice at Non-Char Boundary
difficulty: hard
tags:
  - errors
  - correctness
  - unicode
language: rust
---

## Context

This function is in `src/util/truncate.rs`. It's used throughout a content-management system to truncate user-provided display names to a maximum byte length before storing them in a fixed-width database column. The function is called on every account creation and profile-update request.

The service panics intermittently with `byte index N is not a char boundary`. The panic only occurs when users register with names containing multi-byte Unicode characters such as emoji, CJK characters, or accented letters. ASCII-only names are never affected. The panic brings down the entire request handler thread.

The team knows it's a Unicode issue but the fix attempt — adding `.chars().take(max_bytes)` — produces strings that are too short (it limits *characters*, not bytes) without eliminating the panic.

## Buggy code

```rust
/// Truncates `s` to at most `max_bytes` bytes, preserving UTF-8 validity.
/// BUG: panics if `max_bytes` falls in the middle of a multi-byte character.
pub fn truncate_to_bytes(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    &s[..max_bytes]
}
```
