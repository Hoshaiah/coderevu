---
slug: result-ignored-in-write
track: rust
orderIndex: 89
title: Write Error Silently Discarded
difficulty: hard
tags:
  - errors
  - ownership
  - io
language: rust
---

## Context

This function is in `src/export/csv_writer.rs` and streams rows of a report to a file. It is called at the end of a nightly batch job that produces financial summaries. The function signature returns `()` rather than a `Result` because an early version of the API was designed to be "fire and forget".

Several times a month, the downstream file-transfer process reports truncated CSV files. The file always exists and has some content, so the monitoring check that verifies file existence passes. Only when the transfer system parses the CSV does it detect missing rows near the end.

The infrastructure team has ruled out disk-full events (plenty of space) and network filesystem issues (local disk). A thorough audit of the write path reveals the bug.

## Buggy code

```rust
use std::fs::File;
use std::io::{BufWriter, Write};

pub struct Row {
    pub id: u64,
    pub amount: f64,
    pub label: String,
}

pub fn write_report(path: &str, rows: &[Row]) {
    let file = File::create(path).expect("failed to create report file");
    let mut writer = BufWriter::new(file);

    for row in rows {
        let _ = writeln!(
            writer,
            "{},{},{}",
            row.id, row.amount, row.label
        );
    }
}
```
