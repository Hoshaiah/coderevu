## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Panic Inside Drop Implementation
// ------------------------------------------------------------------------

use std::path::{Path, PathBuf};

pub struct TempFile {
    path: PathBuf,
}

impl TempFile {
    pub fn create(dir: &Path, prefix: &str) -> std::io::Result<Self> {
        let path = dir.join(format!("{}_{}.tmp", prefix, std::process::id()));
        std::fs::File::create(&path)?;
        Ok(TempFile { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        // CHANGE 1: Replace .unwrap() with explicit error handling so a missing file does not panic inside Drop.
        // CHANGE 2: Log the error to stderr so failures are visible in production without aborting the process.
        if let Err(e) = std::fs::remove_file(&self.path) {
            eprintln!("[TempFile] failed to remove {:?}: {}", self.path, e);
        }
    }
}
```

## Explanation

### Issue 1: `unwrap()` panics inside `Drop`

**Problem:** When `remove_file` returns an error (e.g. the file was already deleted by a competing cleanup process), `.unwrap()` panics. If `drop` is called during stack unwinding from another panic, Rust detects a second panic in-flight and immediately aborts the process — no backtrace, no useful diagnostics.

**Fix:** Replace `.unwrap()` with an `if let Err(e)` match at the `CHANGE 1` site so an error from `remove_file` is handled gracefully instead of propagated as a panic.

**Explanation:** Rust's runtime treats a panic that escapes a `drop` implementation while the stack is already unwinding as an unrecoverable state and calls `std::process::abort`. This is intentional — the language cannot safely run two concurrent unwinds. So even a "harmless" `ENOENT` error, which would normally be caught at a call site, becomes fatal here. Replacing `.unwrap()` with a pattern match means the `Drop` impl always returns normally, which satisfies the constraint. A related pitfall: using `Result::ok()` and discarding the value also avoids the panic, but then you lose the error entirely — see Issue 2.

---

### Issue 2: Cleanup errors are invisible in production

**Problem:** After removing `.unwrap()`, if the error is simply dropped (e.g. `.ok()` with no logging), operators have no way to know cleanup is failing. Under sustained disk pressure the temporary directory can fill with leaked `.tmp` files, and no alert fires.

**Fix:** At the `CHANGE 2` site, inside the `if let Err(e)` arm, call `eprintln!` to write the path and error message to stderr so the failure appears in process logs.

**Explanation:** `Drop` cannot return a `Result`, so surfacing errors requires a side channel. Writing to stderr is the lowest-dependency option — it works before any logging framework is initialized, does not allocate from a custom allocator, and is visible in systemd journal, Docker log drivers, and most other runtime environments. If the project already uses a structured logger like `tracing` or `log`, the `eprintln!` can be swapped for `tracing::warn!` or `log::warn!` without changing the control flow. The key point is that the error must be emitted somewhere rather than silently ignored, so an operator can act on repeated failures.
