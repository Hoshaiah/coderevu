---
slug: box-slice-len-off-by-one-alloc
track: rust
orderIndex: 38
title: Box Slice Capacity Shorter Than Data
difficulty: medium
tags:
  - ownership
  - allocation
  - correctness
  - memory
language: rust
---

## Context

`src/codec/frame.rs` serializes outgoing protocol frames into a `Box<[u8]>` for zero-copy sending over a TCP socket. The frame format is: 4-byte big-endian length prefix followed by the payload bytes. The function `encode_frame` is called in the hot path of a high-throughput message broker.

In production, a small fraction of frames are corrupted on the receiving end: the last byte of the payload is missing and instead the receiver reads a zero byte. The corruption is deterministic — any payload whose length is a multiple of 4 is always affected. The issue was spotted during a compatibility test with a strict receiver implementation.

Replacing `Box<[u8]>` with `Vec<u8>` as a workaround was tried and confirmed to fix the corruption, which narrows the bug to the allocation or writing logic in `encode_frame`.

## Buggy code

```rust
pub fn encode_frame(payload: &[u8]) -> Box<[u8]> {
    let payload_len = payload.len();
    let total_len = 4 + payload_len;

    // Allocate a zeroed buffer of the right size.
    let mut buf: Vec<u8> = vec![0u8; total_len - 1];

    // Write the 4-byte big-endian length prefix.
    let len_bytes = (payload_len as u32).to_be_bytes();
    buf[0..4].copy_from_slice(&len_bytes);

    // Write the payload.
    buf[4..4 + payload_len].copy_from_slice(payload);

    buf.into_boxed_slice()
}
```
