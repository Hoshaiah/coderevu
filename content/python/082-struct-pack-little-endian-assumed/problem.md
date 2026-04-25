---
slug: struct-pack-little-endian-assumed
track: python
orderIndex: 82
title: Hardcoded Endianness in Struct Pack
difficulty: hard
tags:
  - correctness
  - perf
  - binary-protocol
language: python
---

## Context

This module is in `protocol/frame_codec.py` and encodes binary frames for a custom UDP telemetry protocol spoken between embedded sensors (ARM little-endian) and an analytics server that may run on x86 or ARM. The protocol specification mandates big-endian (network byte order) for all multi-byte fields.

When the analytics team added a new SPARC-based aggregator node, decoded values for all multi-byte fields were wrong — they looked like byte-swapped versions of the expected values. x86 nodes decoded the same frames correctly, masking the bug for months.

A packet capture confirmed the frames on the wire are byte-swapped relative to the spec. The encoder was written on an x86 developer machine and 'just worked' there, so the endianness was never questioned.

## Buggy code

```python
import struct

# Frame layout (spec): magic(1B) | seq(2B, big-endian) | value(4B, big-endian IEEE 754)
FRAME_FMT = "=BHf"   # native byte order, no alignment

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
    magic, seq, value = struct.unpack(FRAME_FMT, data)
    if magic != 0xA5:
        raise ValueError(f"Invalid magic byte: {magic:#x}")
    return seq, value
```
