---
slug: mmap-write-beyond-file-size
track: python
orderIndex: 81
title: mmap Write Past End of File
difficulty: hard
tags:
  - correctness
  - resource-management
  - file-io
language: python
---

## Context

This function is in `storage/journal.py`, part of a write-ahead log implementation. It memory-maps a pre-allocated journal file and writes fixed-size 512-byte records into it. The journal file is created externally with a fixed size, and records are appended by bumping an in-memory offset counter.

On certain Linux kernel versions, operators see `SIGBUS` crashes inside the worker process with no Python traceback — the signal kills the process outright. The crashes are sporadic and correlate with high write throughput. Core dumps show the fault address is always just past the end of the mapped region.

The team confirmed the journal file is being created correctly and that the mmap opens without error. They also ruled out filesystem full conditions — there is always ample disk space.

## Buggy code

```python
import mmap
import struct
import os

RECORD_SIZE = 512
JOURNAL_PATH = "/var/lib/app/journal.bin"

class JournalWriter:
    def __init__(self):
        self._fd = os.open(JOURNAL_PATH, os.O_RDWR)
        file_size = os.fstat(self._fd).st_size
        self._mm = mmap.mmap(self._fd, file_size)
        self._offset = 0

    def write_record(self, payload: bytes) -> None:
        assert len(payload) <= RECORD_SIZE, "payload too large"
        record = payload.ljust(RECORD_SIZE, b"\x00")
        self._mm[self._offset : self._offset + RECORD_SIZE] = record
        self._offset += RECORD_SIZE

    def close(self):
        self._mm.flush()
        self._mm.close()
        os.close(self._fd)
```
