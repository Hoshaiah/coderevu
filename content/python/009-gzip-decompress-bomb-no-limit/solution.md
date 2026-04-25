## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Unbounded gzip Decompression in Upload Handler
# ------------------------------------------------------------------------

import gzip
import pathlib

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB raw upload limit
# CHANGE 1+2: Limit applies to decompressed output; reading in chunks enforces it without loading everything into memory at once.
MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024  # 50 MB decompressed limit
READ_CHUNK_SIZE = 64 * 1024  # 64 KB per read

def decompress_log(upload_path: str) -> bytes:
    """
    Decompress a user-uploaded gzip file and return its raw contents
    for downstream analysis.
    """
    path = pathlib.Path(upload_path)
    # CHANGE 3: Call stat() once, store result to avoid redundant syscalls and TOCTOU window.
    stat = path.stat()
    if stat.st_size > MAX_UPLOAD_BYTES:
        raise ValueError(f"Upload too large: {stat.st_size} bytes")

    chunks = []
    total = 0
    with gzip.open(upload_path, "rb") as f:
        while True:
            # CHANGE 1: Read in fixed-size chunks instead of f.read() so we can enforce a decompressed-size cap mid-stream.
            chunk = f.read(READ_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            # CHANGE 2: Reject the upload if decompressed content exceeds the cap, preventing gzip-bomb OOM.
            if total > MAX_DECOMPRESSED_BYTES:
                raise ValueError(
                    f"Decompressed content exceeds limit of {MAX_DECOMPRESSED_BYTES} bytes"
                )
            chunks.append(chunk)

    return b"".join(chunks)
```

## Explanation

### Issue 1: Unbounded decompressed read into memory

**Problem:** `f.read()` with no argument decompresses the entire file into a single `bytes` object before returning. A gzip file can compress data at ratios above 1000:1, so a 50 KB upload can expand to hundreds of megabytes. With multiple concurrent uploads, each hitting this path simultaneously, the container's 512 MB limit is reached in seconds.

**Fix:** Replace the single `f.read()` call with a `while True` loop that calls `f.read(READ_CHUNK_SIZE)` (64 KB at a time) and accumulates chunks in a list that is joined at the end.

**Explanation:** When `gzip.open` decompresses a file, Python has no way to know the final size upfront — it just inflates bytes as you read them. Calling `f.read()` with no limit tells gzip to decompress everything and hand it back as one object. By reading in small chunks, the code can track the running total and abort early. The final `b"".join(chunks)` is still an in-memory operation, but by the time it runs, the total size has already been validated to be within the cap. A related pitfall: do not use a generator-style lazy approach and skip the join, because downstream analysis code expects a complete `bytes` object.

---

### Issue 2: Size guard checks compressed size, not decompressed size

**Problem:** The `MAX_UPLOAD_BYTES` check compares `path.stat().st_size`, which is the size of the `.gz` file on disk — the compressed size. A valid 10 MB `.gz` file can expand to gigabytes. The guard passes, and the decompression proceeds without any ceiling on the output.

**Fix:** Add a separate `MAX_DECOMPRESSED_BYTES` constant (also 50 MB) and check `total > MAX_DECOMPRESSED_BYTES` inside the read loop, raising `ValueError` immediately when the threshold is crossed.

**Explanation:** gzip compression is transparent to the OS-level file size, so `st_size` only tells you how many bytes are stored, not how many bytes will come out. The original guard is not useless — it still prevents uploading huge compressed archives — but it provides no protection against high-ratio compression. Checking the running decompressed byte count inside the loop means the function aborts as soon as the expanded data exceeds the limit, and memory is released when the `with` block exits. The two limits can be tuned independently: you might allow a 100 MB compressed upload but still cap decompressed output at 50 MB.

---

### Issue 3: `path.stat()` called twice

**Problem:** The original code calls `path.stat()` once in the `if` condition and a second time inside the `f-string`. This is a redundant syscall and introduces a tiny window where the file could be replaced between the two calls, causing the error message to show a different size than the one that was checked.

**Fix:** Store the result of `path.stat()` in a local variable `stat` before the `if` block, then reference `stat.st_size` in both the condition and the error message.

**Explanation:** Each call to `path.stat()` makes a separate `stat(2)` syscall to the kernel. While the performance impact of one extra syscall is negligible, the correctness issue is real: if the file is modified or replaced between the two calls (possible when files are written to a shared upload directory), the size logged in the exception message will differ from the size that was actually checked. Storing the result once eliminates both problems with no cost.
