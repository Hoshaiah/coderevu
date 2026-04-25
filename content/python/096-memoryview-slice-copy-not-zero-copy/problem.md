---
slug: memoryview-slice-copy-not-zero-copy
track: python
orderIndex: 96
title: Memoryview Slice Forces Unnecessary Copy
difficulty: hard
tags:
  - perf
  - memory
  - correctness
language: python
---

## Context

This network frame parser lives in `protocol/frame_parser.py` and processes binary frames received from a high-throughput message broker. Frames arrive as raw `bytes` objects and are sliced into header, payload, and checksum regions without copying for performance. The parser is on the critical path — it processes several hundred thousand frames per second and any extra allocation shows up clearly in profiling.

A performance regression was filed after a refactor: peak memory usage increased significantly (2–3x) and GC pressure spiked, as measured by `tracemalloc` and the GC stats. The parser was refactored to use `memoryview` specifically to avoid copies, but the profiler shows that `bytes` allocations inside `parse_frame` are still happening at the same rate as before the refactor.

The team confirmed that downstream consumers do correctly accept `memoryview` objects. The issue is not in the downstream handling — it's in the parser itself. They can see from `tracemalloc` snapshots that the allocations are happening at a specific line inside `parse_frame`.

## Buggy code

```python
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

    header = bytes(mv[:HEADER_SIZE])  # need bytes for struct.unpack
    msg_id, payload_len, flags = struct.unpack("!IHH", header)

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
