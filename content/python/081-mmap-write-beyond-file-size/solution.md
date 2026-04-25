## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — mmap Write Past End of File
# ------------------------------------------------------------------------

import mmap
import struct
import os

RECORD_SIZE = 512
JOURNAL_PATH = "/var/lib/app/journal.bin"

class JournalWriter:
    def __init__(self):
        self._fd = os.open(JOURNAL_PATH, os.O_RDWR)
        file_size = os.fstat(self._fd).st_size
        # CHANGE 2: Use ACCESS_WRITE explicitly and call madvise-friendly mmap; also store file_size for bounds checking.
        self._mm = mmap.mmap(self._fd, file_size, access=mmap.ACCESS_WRITE)
        self._file_size = file_size
        self._offset = 0
        self._closed = False  # CHANGE 3: Track closed state to guard against post-close writes.

    def write_record(self, payload: bytes) -> None:
        assert len(payload) <= RECORD_SIZE, "payload too large"
        # CHANGE 3: Raise clearly instead of hitting a SIGBUS or corrupting state after close.
        if self._closed:
            raise RuntimeError("JournalWriter has been closed")
        record = payload.ljust(RECORD_SIZE, b"\x00")
        # CHANGE 1: Check that the write fits inside the mapped region before attempting it; raise instead of writing past the end.
        if self._offset + RECORD_SIZE > self._file_size:
            raise ValueError(
                f"Journal full: offset {self._offset} + record size {RECORD_SIZE} "
                f"exceeds file size {self._file_size}"
            )
        self._mm[self._offset : self._offset + RECORD_SIZE] = record
        self._offset += RECORD_SIZE

    def close(self):
        if self._closed:  # CHANGE 3: Idempotent close; prevents double-free of mmap/fd.
            return
        self._mm.flush()
        self._mm.close()
        os.close(self._fd)
        self._closed = True  # CHANGE 3: Mark closed so subsequent write_record calls fail fast.
```

## Explanation

### Issue 1: Missing bounds check before mmap write

**Problem:** When `_offset` advances close to the end of the file, the next `write_record` call constructs a slice `[_offset : _offset + RECORD_SIZE]` that extends past the end of the mapped region. The kernel delivers SIGBUS to the process at the exact moment it touches the out-of-bounds page. Because SIGBUS is not a Python exception, there is no traceback — the worker dies silently.

**Fix:** Before the slice assignment, add a guard: `if self._offset + RECORD_SIZE > self._file_size: raise ValueError(...)`. This is the `CHANGE 1` block, which stores `file_size` in `self._file_size` during `__init__` and compares against it on every write.

**Explanation:** An `mmap` object backed by a file can only safely address bytes within `[0, file_size)`. The Python `mmap` slice setter does not validate the range against the file size before asking the kernel to write; it relies on the caller to stay in bounds. When the write lands on a page that has no backing storage (because the file ends there), the MMU raises a bus error instead of a page fault. Storing `self._file_size` at open time and checking `_offset + RECORD_SIZE > self._file_size` before each write turns the silent SIGBUS into a Python `ValueError` that can be caught, logged, and acted on — for example by rotating the journal file.

---

### Issue 2: mmap opened without explicit `ACCESS_WRITE`

**Problem:** Omitting the `access` parameter lets `mmap.mmap` pick a default that varies by platform. On some Linux kernel versions with certain filesystem drivers (e.g., XFS with delayed allocation), pages in a pre-allocated but unwritten file are backed by a "hole" rather than real disk blocks. Writing to those pages via the default-access mmap can still trigger SIGBUS because the kernel cannot allocate blocks at fault time.

**Fix:** Pass `access=mmap.ACCESS_WRITE` explicitly at `CHANGE 2`. This makes the intent unambiguous to both Python's mmap wrapper and the kernel, and it pairs correctly with `O_RDWR` on the file descriptor.

**Explanation:** `mmap.ACCESS_WRITE` maps to `PROT_READ|PROT_WRITE` with `MAP_SHARED`, which is what a write-ahead log needs — changes are reflected back to the file. Without the explicit flag, the default on Linux also produces a shared writable mapping, but relying on defaults makes auditing harder and masks the intent. More importantly, the explicit mode makes it straightforward to later switch to `MAP_POPULATE` or call `os.posix_fadvise` to pre-fault pages, which eliminates the deferred-allocation SIGBUS entirely. The fix here is minimal — the bigger mitigation is the bounds check in CHANGE 1 — but explicit `access` is correct hygiene for any mmap used for writing.

---

### Issue 3: No closed-state guard allows post-close writes

**Problem:** If `close()` is called and then `write_record` is called again (for example in a shutdown race between threads), the code tries to use a closed `mmap` object. Python raises `ValueError: mmap closed or invalid`, but only if the runtime catches it; in some paths the process state becomes inconsistent.

**Fix:** Add `self._closed = False` in `__init__`, set it to `True` in `close()`, and check `if self._closed: raise RuntimeError(...)` at the top of `write_record`. Also make `close()` idempotent by returning early if already closed. These are the `CHANGE 3` sites.

**Explanation:** After `self._mm.close()` is called, the underlying `mmap` object is invalidated. Any subsequent access raises an exception from deep inside the C extension, which may not surface cleanly depending on how the caller handles exceptions. Making `_closed` an explicit flag lets the check happen at the Python layer before touching the mmap, producing a clear `RuntimeError` with a useful message. The idempotent `close()` guard prevents a double-close of the file descriptor (`os.close` on an already-closed fd can close an unrelated fd that the OS reused), which is a subtle but real resource-management bug in long-running processes.
