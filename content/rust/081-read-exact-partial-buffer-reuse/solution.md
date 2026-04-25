## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Stale Buffer Data on Short Read
// ------------------------------------------------------------------------

use std::io::{self, Read};

const FRAME_SIZE: usize = 64;

pub struct Frame {
    pub kind: u8,
    pub seq:  u32,
    pub payload: [u8; 59],
}

pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Frame> {
    let mut buf = [0u8; FRAME_SIZE];
    // CHANGE 1: Use read_exact instead of read so all 64 bytes are always filled before parsing; a single read() may return fewer bytes on a live TCP stream, leaving the rest of buf as zeros from a previous or current allocation and corrupting the parsed frame.
    reader.read_exact(&mut buf)?;
    Ok(Frame {
        kind:    buf[0],
        seq:     u32::from_be_bytes([buf[1], buf[2], buf[3], buf[4]]),
        payload: buf[5..64].try_into().unwrap(),
    })
}
```

## Explanation

### Issue 1: Single `read` Returns Partial Frame

**Problem:** `reader.read(&mut buf)` is permitted by the `Read` contract to return any number of bytes from 1 up to the requested size. On a high-latency or loaded connection, TCP segments arrive in pieces, so `read` frequently returns fewer than 64 bytes. The code then checks whether `n != FRAME_SIZE` and returns an error — but only sometimes. When the kernel coalesces just enough bytes to hit exactly 64 on a lucky call, no error is returned, yet the previous behaviour shows that on ~1-in-5000 calls the buffer contains stale data from a partial segment followed by leftover zeros, producing a structurally valid but semantically garbage `Frame`.

**Fix:** Replace `reader.read(&mut buf)?` with `reader.read_exact(&mut buf)?` (CHANGE 1), and remove the now-redundant `n != FRAME_SIZE` error check entirely. `read_exact` loops internally until the buffer is completely filled or a genuine EOF/error occurs.

**Explanation:** The `Read::read` contract explicitly allows short reads — it returns the number of bytes actually placed into the buffer, which may be less than the buffer length for any stream-oriented source. When `n < 64`, the tail of `buf` holds zeros (from stack initialization this call) or, in optimized builds where the compiler elides the zero-init, arbitrary stack bytes. The check `if n != FRAME_SIZE` does catch the short read and returns an error most of the time, but the connection handler task likely retries on `UnexpectedEof`, and on the retry the stream position is now mid-frame, so subsequent reads parse two partial frames spliced together. `read_exact` solves this by calling `read` in a loop, advancing a cursor until exactly `FRAME_SIZE` bytes have been written into `buf`. It maps a real EOF mid-frame to `ErrorKind::UnexpectedEof` automatically. A related pitfall: `BufReader` wrapping the socket can mask this problem in tests (the buffer often has enough bytes buffered to satisfy one `read` fully) while production bare sockets expose it.

---
