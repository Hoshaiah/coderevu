---
slug: read-buf-not-cleared-between-calls
track: rust
orderIndex: 86
title: Read Buffer Stale on Short Read
difficulty: medium
tags:
  - errors
  - io
  - correctness
  - resource-management
language: rust
---

## Context

`src/protocol/reader.rs` reads fixed-size 32-byte command packets from a TCP stream. Each packet is decoded by deserializing the raw bytes. The buffer is declared once outside the loop and reused across reads to avoid allocating on every packet, which is a common optimization in high-throughput I/O code.

Operators see sporadic command misinterpretation: a command that should be a short 10-byte payload is occasionally decoded as if it contained data from a previous packet's tail. The bug is intermittent and correlates with the previous packet being larger than the current one. It does not appear in unit tests because those tests always send exactly 32-byte-aligned packets.

The team has confirmed that the TCP stream itself is not corrupted — a Wireshark capture shows the correct bytes on the wire. The issue is purely in the reading and processing logic in this file.

## Buggy code

```rust
use std::io::{self, Read};

pub fn read_commands<R: Read>(mut stream: R) -> io::Result<Vec<Vec<u8>>> {
    let mut results = Vec::new();
    let mut buf = [0u8; 32];

    loop {
        let n = stream.read(&mut buf)?;
        if n == 0 {
            break; // EOF
        }
        // Process exactly the bytes that were read.
        results.push(buf[..n].to_vec());
    }
    Ok(results)
}
```
