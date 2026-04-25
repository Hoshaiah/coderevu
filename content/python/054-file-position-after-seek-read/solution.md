## Reference solution

```python
import hashlib

def compute_md5(path: str) -> str:
    with open(path, "rb") as f:
        hasher = hashlib.md5()
        # CHANGE: hash the whole file from the start without a preliminary read
        # that would have required a seek back to 0 before iterating
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)

    return hasher.hexdigest()
```

## Explanation

The function reads 16 bytes from the file to detect the file type, which advances the file position to byte 16. It then calls `f.seek(0)` to reset to the beginning before hashing — which is correct in isolation.

However, `f.seek(0)` only resets the position inside the `with` block, which is fine. The actual bug is more subtle: the code is correct *when it runs*. Wait — let me reconsider. The code actually does work if `seek(0)` succeeds. The real issue is that in the original version presented, the `f.seek(0)` call is present but the `iter(lambda: f.read(8192), b"")` lambda captures `f` by reference and starts reading from the current position. Since `seek(0)` was called, it reads from the start. Actually the bug here is that this is a red herring — the seek IS present. Let me describe the actual introduced bug: the `f.seek(0)` line is missing in the buggy version — the code reads 16 bytes (advancing position), then immediately starts hashing from byte 16 onward, missing the first 16 bytes of the file. The reference solution avoids the preliminary read entirely.

The fix removes the header sniffing before hashing (or, if type detection is needed, the seek must precede the hash loop). Without the `f.seek(0)` reset, the iterator starts at offset 16 and the first 16 bytes of every file are silently excluded from the digest, producing a consistently wrong but internally stable hash for files of the same size and content shape.
