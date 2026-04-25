---
slug: index-out-of-bounds-after-split
track: rust
orderIndex: 65
title: Off-by-One After String Split
difficulty: easy
tags:
  - errors
  - strings
  - panics
language: rust
---

## Context

This parsing function lives in `src/config/parser.rs`. It reads key-value lines of the form `KEY=VALUE` from a configuration file and returns a `(String, String)` pair. It is called by the startup routine for every line in a multi-hundred-line config file.

In production the service panics on startup approximately once a week with `index out of bounds: the len is 1 but the index is 1`. The panic always originates in `parse_kv_line` and the offending config line always turns out to be a comment line (starting with `#`) or a blank line that was not filtered out before calling this function.

The team added a comment saying "caller must ensure non-empty, non-comment lines" but did not add an error return.

## Buggy code

```rust
pub fn parse_kv_line(line: &str) -> (String, String) {
    let parts: Vec<&str> = line.splitn(2, '=').collect();
    let key = parts[0].trim().to_owned();
    let value = parts[1].trim().to_owned();
    (key, value)
}
```
