## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — take_while Discards Boundary Element
// ------------------------------------------------------------------------

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
        // CHANGE 1: Use position() to find the sentinel index without consuming any bytes from the VecDeque, replacing the take_while iterator adapter that silently ate the 0xFF byte.
        let sentinel_pos = self.buf.iter().position(|&b| b == 0xFF)?;

        // Collect exactly the frame bytes that precede the sentinel.
        let frame: Vec<u8> = self.buf.iter().copied().take(sentinel_pos).collect();

        // CHANGE 2: Drain frame bytes AND the sentinel (sentinel_pos + 1) so the next frame starts at the correct position, instead of only draining frame.len() which left the 0xFF in the buffer.
        self.buf.drain(..sentinel_pos + 1);

        Some(frame)
    }
}
```

## Explanation

### Issue 1: `take_while` silently consumes sentinel byte

**Problem:** Every other frame is silently dropped. When two frames arrive back-to-back the second frame's data is missing its first byte, or the second frame is skipped entirely. The `0xFF` sentinel that should delimit frames disappears from the `VecDeque` between calls to `next_frame`.

**Fix:** Replace the `take_while` iterator chain with a call to `position()` on `self.buf.iter()`, storing the result as `sentinel_pos`. Then use `take(sentinel_pos)` to collect the frame bytes. `position()` returns the index without consuming or mutating the underlying `VecDeque`.

**Explanation:** `take_while` works by repeatedly calling `next()` on the underlying iterator. When it encounters the byte that fails the predicate (here `0xFF`), it has already advanced the iterator past that byte to inspect it. Because the iterator was created with `self.buf.iter()` — a shared reference — no bytes are removed from the `VecDeque` by the iteration itself, but the consumed position is not tracked back. Actually the deeper issue is that the original code uses `.iter().copied()` (not `by_ref()` on a draining iterator), so iteration alone does not remove bytes; however the sentinel index is still unknown and the drain in the original code only removes `frame.len()` bytes leaving the `0xFF` in place — which compounds with Issue 2 below. Using `position()` gives a reliable, non-consuming index into the deque that can be used both for `take` and for the drain range.

---

### Issue 2: Drain range excludes the sentinel, leaving `0xFF` in the buffer

**Problem:** After a frame is decoded the `0xFF` sentinel remains as the first byte of `self.buf`. The next call to `next_frame` sees that `0xFF` immediately, collects an empty frame of zero bytes, drains one byte, and only then reaches the actual data of the next real frame. This produces a spurious empty frame followed by a shifted decode of all subsequent frames.

**Fix:** Change the drain range from `..frame.len()` to `..sentinel_pos + 1`. `sentinel_pos` is the index of the `0xFF` byte, so `sentinel_pos + 1` is one past it, and `drain(..sentinel_pos + 1)` removes both the frame bytes and the sentinel in a single operation.

**Explanation:** `VecDeque::drain` removes elements in the given index range and shifts the remaining elements to the front. The original code drains `frame.len()` elements, which equals `sentinel_pos` — exactly the frame data bytes — but index `sentinel_pos` (the `0xFF` itself) is outside the range and stays in the deque. The next call to `next_frame` then finds a sentinel at position 0, collects an empty `Vec`, drains one byte, and the real next frame's data is now off by zero but preceded by no sentinel removal — cascading the corruption across all subsequent frames. Adding `+ 1` to the drain bound covers the sentinel and leaves the deque positioned at the start of the next frame's payload.
