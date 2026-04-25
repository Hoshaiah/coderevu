## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Write! Error Silently Discarded
// ------------------------------------------------------------------------

use std::fs::File;
use std::io::{BufWriter, Write};

pub fn write_report(path: &str, lines: &[String]) -> std::io::Result<()> {
    let file = File::create(path)?;
    let mut writer = BufWriter::new(file);
    for line in lines {
        // CHANGE 1: Propagate the Result from write! with ? instead of discarding it silently.
        write!(writer, "{}\n", line)?;
    }
    // CHANGE 2: Explicitly flush the BufWriter so buffered bytes are written to the OS before returning; flush errors are propagated with ?.
    writer.flush()?;
    Ok(())
}
```

## Explanation

### Issue 1: `write!` Return Value Silently Discarded

**Problem:** Every `write!` call returns a `Result`, and the code ignores it entirely. When the underlying `File` write fails — for example because the disk is full — the error is thrown away and execution continues. The function then returns `Ok(())`, telling the caller everything succeeded even though nothing was written.

**Fix:** Append `?` to each `write!(writer, "{}\n", line)` call, turning it into `write!(writer, "{}\n", line)?;`. This propagates any `Err` immediately to the caller instead of discarding it.

**Explanation:** The `write!` macro expands to a call to `Write::write_fmt`, which returns `io::Result<()>`. Rust does not require you to handle a `Result` — the compiler emits a `#[must_use]` warning, but warnings don't stop compilation and are easy to miss. Because `BufWriter` buffers writes internally, the actual OS write happens later, so early `write!` calls frequently succeed and only a later one (or the final flush) hits the full-disk error. Without `?`, that error is never surfaced. Adding `?` ensures the first failed write immediately exits the function with an `Err`, so the caller can react correctly.

---

### Issue 2: `BufWriter` Never Explicitly Flushed

**Problem:** `BufWriter` accumulates bytes in an in-memory buffer and writes them to the underlying `File` in larger chunks. If the buffer is not explicitly flushed before the function returns, the `BufWriter` destructor attempts the flush — but Rust destructors cannot propagate errors, so any flush failure is silently swallowed. Operators see a file that exists but contains partial or no content.

**Fix:** Call `writer.flush()?;` immediately before `Ok(())`. This forces all buffered data to the OS while errors can still be returned to the caller.

**Explanation:** `BufWriter<W>` holds an internal `Vec<u8>`. Calls to `write!` append to that buffer; the buffer is only written to the wrapped writer when it fills up or when `flush` is called. When `BufWriter` is dropped, its `Drop` implementation calls `flush` internally, but `Drop::drop` returns `()` — there is no way to return an `Err` from it, so the error is discarded. On a full filesystem the drop-time flush fails silently, leaving the file empty or truncated. By calling `writer.flush()?` explicitly, the flush happens while the function can still return an `Err`, so the caller receives the actual I/O error and can log it, retry, or abort cleanly.
