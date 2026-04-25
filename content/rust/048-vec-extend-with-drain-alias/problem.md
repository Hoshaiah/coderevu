---
slug: vec-extend-with-drain-alias
track: rust
orderIndex: 48
title: Drain Alias on Same Vec
difficulty: hard
tags:
  - ownership
  - borrowing
  - vec
language: rust
---

## Context

This is in `src/pipeline/buffer.rs`. The `flush_ready` method is supposed to move all 'ready' items from a staging buffer into an output buffer, leaving unready items in the staging buffer. It's part of a streaming pipeline that batches work.

The code does not compile. A junior developer wrote it expecting that `drain` on a `Vec` while using `extend` into the same `Vec` would work similarly to `retain`, since both operations modify a `Vec` in place. They got a confusing error about simultaneous mutable borrows and asked the senior to fix it.

The senior also tried calling `self.buf.extend(self.buf.drain(...))` and hit the same error. The fix requires rethinking the data flow slightly.

## Buggy code

```rust
pub struct PipelineBuffer {
    /// Items not yet ready are kept at the front; ready items are at the back.
    buf: Vec<u64>,
    ready_threshold: u64,
}

impl PipelineBuffer {
    pub fn new(threshold: u64) -> Self {
        PipelineBuffer { buf: Vec::new(), ready_threshold: threshold }
    }

    pub fn push(&mut self, item: u64) {
        self.buf.push(item);
    }

    /// Move all items >= threshold into `out`, keep the rest in `self.buf`.
    pub fn flush_ready(&mut self, out: &mut Vec<u64>) {
        let ready: Vec<u64> = self.buf
            .drain(..)
            .filter(|&x| x >= self.ready_threshold)
            .collect();
        let not_ready: Vec<u64> = self.buf
            .drain(..)
            .filter(|&x| x < self.ready_threshold)
            .collect();
        out.extend(ready);
        self.buf.extend(not_ready);
    }
}
```
