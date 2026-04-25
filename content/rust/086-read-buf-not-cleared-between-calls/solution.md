## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Read Buffer Stale on Short Read
// ------------------------------------------------------------------------

use std::io::{self, Read};

pub fn read_commands<R: Read>(mut stream: R) -> io::Result<Vec<Vec<u8>>> {
    let mut results = Vec::new();
    let mut buf = [0u8; 32];

    loop {
        // CHANGE 1: Zero the buffer before each read so stale bytes from a prior longer packet cannot bleed into a shorter packet's slice.
        buf = [0u8; 32];

        // CHANGE 2: Use read_exact-style loop to accumulate bytes until EOF or a full read, preventing partial-read misinterpretation.
        let mut total = 0usize;
        loop {
            match stream.read(&mut buf[total..]) {
                Ok(0) => break,
                Ok(n) => {
                    total += n;
                    if total == buf.len() {
                        break;
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(e) => return Err(e),
            }
        }

        if total == 0 {
            break; // EOF
        }
        // Process exactly the bytes that were read.
        results.push(buf[..total].to_vec());
    }
    Ok(results)
}
```

## Explanation

### Issue 1: Stale Buffer Bytes on Short Read

**Problem:** When a shorter packet follows a longer one, the buffer still holds bytes from the previous packet in its tail positions. Because `buf[..n].to_vec()` only slices up to `n`, those stale bytes are technically excluded — but if `n` is ever used incorrectly elsewhere, or if the zeroing fix is absent and future callers inspect the raw buffer, the old data is silently present. More critically, in any variation of this code that does not slice precisely (e.g., passes the whole buffer to a deserializer), the wrong bytes are decoded as part of the new packet.

**Fix:** At the top of each loop iteration, reset `buf` to `[0u8; 32]` (CHANGE 1). This guarantees that any positions not written by the current `read` call contain zeros, not leftover data from a previous packet.

**Explanation:** The buffer is allocated once before the loop and reused every iteration. `stream.read()` only overwrites `buf[0..n]` — it makes no promise about bytes beyond `n`. If the previous packet wrote 32 bytes and the current packet produces only 10 bytes, `buf[10..32]` still holds the previous packet's data. Any code path that looks at more than `n` bytes (a deserializer that reads a fixed 32-byte struct, a downstream function that trusts the buffer length, etc.) will silently consume stale data. Zeroing before each read eliminates this entirely. The cost is one 32-byte `memset` per packet, which is negligible compared to the I/O.

---

### Issue 2: Partial Read Leaves Packet Incomplete

**Problem:** `stream.read()` is permitted by the `Read` trait contract to return any number of bytes from 1 up to the buffer length, even if more data is immediately available in the kernel socket buffer. Operators see a packet decoded with only part of its payload; the rest arrives in the next call and is treated as a separate, malformed packet.

**Fix:** Replace the single `stream.read(&mut buf)` call with an inner accumulation loop (CHANGE 2) that keeps calling `stream.read` into the remaining slice (`buf[total..]`) until either `n == 0` (EOF/connection closed) or `total` reaches the full buffer length. An `Interrupted` error is retried rather than returned.

**Explanation:** The `Read::read` documentation explicitly states: "It is not an error if the returned value `n` is smaller than the buffer size, even when the reader is not at the end of the stream yet." TCP is a stream protocol; the OS may deliver data in segments that do not align with application-level message boundaries. A single `read` call can legally return 1 byte even when 32 are queued. The inner loop accumulates chunks into `buf` using `total` as the write cursor, so each successive call fills the next unused portion of the buffer. When `read` returns 0 mid-packet (peer closed the connection), `total` holds however many bytes arrived and those are emitted as a final partial packet, which is the correct behavior for an abrupt close.
