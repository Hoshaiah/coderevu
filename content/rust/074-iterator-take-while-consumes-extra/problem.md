---
slug: iterator-take-while-consumes-extra
track: rust
orderIndex: 74
title: take_while Discards Boundary Element
difficulty: medium
tags:
  - errors
  - iterators
  - correctness
language: rust
---

## Context

This is `src/stream/frame.rs`. A network framing codec reads a stream of bytes from a `VecDeque<u8>` and assembles them into frames delimited by a `0xFF` sentinel byte. After collecting a frame's bytes, the sentinel must be consumed and the remaining bytes left in the queue for the next frame.

In testing, frames decode correctly but every other frame is silently dropped. When two frames arrive back-to-back the second frame starts with data from the third. The engineering team traced this to the byte consumption loop.

`take_while` was chosen because it reads until the sentinel, but the team did not realize `take_while` internally calls `next()` one extra time on the underlying iterator (to see the sentinel and determine it should stop), consuming that element without returning it — and since the iterator is a `by_ref()` adapter, the sentinel is gone from the queue.

## Buggy code

```rust
use std::collections::VecDeque;

pub struct FrameDecoder {
    buf: VecDeque<u8>,
}

impl FrameDecoder {
    pub fn new() -> Self {
        FrameDecoder { buf: VecDeque::new() }
    }

    pub fn feed(&mut self, data: &[u8]) {
        self.buf.extend(data);
    }

    /// Returns the next complete frame (bytes before 0xFF), or None.
    pub fn next_frame(&mut self) -> Option<Vec<u8>> {
        if !self.buf.contains(&0xFF) {
            return None;
        }
        // BUG: take_while consumes the 0xFF sentinel by peeking at it,
        // but does NOT return it. The sentinel is lost from `self.buf`.
        let frame: Vec<u8> = self.buf.iter().copied().take_while(|&b| b != 0xFF).collect();
        // Drain only the frame bytes — the 0xFF was already consumed by take_while.
        self.buf.drain(..frame.len());
        Some(frame)
    }
}
```
