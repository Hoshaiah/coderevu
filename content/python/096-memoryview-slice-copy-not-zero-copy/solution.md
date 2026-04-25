## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Memoryview Slice Forces Unnecessary Copy
# ------------------------------------------------------------------------

import struct
from dataclasses import dataclass

HEADER_SIZE = 8  # bytes: 4-byte msg_id + 2-byte payload_len + 2-byte flags

@dataclass
class Frame:
    msg_id: int
    flags: int
    payload: memoryview
    checksum: memoryview

def parse_frame(data: bytes) -> Frame:
    """
    Parse a binary frame without copying the payload or checksum regions.
    Frame layout: [header: 8 bytes][payload: variable][checksum: 4 bytes]
    """
    mv = memoryview(data)

    # CHANGE 1: Pass the memoryview slice directly to struct.unpack instead of converting to bytes; struct.unpack accepts any buffer-protocol object, so this avoids the per-frame allocation that was causing the regression.
    msg_id, payload_len, flags = struct.unpack("!IHH", mv[:HEADER_SIZE])

    payload_end = HEADER_SIZE + payload_len
    payload = mv[HEADER_SIZE:payload_end]
    checksum = mv[payload_end:payload_end + 4]

    return Frame(
        msg_id=msg_id,
        flags=flags,
        payload=payload,
        checksum=checksum,
    )
```

## Explanation

### Issue 1: Redundant `bytes()` copy on every frame

**Problem:** Every call to `parse_frame` allocates a fresh 8-byte `bytes` object for the header via `bytes(mv[:HEADER_SIZE])`. At several hundred thousand frames per second this produces hundreds of thousands of short-lived heap objects per second, which is exactly what the `tracemalloc` snapshot shows and what drives the GC pressure spike.

**Fix:** Remove the `bytes(mv[:HEADER_SIZE])` call and pass `mv[:HEADER_SIZE]` — still a `memoryview` — directly as the first argument to `struct.unpack`. The variable `header` is eliminated entirely.

**Explanation:** `struct.unpack` accepts any object that implements the buffer protocol, and `memoryview` does. Wrapping in `bytes()` was a leftover assumption from code that predated the `memoryview` refactor: the author assumed `struct.unpack` needed a concrete `bytes` object, but that has not been true since Python 3.2. A `memoryview` slice like `mv[:HEADER_SIZE]` is a view into the original buffer with no copy; `bytes(mv[:HEADER_SIZE])` materialises a brand-new allocation. Because the fix keeps a `memoryview` all the way through, no allocation happens for the header region, and the GC sees no new short-lived objects from this path. A related pitfall: if you ever need to cache or store the header bytes outside the lifetime of the original `data` object, you would need an explicit copy — but for transient unpacking inside a function call, none is needed.

---

### Issue 2: `struct.unpack` buffer-protocol compatibility not leveraged

**Problem:** The code treats `struct.unpack` as if it only accepts `bytes`, so a conversion is inserted every time. This misunderstanding means the memoryview refactor never fully took effect for the header region, leaving one allocation path completely untouched.

**Fix:** Replace `struct.unpack("!IHH", header)` (where `header` was a `bytes` copy) with `struct.unpack("!IHH", mv[:HEADER_SIZE])`, passing the raw memoryview slice. The `header` local variable is removed.

**Explanation:** Python's `struct.unpack` uses the buffer protocol internally to read bytes from its second argument. Any object that exposes the buffer protocol — `bytes`, `bytearray`, `memoryview`, `array.array` — works without conversion. Passing `mv[:HEADER_SIZE]` gives `struct.unpack` a direct window into the original `data` bytes object at the right offset and length; no data is moved. The fix is a one-line change: dropping the intermediate variable and the `bytes()` call. Once this is done, `parse_frame` performs zero heap allocations for any frame (beyond the `Frame` dataclass itself), which matches the original intent of the memoryview refactor.
