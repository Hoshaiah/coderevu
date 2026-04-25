## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Closed Writer Error Silently Dropped
// ------------------------------------------------------------------------

package export

import (
	"encoding/csv"
	"fmt"
	"os"
)

type Row struct {
	ID    string
	Amount string
}

func writeRows(w *csv.Writer, rows []Row) error {
	for _, r := range rows {
		if err := w.Write([]string{r.ID, r.Amount}); err != nil {
			return fmt.Errorf("write row: %w", err)
		}
	}
	w.Flush()
	return w.Error()
}

func ExportToFile(path string, rows []Row) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	// CHANGE 1 & 2: Replace unconditional defer f.Close() with a cleanup-only defer that closes the file solely on error paths (when f has not already been closed below), preventing both the silent-drop and the double-close.
	closed := false
	defer func() {
		if !closed {
			f.Close()
		}
	}()

	w := csv.NewWriter(f)
	if err := writeRows(w, rows); err != nil {
		return fmt.Errorf("write rows: %w", err)
	}

	// CHANGE 1: Explicitly close the file here and return its error so I/O errors flushed at close time are visible to the caller instead of being discarded.
	closed = true
	if err := f.Close(); err != nil {
		return fmt.Errorf("close file: %w", err)
	}

	return nil
}
```

## Explanation

### Issue 1: `Close` error silently discarded

**Problem:** When `os.File.Close` fails — for example because the OS flushes buffered data to disk and encounters an I/O error — the error is never returned to the caller. The ETL job sees a success return value even though the file may be empty or truncated.

**Fix:** Remove the sole `defer f.Close()` call and add an explicit `f.Close()` before `return nil`, capturing its error with `if err := f.Close(); err != nil { return fmt.Errorf("close file: %w", err) }`. The defer is replaced by a guarded version (see Issue 2) that only fires on early-exit paths.

**Explanation:** Go's `defer` executes the deferred call but throws away its return value — there is no mechanism to capture it and merge it into the enclosing function's named return. So `defer f.Close()` will never propagate a close error no matter what. By closing the file explicitly before returning, the caller can see the error. On Linux and many network filesystems, `close(2)` is the point at which the kernel writes dirty page-cache data to disk, so it is a real and common source of I/O errors that must not be ignored in data-integrity code.

---

### Issue 2: Double-close of file descriptor

**Problem:** If you add an explicit `f.Close()` at the end of the function but keep `defer f.Close()` unchanged, the file is closed twice: once explicitly and once when the deferred call runs as the function returns. On most Unix systems this is a no-op for `os.File` because Go's runtime guards against it, but on some platforms or with certain file implementations a second close can return a spurious error or, more dangerously, close a recycled file descriptor opened by another goroutine.

**Fix:** Introduce a `closed bool` sentinel variable. The deferred closure checks `if !closed { f.Close() }`. The explicit close at the end of the happy path sets `closed = true` before calling `f.Close()`, so the deferred function becomes a no-op in the success case and still cleans up the descriptor on any early-return error path.

**Explanation:** The defer must stay in the function to ensure the file is closed if `writeRows` returns an error before the explicit close is reached. The `closed` flag is a standard pattern that coordinates between the deferred cleanup and the explicit close: the defer acts as a safety net only when the explicit close has not yet been called. Without this coordination, every successful call closes the file descriptor twice. While Go's `os.File` makes this safe today, relying on that implementation detail is fragile and the double-close produces a misleading error from the defer on some systems.
