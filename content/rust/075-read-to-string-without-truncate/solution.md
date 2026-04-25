## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Stale Data After Repeated Read
// ------------------------------------------------------------------------

use std::fs::File;
use std::io::{self, Read};

pub fn reload_config(path: &str, buf: &mut String) -> io::Result<String> {
    let mut file = File::open(path)?;
    // CHANGE 1: Clear the buffer before reading so leftover bytes from a previous (longer) file do not persist after a shorter file is read.
    buf.clear();
    // CHANGE 2: read_to_string appends to the existing buffer; clearing first (CHANGE 1) makes this a clean replace, not an accumulation.
    file.read_to_string(buf)?;
    Ok(buf.clone())
}

pub fn watch_loop(path: &str) {
    let mut buf = String::new();
    loop {
        match reload_config(path, &mut buf) {
            Ok(contents) => println!("Config: {}", contents),
            Err(e) => eprintln!("Error: {}", e),
        }
        std::thread::sleep(std::time::Duration::from_secs(5));
    }
}
```

## Explanation

### Issue 1: Stale Tail Bytes After Shorter File

**Problem:** When the watched file shrinks, the operator's updated configuration is silently ignored. The watcher detects the mtime change and reads the file, but the in-memory `String` still ends with bytes from the longer previous version, so the TOML parser sees a mix of new content followed by old content.

**Fix:** Add `buf.clear()` immediately before `file.read_to_string(buf)` inside `reload_config`. This is `CHANGE 1` in the reference solution.

**Explanation:** `String::read_to_string` is documented to *append* to the destination buffer — it does not overwrite it. On the first call the buffer is empty, so the result looks correct. On a subsequent call where the new file has fewer bytes than the old one, `read_to_string` writes the new bytes starting at index 0 (via the append path, which actually extends from `len`) and stops when EOF is reached. Because the buffer's length was already set to the old file's size, the bytes beyond the new file's length are never touched; they remain as the old content. Calling `buf.clear()` sets `len` to 0 without releasing the heap allocation, so the buffer capacity is still reused (no extra allocation) while the stale tail is gone. A related pitfall: if the file grows, this bug does not surface because the new content completely covers the old, which is why it went unnoticed until a shrinking edit was made.

---

### Issue 2: Accumulating Appends on Every Poll Tick

**Problem:** Even when file size stays the same across edits, every call to `reload_config` appends the full file content onto whatever was already in the buffer. After two ticks, `buf` contains the file content twice; after N ticks, N times. The clone returned to the caller reflects this ever-growing string.

**Fix:** The same `buf.clear()` at `CHANGE 1` / `CHANGE 2` resolves this — clearing before each read ensures each call produces exactly the current file's content, not the current content concatenated with all prior readings.

**Explanation:** `Read::read_to_string` appends bytes to the `String` by calling `buf.push_str`-equivalent operations internally. There is no internal reset. Because `watch_loop` passes the same `&mut String` on every iteration, each successful read leaves the buffer longer than before. After enough ticks the buffer can grow to many megabytes of repeated config text. The TOML parser may succeed on the first copy and return the right values, or it may fail partway through the second copy with a parse error — the behavior depends on whether duplicate keys are an error in the TOML library in use. `buf.clear()` before each `read_to_string` call makes the semantics of the function match caller expectations: one call, one file's worth of content.
