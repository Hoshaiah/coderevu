---
slug: integer-overflow-in-progress-calc
track: rust
orderIndex: 93
title: Progress percentage silently wraps to wrong value on large inputs
difficulty: easy
tags:
  - arithmetic
  - overflow
  - correctness
language: rust
---

## Context

This function is part of a file-upload progress reporter. It takes the number of bytes uploaded so far and the total file size, and returns a percentage from 0 to 100. In debug builds everything looks fine; in release builds, users uploading files larger than ~40 MB occasionally see the progress bar jump backwards.

## Buggy code

```rust
pub fn upload_progress_pct(uploaded: u32, total: u32) -> u32 {
    (uploaded * 100) / total
}
```
