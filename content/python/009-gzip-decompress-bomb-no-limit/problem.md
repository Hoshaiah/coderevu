---
slug: gzip-decompress-bomb-no-limit
track: python
orderIndex: 9
title: Unbounded gzip Decompression in Upload Handler
difficulty: medium
tags:
  - resource-management
  - security
  - file-io
language: python
---

## Context

This function lives in `app/uploads/processor.py` and is called whenever a user uploads a `.gz` log file for analysis. The service runs inside a container with 512 MB of memory, and multiple uploads can be processed concurrently via a thread pool.

Ops started seeing containers OOM-killed sporadically. Memory graphs show spikes that jump from ~80 MB to the container limit within a few seconds just before the kill. The crash happens during upload processing, not during any other phase.

The team initially suspected a memory leak in the analysis step and added profiling there, but the profiler showed the spike happened before analysis even started — during the decompression step.

## Buggy code

```python
import gzip
import pathlib

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB raw upload limit

def decompress_log(upload_path: str) -> bytes:
    """
    Decompress a user-uploaded gzip file and return its raw contents
    for downstream analysis.
    """
    path = pathlib.Path(upload_path)
    if path.stat().st_size > MAX_UPLOAD_BYTES:
        raise ValueError(f"Upload too large: {path.stat().st_size} bytes")

    with gzip.open(upload_path, "rb") as f:
        data = f.read()

    return data
```
