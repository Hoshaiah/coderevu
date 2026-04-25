---
slug: slice-split-at-mid-panic
track: rust
orderIndex: 54
title: Unchecked split_at Boundary
difficulty: easy
tags:
  - errors
  - panics
  - slices
language: rust
---

## Context

This snippet is in `src/codec/framer.rs`, part of a binary protocol decoder. Incoming bytes arrive over a TCP stream and are buffered; the framer is called whenever new bytes are appended. Each frame is prefixed with a 2-byte little-endian length field followed by that many bytes of payload.

Under normal load everything works. But periodically — especially during burst traffic — the service panics with `index out of bounds: the len is N but the index is M`. The panic originates from inside `decode_frame`. Restarting the service clears the backlog, so the bug is not persistent, but each crash drops all in-flight connections.

The developer added logging and confirmed the panic happens on the `split_at` call when the buffer holds fewer bytes than the declared payload length — a perfectly normal situation when a frame arrives in multiple TCP segments.

## Buggy code

```rust
pub fn decode_frame(buf: &[u8]) -> Option<(&[u8], &[u8])> {
    // Need at least 2 bytes for the length prefix
    if buf.len() < 2 {
        return None;
    }

    let payload_len = u16::from_le_bytes([buf[0], buf[1]]) as usize;

    // Split off the header, then split the payload
    let (_, rest) = buf.split_at(2);
    let (payload, remainder) = rest.split_at(payload_len);

    Some((payload, remainder))
}
```
