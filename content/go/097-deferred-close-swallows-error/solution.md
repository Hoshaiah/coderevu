## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Deferred file close silently discards the write error
// ------------------------------------------------------------------------
package export

import (
	"encoding/csv"
	"os"
)

func WriteCSV(path string, records [][]string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	// CHANGE 1: Do not use defer for Close; instead close explicitly and capture its error so that OS-level flush/sync failures are not silently dropped.

	w := csv.NewWriter(f)
	if err := w.WriteAll(records); err != nil {
		f.Close() // best-effort cleanup; ignore error since we already have one
		return err
	}
	w.Flush()
	// CHANGE 2: Check w.Error() before closing so a buffered-write failure is returned immediately, and the caller sees the real error rather than nil.
	if err := w.Error(); err != nil {
		f.Close()
		return err
	}
	// CHANGE 1 (continued): Capture and return the Close error; this is where
	// the kernel finally flushes dirty pages to the file and can report ENOSPC
	// or other I/O errors that would otherwise be lost.
	if err := f.Close(); err != nil {
		return err
	}
	return nil
}
```

## Explanation

### Issue 1: Deferred close discards OS-level write errors

**Problem:** The exported CSV files are occasionally empty or truncated the next morning, but the job exits with code 0 and no error in the logs. The data appears to have been written, yet the file on disk is wrong.

**Fix:** Remove `defer f.Close()` and replace it with explicit `f.Close()` calls at each exit path. The final, successful path captures the return value of `f.Close()` and returns it to the caller.

**Explanation:** `defer f.Close()` discards the error returned by `Close` because a deferred call's return values are not captured by the surrounding function. On Linux and most UNIX systems, `write(2)` calls can succeed even when the kernel's page cache is full or the underlying device has a problem; the error surfaces only when the file descriptor is closed and the kernel tries to flush dirty pages. If `Close` fails (e.g., `ENOSPC`, `EIO`) and that error is thrown away, the function returns `nil`, the job logs success, and the file on disk is incomplete. Calling `f.Close()` explicitly and checking its return value means the caller receives the actual OS error.

---

### Issue 2: Flush error checked too late relative to close

**Problem:** `w.Flush()` is called and then `w.Error()` is checked, but if a flush error occurred the code falls through to `f.Close()` without returning the error first. In the original code this was masked further by the deferred close; even with an explicit close, the pattern of calling `w.Error()` as the function's sole return expression makes it easy to accidentally swallow the error on future edits.

**Fix:** After `w.Flush()`, check `w.Error()` in an `if` block and return the error immediately (with a best-effort `f.Close()` for cleanup), before attempting the file close whose error would otherwise shadow the CSV error.

**Explanation:** `csv.Writer` buffers writes internally using a `bufio.Writer`. `w.Flush()` pushes that buffer to the underlying `os.File`, and `w.Error()` reports any error that occurred during `WriteAll` or `Flush`. If you call `f.Close()` before checking `w.Error()`, two problems can arise: first, a successful `Close` will cause the function to return `nil` even though data was not fully written; second, the close error (if any) will overwrite the more informative CSV/flush error. Checking `w.Error()` before `f.Close()` ensures that when a buffered-write failure occurs, the caller sees the original error and can act on it.
