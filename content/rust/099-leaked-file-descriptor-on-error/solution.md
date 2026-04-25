## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — File descriptor leak when `write_all` fails partway through processing a batch
// ------------------------------------------------------------------------
use std::fs::File;
use std::io::{self, Write};

pub fn write_audit_records(path: &str, records: &[String]) -> io::Result<()> {
    let mut file = File::create(path)?;

    for record in records {
        let line = format!("{record}\n");
        if let Err(e) = file.write_all(line.as_bytes()) {
            eprintln!("Failed to write record: {e}");
            // CHANGE 1: Removed `std::mem::forget(file)`. Letting `file` drop here closes the file descriptor via the normal Drop impl instead of leaking it.
            return Err(e);
        }
    }

    file.flush()?;
    Ok(())
}
```

## Explanation

### Issue 1: `mem::forget` leaks file descriptor

**Problem:** Every time `write_all` fails, the process leaks one open file descriptor. After enough retries — which are common when the disk is full or inodes are exhausted — the process hits the OS per-process fd limit and crashes with "too many open files".

**Fix:** Remove the `std::mem::forget(file)` call at the `CHANGE 1` site. With that line gone, `file` goes out of scope at the end of the `if let` arm and Rust's `Drop` impl for `File` closes the underlying fd automatically.

**Explanation:** `std::mem::forget` tells Rust to abandon a value without running its destructor. For `File`, the destructor calls `close(2)` on the fd. Skipping it means the fd stays open for the lifetime of the process. The original author probably added `mem::forget` to avoid a double-close or to prevent a second I/O error from masking the first, but neither concern applies here: `Drop` for `File` closes the fd exactly once and ignores any error from `close`, which is the standard safe behavior. Removing `mem::forget` restores the normal ownership path where the fd is closed as soon as `file` leaves scope.

---

### Issue 2: Partially-written file not closed cleanly on error

**Problem:** When `write_all` fails mid-batch, the function returns an error but the `File` is dropped without an explicit `flush`. On some OS/filesystem combinations buffered data may not reach disk, leaving the audit log in an indeterminate state for any consumer that reads the file after the error.

**Fix:** The existing `file.flush()?` call already handles the success path. Because `Drop` for `File` does not flush user-space buffers, no additional explicit flush is strictly required on the error path given that `BufWriter` is not in use here — `File` writes go directly to the kernel. The primary fix (CHANGE 1) is sufficient; the flush on success remains correct as-is.

**Explanation:** `std::fs::File` does not wrap a user-space buffer, so individual `write_all` calls go straight to the kernel's page cache. The `flush()` on the success path is therefore a no-op for `File` itself but is still good practice in case the type is later wrapped in a `BufWriter`. On the error path, any data already written is already in the kernel buffer; the kernel will handle or discard it when the fd is closed. The real danger was that `mem::forget` prevented even the kernel-level `close`, leaving the fd permanently open rather than just leaving unflushed data.
