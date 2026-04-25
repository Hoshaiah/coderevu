---
slug: mmap-read-after-close
track: python
orderIndex: 18
title: Mmap Access After File Close
difficulty: hard
tags:
  - resource-management
  - correctness
  - memory
language: python
---

## Context

This component lives in `indexing/lookup.py` and provides fast read access to a large binary lookup table stored on disk. It memory-maps the file for zero-copy reads and is used by a hot query path that resolves record IDs to metadata entries. The function is called thousands of times per second in production.

The service crashes intermittently with `ValueError: mmap closed or invalid` or, more rarely, with a segmentation fault. The crashes are not reproducible in development (where the lookup table is small) and only appear under production load. Heap profiling shows no obvious memory leaks. The crashes correlate with high query throughput but not with any specific record ID range.

## Buggy code

```python
import mmap
import struct

RECORD_SIZE = 16

def lookup_record(path: str, record_id: int) -> tuple[int, int]:
    with open(path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        offset = record_id * RECORD_SIZE
        data = mm[offset : offset + RECORD_SIZE]
    high, low = struct.unpack(">QQ", data)
    return high, low
```
