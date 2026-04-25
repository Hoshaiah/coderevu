---
slug: iterator-collect-into-wrong-error-type
track: rust
orderIndex: 77
title: collect() Silently Wraps Wrong Error
difficulty: medium
tags:
  - errors
  - iterators
  - type-inference
language: rust
---

## Context

This function is in `src/import/parser.rs`. It reads a list of raw string records and parses each one as an integer. The result is supposed to be `Err` if any record fails to parse, propagating the underlying `ParseIntError` to the caller so they can report which input was malformed.

In testing, passing a list that contains the string `"abc"` causes the function to return `Ok(vec![])` instead of an error. No parse errors are surfaced to the caller. The CI suite has a test for the happy path but not for the error path, so this shipped to production.

The developer tried adding `?` inside the closure and got a type error. They then switched to `filter_map` to "ignore bad values", which explains the silent discard, but the original intent was to fail fast on any bad record.

## Buggy code

```rust
use std::num::ParseIntError;

pub fn parse_records(records: &[&str]) -> Result<Vec<i32>, ParseIntError> {
    let values: Vec<i32> = records
        .iter()
        .filter_map(|s| s.parse::<i32>().ok())
        .collect();
    Ok(values)
}
```
