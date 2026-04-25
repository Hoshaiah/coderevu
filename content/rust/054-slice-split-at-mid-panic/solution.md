## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Unchecked split_at Boundary
// ------------------------------------------------------------------------

pub fn decode_frame(buf: &[u8]) -> Option<(&[u8], &[u8])> {
    // Need at least 2 bytes for the length prefix
    if buf.len() < 2 {
        return None;
    }

    let payload_len = u16::from_le_bytes([buf[0], buf[1]]) as usize;

    // CHANGE 1: Guard against a partial frame arriving in multiple TCP segments; without this check split_at panics when rest.len() < payload_len.
    // CHANGE 2: Return None so the caller knows to wait for more data rather than treating a short read as a decode error.
    if buf.len() < 2 + payload_len {
        return None;
    }

    // Split off the header, then split the payload
    let (_, rest) = buf.split_at(2);
    let (payload, remainder) = rest.split_at(payload_len);

    Some((payload, remainder))
}
```

## Explanation

### Issue 1: Missing boundary check before `split_at`

**Problem:** When a frame arrives across multiple TCP segments, the buffer may contain the 2-byte length prefix but fewer than `payload_len` bytes of payload. Calling `rest.split_at(payload_len)` with an index larger than `rest.len()` causes Rust to panic with `index out of bounds`, crashing the thread and dropping every in-flight connection.

**Fix:** Add `if buf.len() < 2 + payload_len { return None; }` before the `split_at` calls (CHANGE 1). This ensures `rest` is at least `payload_len` bytes long before the slice operation.

**Explanation:** `split_at` performs a bounds check at runtime and panics rather than returning an error when the index exceeds the slice length — there is no safe version that returns a `Result`. The fix computes the total number of bytes required (`2` for the header plus `payload_len` for the body) and compares it against `buf.len()` before any slicing. A concrete edge case: if `payload_len` is `1000` but only `500` bytes have arrived, `buf.len()` is `502`, the check fires, and the function returns `None` safely. Without the check, the same input reaches `split_at(1000)` on a 500-byte slice and panics immediately.

---

### Issue 2: Partial frame not signalled as "need more data"

**Problem:** Returning `None` on a partial frame is the correct contract for a streaming framer: it tells the caller to buffer the current bytes and wait for the next read. If the function instead panicked (or returned an error), the caller would likely discard the partial data, corrupting the stream or terminating the connection unnecessarily.

**Fix:** The same `return None` added at CHANGE 2 serves this purpose: the caller receives `None` and knows to leave the buffer intact and retry after the next `read`.

**Explanation:** In a length-prefixed protocol over TCP, partial frames are not errors — they are a routine consequence of TCP segmentation and kernel buffer scheduling. The framer's job is to accumulate bytes until a complete frame is available. Returning `None` is the idiomatic Rust signal for "not ready yet" in a `Option`-returning parser. If the code instead returned `Some` with wrong slice boundaries (or panicked), the upper layer would either process garbage data or crash. Keeping the partial bytes in the buffer and retrying on the next `poll`/`read` is the only correct path forward.
