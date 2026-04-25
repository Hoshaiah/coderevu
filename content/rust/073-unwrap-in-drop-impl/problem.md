---
slug: unwrap-in-drop-impl
track: rust
orderIndex: 73
title: Panic Inside Drop Implementation
difficulty: medium
tags:
  - errors
  - ownership
  - panic-safety
language: rust
---

## Context

This is `src/io/temp_file.rs`. `TempFile` wraps a `NamedTempFile`-style handle: it creates a temporary file on construction and deletes it on drop. The `Drop` impl calls `std::fs::remove_file` and unwraps the result so any filesystem error is "visible" during development.

In production, under high disk pressure, the temporary file is sometimes already gone by the time `Drop` runs (another cleanup process races with the app). This causes a panic inside `Drop`. Panicking inside `Drop` while another panic is already in flight triggers a double panic, which aborts the process with a hard crash and no useful backtrace.

The on-call engineer confirmed it by correlating disk-full events with the crash timing. The fix should log the error instead of panicking.

## Buggy code

```rust
use std::path::{Path, PathBuf};

pub struct TempFile {
    path: PathBuf,
}

impl TempFile {
    pub fn create(dir: &Path, prefix: &str) -> std::io::Result<Self> {
        let path = dir.join(format!("{}_{}.tmp", prefix, std::process::id()));
        std::fs::File::create(&path)?;
        Ok(TempFile { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        // BUG: unwrap() panics if remove_file fails (e.g. file already deleted).
        // Panicking inside Drop during stack unwinding causes a process abort.
        std::fs::remove_file(&self.path).unwrap();
    }
}
```
