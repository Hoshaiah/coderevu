## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Hardcoded Endianness in Struct Pack
# ------------------------------------------------------------------------

import struct

# Frame layout (spec): magic(1B) | seq(2B, big-endian) | value(4B, big-endian IEEE 754)
# CHANGE 1: Changed format prefix from '=' (native byte order) to '>' (big-endian / network byte order) to match the protocol spec. '=' uses the host's native endianness, which produced correct output only on little-endian x86 machines and byte-swapped output on big-endian hosts like SPARC.
FRAME_FMT = ">BHf"

def encode_frame(seq: int, value: float) -> bytes:
    """
    Encode a telemetry frame according to the protocol spec.
    """
    magic = 0xA5
    return struct.pack(FRAME_FMT, magic, seq, value)

def decode_frame(data: bytes) -> tuple:
    """
    Decode a telemetry frame. Returns (seq, value).
    """
    # CHANGE 2: decode_frame also uses FRAME_FMT, so fixing the format string above corrects decoding automatically — no separate change needed here, but the dependency is explicit.
    magic, seq, value = struct.unpack(FRAME_FMT, data)
    if magic != 0xA5:
        raise ValueError(f"Invalid magic byte: {magic:#x}")
    return seq, value
```

## Explanation

### Issue 1: Wrong Endianness Format Prefix

**Problem:** `FRAME_FMT = "=BHf"` tells `struct` to use the host machine's native byte order. On little-endian x86, the 2-byte sequence number and 4-byte float are packed least-significant-byte first. The protocol spec requires big-endian (most-significant-byte first). A SPARC host decoding these frames sees the bytes in the wrong order and reconstructs garbage values — a sequence number of `0x0001` arrives as `0x0100`, and float values are completely mangled.

**Fix:** Replace the `=` prefix with `>` in `FRAME_FMT`, changing it to `">BHf"`. `>` is `struct`'s explicit big-endian specifier and is equivalent to network byte order regardless of the host architecture.

**Explanation:** `struct` format strings use a leading character to control byte order: `=` means "use whatever byte order this CPU uses", while `>` means "always write the most-significant byte first". On little-endian x86, `=` and `<` behave identically, so the bug was invisible on the developer's machine. On a big-endian SPARC, `=` would write bytes in the opposite order from what little-endian nodes produce, making every multi-byte field appear byte-swapped. Using `>` pins the wire format to a single canonical representation regardless of host architecture, which is exactly what a network protocol spec demands. A related pitfall: `!` is also valid and means network byte order (big-endian), but `>` is more explicit and conventional in application code.

---

### Issue 2: Decode Path Shares the Same Broken Format String

**Problem:** `decode_frame` calls `struct.unpack(FRAME_FMT, data)` using the same module-level constant. While the frame bytes on the wire are already wrong due to Issue 1, even a locally round-tripped encode→decode on x86 would break if the format string were fixed only in one place. More practically, any node that receives a spec-compliant frame from a corrected sender would still misinterpret it because the decoder uses the native-endian format.

**Fix:** Because `decode_frame` already references the shared `FRAME_FMT` constant, fixing the constant in Issue 1 automatically corrects the decoder. No additional code change is required in `decode_frame` itself, but the shared dependency must be understood so that no developer "fixes" encode by introducing a second local format string while leaving the shared one broken.

**Explanation:** Both functions read `FRAME_FMT` at call time — Python looks up the module global each time the function body executes. This means a single change to the constant propagates correctly to both pack and unpack, which is the intended design. The risk is the inverse: if a developer had copied the format string inline into each function rather than sharing a constant, fixing one copy and missing the other would create an asymmetric codec that corrupts every frame. Keeping a single authoritative format constant and fixing it in one place is the minimal, correct repair.
