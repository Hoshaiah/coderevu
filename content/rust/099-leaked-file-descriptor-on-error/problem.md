---
slug: leaked-file-descriptor-on-error
track: rust
orderIndex: 99
title: File descriptor leak when `write_all` fails partway through processing a batch
difficulty: medium
tags:
  - resource-management
  - error-handling
  - io
  - drop
language: rust
---

## Context

This function is part of a nightly batch job that writes audit records to disk. On filesystems with limited inodes or when the disk fills up, the team observed that the process eventually ran out of file descriptors and crashed, even though the job was retried. Each failed run was leaking one fd.

## Buggy code

```rust
use std::fs::File;
use std::io::{self, Write};

pub fn write_audit_records(path: &str, records: &[String]) -> io::Result<()> {
    let mut file = File::create(path)?;

    for record in records {
        let line = format!("{record}\n");
        if let Err(e) = file.write_all(line.as_bytes()) {
            eprintln!("Failed to write record: {e}");
            std::mem::forget(file);
            return Err(e);
        }
    }

    file.flush()?;
    Ok(())
}
```
