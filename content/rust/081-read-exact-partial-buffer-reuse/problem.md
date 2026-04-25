---
slug: read-exact-partial-buffer-reuse
track: rust
orderIndex: 81
title: Stale Buffer Data on Short Read
difficulty: medium
tags:
  - errors
  - io
  - correctness
language: rust
---

## Context

This function lives in `src/protocol/reader.rs` in a network daemon that receives fixed-size binary frames from a TCP stream. Each frame is 64 bytes. The function is called in a tight loop by the connection handler task.

Under load, approximately 1-in-5000 frames is silently corrupted: the parsed values are garbage that don't correspond to any legitimate message the client sent. The corruption rate increases on high-latency connections. Wireshark confirms the bytes on the wire are correct.

The team suspects OS buffering but has ruled out endianness — the issue appears in the first few fields of the struct, not later ones. The real problem is in how the buffer is initialised between calls.

## Buggy code

```rust
use std::io::{self, Read};

const FRAME_SIZE: usize = 64;

pub struct Frame {
    pub kind: u8,
    pub seq:  u32,
    pub payload: [u8; 59],
}

pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Frame> {
    let mut buf = [0u8; FRAME_SIZE];
    let n = reader.read(&mut buf)?;
    if n != FRAME_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "short read",
        ));
    }
    Ok(Frame {
        kind:    buf[0],
        seq:     u32::from_be_bytes([buf[1], buf[2], buf[3], buf[4]]),
        payload: buf[5..64].try_into().unwrap(),
    })
}
```
