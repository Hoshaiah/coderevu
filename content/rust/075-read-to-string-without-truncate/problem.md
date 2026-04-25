---
slug: read-to-string-without-truncate
track: rust
orderIndex: 75
title: Stale Data After Repeated Read
difficulty: medium
tags:
  - errors
  - io
  - file-handling
language: rust
---

## Context

This function is in `src/hot_reload/watcher.rs`. A configuration watcher polls a TOML file every 5 seconds and re-parses it if the mtime has changed. The `String` buffer is reused across calls to avoid allocating on every tick. The function is called in a `loop` inside a background thread.

Operators reported that after a configuration update is applied correctly, a subsequent update that makes the file *shorter* is silently ignored — the system keeps the values from the longer previous version. Logs show that the watcher does detect the mtime change and calls the parse path, so the file is being re-read.

The developer already verified that the file on disk is correct after each edit. Adding a `println!` of `contents` after the read revealed that the buffer contains the new file content padded with leftover bytes from the previous (longer) read.

## Buggy code

```rust
use std::fs::File;
use std::io::{self, Read};

pub fn reload_config(path: &str, buf: &mut String) -> io::Result<String> {
    let mut file = File::open(path)?;
    file.read_to_string(buf)?;
    Ok(buf.clone())
}

pub fn watch_loop(path: &str) {
    let mut buf = String::new();
    loop {
        match reload_config(path, &mut buf) {
            Ok(contents) => println!("Config: {}", contents),
            Err(e) => eprintln!("Error: {}", e),
        }
        std::thread::sleep(std::time::Duration::from_secs(5));
    }
}
```
