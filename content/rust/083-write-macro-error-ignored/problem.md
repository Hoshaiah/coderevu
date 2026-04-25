---
slug: write-macro-error-ignored
track: rust
orderIndex: 83
title: Write! Error Silently Discarded
difficulty: medium
tags:
  - errors
  - io
  - resource-management
language: rust
---

## Context

This code is in `src/report/writer.rs`. A reporting service formats structured data into a text file using a `BufWriter` wrapping a `File`. The `write_report` function is called at the end of each batch job to persist results to disk before the job exits.

Operators occasionally find that output files exist but are empty or truncated, even though the job logs report success. The files are always created (so the `File::create` call works), but the content is missing. The issue reproduces reliably on a filesystem that has been filled to capacity.

The team added a `println!` after each `write!` call and confirmed those lines execute, which led them to believe the writes succeeded.

## Buggy code

```rust
use std::fs::File;
use std::io::{BufWriter, Write};

pub fn write_report(path: &str, lines: &[String]) -> std::io::Result<()> {
    let file = File::create(path)?;
    let mut writer = BufWriter::new(file);
    for line in lines {
        write!(writer, "{}\n", line);
    }
    Ok(())
}
```
