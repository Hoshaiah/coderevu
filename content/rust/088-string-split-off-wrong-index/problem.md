---
slug: string-split-off-wrong-index
track: rust
orderIndex: 88
title: split_off Byte Index Not Char
difficulty: medium
tags:
  - errors
  - ownership
  - unicode
language: rust
---

## Context

This is in `src/text/truncate.rs`. The `truncate_to_chars` function is supposed to cut a `String` down to at most `max_chars` Unicode scalar values. It's used in the notification service to trim user-supplied display names before storing them.

In production, the service occasionally panics with `byte index N is not a char boundary` when users supply names containing multi-byte characters such as emoji or CJK ideographs. The function works correctly for ASCII-only input, which is why it passed QA. The bug was only discovered when an internationalization team ran a stress test with non-ASCII fixtures.

A teammate tried switching from `split_off` to a slice but hit the same panic. The underlying issue is that the code computes a byte index using `char_indices` but then uses it incorrectly.

## Buggy code

```rust
/// Truncates `s` in place to at most `max_chars` Unicode scalar values.
pub fn truncate_to_chars(s: &mut String, max_chars: usize) {
    if s.chars().count() <= max_chars {
        return;
    }
    // Find the byte index of the max_chars-th character.
    let byte_index = s
        .char_indices()
        .nth(max_chars)
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    // split_off returns the tail; we want to keep the head.
    let _tail = s.split_off(byte_index);
}
```
