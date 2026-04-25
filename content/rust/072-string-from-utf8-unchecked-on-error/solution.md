## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Unchecked UTF-8 Conversion Silences Error
// ------------------------------------------------------------------------

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
    // CHANGE 1: Replace from_utf8_unchecked with the safe from_utf8, which validates the bytes and returns an Err on invalid UTF-8 instead of producing undefined behavior.
    // CHANGE 2: Map the Utf8Error returned by from_utf8 to DecodeError::InvalidUtf8 so callers receive a typed error for malformed frames rather than a silent Ok.
    std::str::from_utf8(bytes).map_err(|_| DecodeError::InvalidUtf8)
}
```

## Explanation

### Issue 1: Unsafe UTF-8 conversion causes undefined behavior

**Problem:** `std::str::from_utf8_unchecked` requires the caller to guarantee the bytes are valid UTF-8. Nothing in this function checks that precondition. When a frame arrives with invalid UTF-8 bytes in the topic field, the returned `&str` references memory that violates Rust's string invariant, producing undefined behavior. Downstream code that reads or prints the topic can panic or corrupt memory.

**Fix:** Replace the `unsafe { std::str::from_utf8_unchecked(bytes) }` call with `std::str::from_utf8(bytes)` at the `CHANGE 1` site. The safe version validates every byte before constructing the `&str`, so no unsafe block is needed and the string invariant is always upheld.

**Explanation:** Rust's `&str` type carries a hard guarantee: every byte sequence it points to is valid UTF-8. `from_utf8_unchecked` bypasses the check that enforces this guarantee. If the bytes contain a sequence like `0xFF 0xFE`, the resulting `&str` is a lie — it points to bytes that are not valid UTF-8. Any code that iterates the string's characters, computes its length in chars, or passes it to a formatting macro may panic or misread memory. `from_utf8` performs an O(n) scan of the bytes, which is the same work the downstream consumer would do anyway; the "optimization" saves nothing and breaks correctness. A related pitfall: even if most frames in production are valid, a single malicious or corrupted frame can trigger the bug, so the unsafe path is never safe to take here.

---

### Issue 2: Malformed frames reported as success instead of error

**Problem:** Because the original code always wraps the result in `Ok(...)`, a frame with invalid UTF-8 topic bytes produces `Ok(<garbage str>)` instead of an error. Callers have no way to know the frame was malformed, so they process it as if it were good data, which is what causes downstream consumer groups to panic and restart.

**Fix:** At the `CHANGE 2` site, chain `.map_err(|_| DecodeError::InvalidUtf8)` onto the `from_utf8` call. This converts `from_utf8`'s `Utf8Error` into the decoder's own `DecodeError::InvalidUtf8` variant and propagates it as `Err(...)` to the caller.

**Explanation:** The function's return type is `Result<&str, DecodeError>`, which is the right shape for signaling both success and failure. The original code never exercised the `Err` path for UTF-8 problems — it always said `Ok`. By mapping the error type with `map_err`, the function now correctly returns `Err(DecodeError::InvalidUtf8)` whenever `from_utf8` rejects the bytes. Callers can then log, discard, or quarantine the bad frame before it reaches any consumer. Without this mapping the `Utf8Error` type from the standard library would not match `DecodeError`, so the code would not compile; `map_err` bridges the two error types cleanly in one expression.
