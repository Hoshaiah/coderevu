---
slug: into-iter-on-ref-vec-yields-refs
track: rust
orderIndex: 27
title: into_iter on Ref Yields References
difficulty: easy
tags:
  - ownership
  - iteration
  - borrowing
language: rust
---

## Context

This is in `src/export/csv_writer.rs`. The `write_rows` function takes a slice of `Row` structs and writes them as CSV lines to a writer. Each `Row` contains a `Vec<String>` of fields. The function is called from a background export job.

A developer changed the function signature from taking a `Vec<Row>` to taking `&[Row]` to avoid an unnecessary clone at the call site. After the change the code started emitting wrong output: instead of field values, the CSV contained things like `"[\"foo\", \"bar\"]"` — debug-formatted Vec representations — and the integration tests caught it immediately.

The developer expected that iterating over a `&[Row]` and calling `.into_iter()` on each row's `fields` would yield `String` values, but it yields `&String` references instead, which changes how the format string works.

## Buggy code

```rust
use std::io::{self, Write};

pub struct Row {
    pub fields: Vec<String>,
}

pub fn write_rows<W: Write>(writer: &mut W, rows: &[Row]) -> io::Result<()> {
    for row in rows {
        // Intended: join fields with commas and write a line.
        let line = row.fields
            .iter()
            .map(|f| format!("{:?}", f))
            .collect::<Vec<_>>()
            .join(",");
        writeln!(writer, "{}", line)?;
    }
    Ok(())
}
```
