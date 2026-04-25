---
slug: mmap-region-not-closed-on-exception
track: python
orderIndex: 15
title: mmap Handle Leaked on Exception
difficulty: hard
tags:
  - resource-management
  - exceptions
  - memory
language: python
---

## Context

`storage/fast_reader.py` uses `mmap` to read large binary index files quickly. The function `read_record` is called thousands of times per second by a search service to look up records by offset. It's been in production for months with no issues, but after a recent deployment that added input validation, the ops team started seeing `OSError: [Errno 12] Cannot allocate memory` on heavily loaded nodes after several hours of uptime.

The issue doesn't show up in load tests shorter than an hour. Memory usage as reported by `top` looks normal; it's the virtual address space / mmap limit (`/proc/sys/vm/max_map_count`) that gets exhausted. Restarting the service clears the problem immediately.

The team confirmed the input validation raises `ValueError` for about 0.1% of requests. Before the validation was added, the error path was never triggered.

## Buggy code

```python
import mmap
import os

RECORD_SIZE = 256

def read_record(index_path: str, record_number: int) -> bytes:
    if record_number < 0:
        raise ValueError(f"record_number must be non-negative, got {record_number}")

    file_size = os.path.getsize(index_path)
    max_records = file_size // RECORD_SIZE

    if record_number >= max_records:
        raise ValueError(
            f"record_number {record_number} out of range (max {max_records - 1})"
        )

    with open(index_path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        offset = record_number * RECORD_SIZE
        data = mm[offset : offset + RECORD_SIZE]
        mm.close()
        return data
```
