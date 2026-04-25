---
slug: string-from-utf8-unchecked-on-error
track: rust
orderIndex: 72
title: Unchecked UTF-8 Conversion Silences Error
difficulty: medium
tags:
  - errors
  - safety
  - encoding
language: rust
---

## Context

This function is in `src/protocol/decode.rs`, a binary protocol decoder for a message bus. Incoming frames contain a UTF-8 encoded topic name followed by a payload. The topic must be valid UTF-8; if it is not, the frame should be rejected with a decode error.

In production, malformed frames with invalid UTF-8 topic bytes occasionally crash downstream consumers with a panic when they try to use the topic string. The decoder itself reports success. Memory-safety issues aside, the panics cause consumer groups to restart, creating brief gaps in message processing.

A developer found that the decode function was written with a `match` on `std::str::from_utf8` but was later "optimized" by someone who thought the unsafe version would be faster for a hot path. The safety precondition for the unsafe function is not upheld.

## Buggy code

```rust
use std::fmt;

#[derive(Debug)]
pub enum DecodeError {
    InvalidUtf8,
    UnexpectedEof,
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DecodeError::InvalidUtf8 => write!(f, "invalid UTF-8 in topic"),
            DecodeError::UnexpectedEof => write!(f, "unexpected end of frame"),
        }
    }
}

pub fn decode_topic(frame: &[u8]) -> Result<&str, DecodeError> {
    let len = *frame.first().ok_or(DecodeError::UnexpectedEof)? as usize;
    let bytes = frame.get(1..1 + len).ok_or(DecodeError::UnexpectedEof)?;
    // BUG: from_utf8_unchecked skips validation; if `bytes` contains
    // invalid UTF-8 the returned &str is undefined behavior.
    Ok(unsafe { std::str::from_utf8_unchecked(bytes) })
}
```
