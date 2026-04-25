---
slug: error-silently-discarded-question-mark
track: rust
orderIndex: 70
title: Infallible Conversion Hides Error
difficulty: medium
tags:
  - errors
  - type-conversion
  - api-misuse
language: rust
---

## Context

This function lives in `src/ingest/reader.rs` and parses a CSV row's numeric field into a typed `Record` struct. It is called for every row in a multi-gigabyte daily import job. The results are written to a Postgres database; any parse failure should abort the row and log a warning.

In production, rows with malformed numeric fields (e.g. the string `"N/A"`) are silently inserted into the database with the value `0` instead of being skipped. The import job reports success, but data scientists downstream notice the spurious zeros days later.

A developer checked the `?` operator usage and assumed errors were propagating correctly. The type signatures all look right at a glance. The bug is in how the fallback value is produced when parsing fails.

## Buggy code

```rust
use std::num::ParseIntError;

#[derive(Debug)]
pub struct Record {
    pub id: u64,
    pub amount: i64,
}

pub fn parse_record(id_str: &str, amount_str: &str) -> Result<Record, ParseIntError> {
    let id: u64 = id_str.trim().parse()?;
    // BUG: unwrap_or(0) swallows the parse error for `amount`.
    // The `?` never fires because unwrap_or converts Err into Ok(0).
    let amount: i64 = amount_str.trim().parse().unwrap_or(0);
    Ok(Record { id, amount })
}
```
