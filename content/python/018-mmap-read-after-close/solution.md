## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Mmap Access After File Close
# ------------------------------------------------------------------------

import mmap
import struct

RECORD_SIZE = 16

def lookup_record(path: str, record_id: int) -> tuple[int, int]:
    with open(path, "rb") as f:
        # CHANGE 1: wrap mm in its own `with` block so it is closed before the file descriptor is released; accessing mm after f closes causes ValueError or segfault.
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:  # CHANGE 2: using mmap as a context manager ensures mm.close() is called on every exit path, releasing the OS mapping and fd reference.
            offset = record_id * RECORD_SIZE
            data = mm[offset : offset + RECORD_SIZE]
    high, low = struct.unpack(">QQ", data)
    return high, low
```

## Explanation

### Issue 1: mmap Outlives File Descriptor

**Problem:** The `with open(...) as f:` block closes the file descriptor the moment its body exits. The `mm` object is created inside that block but the slice `mm[offset:offset+RECORD_SIZE]` is read after the block ends — on the line `high, low = struct.unpack(...)`. By that point the underlying file descriptor is already closed and the mmap mapping is invalid. Python raises `ValueError: mmap closed or invalid`, or the OS recycles the fd number and the mmap silently points at the wrong mapping, causing a segfault under load when a new fd lands on the same number.

**Fix:** Nest a `with mmap.mmap(...) as mm:` block inside `with open(...) as f:` so both the slice and the unpack happen while `f` is still open and the mapping is still valid. The `data` bytes are copied out of the mapping before either context manager exits.

**Explanation:** `mmap.mmap` holds a reference to the file descriptor number at creation time, not to the Python file object. When `f.__exit__` calls `f.close()`, the OS fd is released immediately. If another thread or the OS reuses that fd number before `mm` is accessed, the mmap silently reads from a different file — this is the race that only triggers at high throughput in production. By closing `mm` first (inner `with` exits before outer `with`), the mapping is torn down while the fd is still valid, and the bytes are already in the local `data` variable before either close happens. A related pitfall: holding the fd open longer than the mmap is fine, but the reverse — closing the fd while the mmap is still live — is undefined behaviour on some platforms even if Python does not immediately raise.

---

### Issue 2: mmap Never Closed, Leaking Resources

**Problem:** The original code assigns `mm` but never calls `mm.close()`. Each call to `lookup_record` leaks one OS memory mapping and holds a reference to the file descriptor until the garbage collector finalises the `mmap` object. Under high throughput this accumulates quickly, exhausting virtual address space or hitting the per-process fd limit, which can itself cause the `ValueError` seen in production.

**Fix:** Use `mmap.mmap` as a context manager (`with mmap.mmap(...) as mm:`) so `mm.close()` is called deterministically at block exit, including on exceptions. CPython's `mmap` type supports the context-manager protocol since Python 3.2.

**Explanation:** CPython's reference counting usually finalises objects quickly, but it is not guaranteed — especially when exceptions are suppressed or when the object is referenced by a traceback frame. Using the context manager makes the cleanup explicit and synchronous. Without it, each call that returns normally still defers cleanup to the GC, and each call that raises an exception may defer it even longer. At thousands of calls per second the un-closed mappings accumulate faster than the GC reclaims them, pushing the process toward resource exhaustion. Always treat `mmap` objects the same way you treat file objects: open, use, close in a bounded scope.
