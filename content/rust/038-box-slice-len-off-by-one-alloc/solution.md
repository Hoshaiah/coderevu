## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Box Slice Capacity Shorter Than Data
// ------------------------------------------------------------------------

pub fn encode_frame(payload: &[u8]) -> Box<[u8]> {
    let payload_len = payload.len();
    let total_len = 4 + payload_len;

    // CHANGE 1: Allocate exactly `total_len` bytes, not `total_len - 1`; the off-by-one caused the last payload byte to be missing in the output buffer.
    let mut buf: Vec<u8> = vec![0u8; total_len];

    // Write the 4-byte big-endian length prefix.
    let len_bytes = (payload_len as u32).to_be_bytes();
    buf[0..4].copy_from_slice(&len_bytes);

    // Write the payload.
    buf[4..4 + payload_len].copy_from_slice(payload);

    buf.into_boxed_slice()
}
```

## Explanation

### Issue 1: Buffer Allocated One Byte Too Short

**Problem:** The receiver always sees a zero byte at the end of any payload whose length is a multiple of 4, and shorter-than-expected data for other lengths. The frame is consistently one byte shorter than it should be.

**Fix:** Replace `vec![0u8; total_len - 1]` with `vec![0u8; total_len]` at the allocation site (CHANGE 1). The buffer must hold exactly `4 + payload_len` bytes: 4 for the length prefix and `payload_len` for the payload itself.

**Explanation:** `total_len` is computed correctly as `4 + payload_len`, but then `total_len - 1` is passed to `vec!`, so the backing allocation is one byte short. When `payload_len` is a multiple of 4, the `copy_from_slice` call for the payload writes exactly one byte past the end of the `Vec`'s initialized region. Because `Vec` internally over-allocates in powers of two, that extra byte happens to fall within the `Vec`'s raw capacity (which is rounded up), so Rust does not panic — it just writes into untracked memory that `into_boxed_slice` never exposes, and the `Box<[u8]>` ends up one byte short. The final byte of the payload is therefore never included in the returned slice, and the receiver reads the zero that was already there from a previous operation or from OS-zeroed memory. For payload lengths that are not multiples of 4 the allocation shortfall lands mid-payload and Rust's bounds check on `copy_from_slice` panics, which is a separate but related symptom of the same root cause.

---
