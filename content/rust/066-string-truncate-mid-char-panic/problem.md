---
slug: string-truncate-mid-char-panic
track: rust
orderIndex: 66
title: Truncate Panics on Multibyte Char
difficulty: easy
tags:
  - errors
  - unicode
  - string
  - correctness
language: rust
---

## Context

`src/api/truncate.rs` is a small utility used throughout the REST API layer to clip user-supplied display names to a maximum of 16 bytes before storing them in the database. It was written quickly and tested only with ASCII inputs during initial development.

After the product launched in Japan, the on-call engineer received panics in production: `byte index 16 is not a char boundary; it is inside 'の' (bytes 15..18) of ...`. The stack trace points directly to `truncate_display_name`. All affected inputs are Japanese or Korean display names that contain multibyte UTF-8 characters.

A workaround of rejecting non-ASCII names was proposed and rejected by product. The fix must preserve valid UTF-8 and not panic.

## Buggy code

```rust
/// Clips `name` to at most `max_bytes` bytes.
/// The returned string is always valid UTF-8.
pub fn truncate_display_name(name: &str, max_bytes: usize) -> &str {
    if name.len() <= max_bytes {
        return name;
    }
    &name[..max_bytes]
}
```
