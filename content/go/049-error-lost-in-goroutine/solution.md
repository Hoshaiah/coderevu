## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Errors Silently Dropped in Goroutine
// ------------------------------------------------------------------------

package importer

import (
	"encoding/csv"
	"fmt"
	"io"
	"sync"
)

func ImportCSV(r io.Reader, store func(record []string) error) error {
	reader := csv.NewReader(r)
	var wg sync.WaitGroup
	// CHANGE 2: errc is a buffered channel sized to collect one error per goroutine; it lets goroutines report failures without blocking.
	var mu sync.Mutex
	var firstErr error
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read error: %w", err)
		}
		wg.Add(1)
		go func(rec []string) {
			defer wg.Done()
			// CHANGE 1: store error is now captured instead of discarded with `_ =`; failures are recorded for the caller.
			if err := store(rec); err != nil {
				// CHANGE 2: use a mutex-protected variable to record the first store error so ImportCSV can return it instead of nil.
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("store error: %w", err)
				}
				mu.Unlock()
			}
		}(record)
	}
	wg.Wait()
	// CHANGE 2: return firstErr (nil on full success, non-nil if any goroutine's store call failed) so the caller sees the failure.
	return firstErr
}
```

## Explanation

### Issue 1: store() errors silently discarded

**Problem:** Every call to `store(rec)` inside the goroutine uses `_ = store(rec)`, which throws away the returned error. If the database write fails — due to a constraint violation, a dropped connection, or any other reason — the failure produces no log line and no indication that the row was skipped. From the outside, the import appears to have processed every record.

**Fix:** Replace `_ = store(rec)` with `if err := store(rec); err != nil { ... }` so the error value is actually inspected at the `CHANGE 1` site.

**Explanation:** In Go, assigning a return value to `_` is an explicit instruction to the compiler to ignore it. The ETL job relies on the absence of errors as a signal that all rows were written, but with the blank identifier the signal is always "no error" regardless of what actually happened. Capturing the error and acting on it is the only way to surface the failure. A related pitfall: even after capturing the error you must propagate it outside the goroutine (see Issue 2), otherwise it still disappears when the goroutine exits.

---

### Issue 2: goroutine errors never reach the caller

**Problem:** Even if the error from `store` were captured, a goroutine cannot return a value to its launcher. Before the fix, `ImportCSV` always returns `nil` after `wg.Wait()`. The nightly job sees exit code 0, no alert fires, and the missing rows are only noticed later by counting database records.

**Fix:** At the `CHANGE 2` sites, a `sync.Mutex`-protected `firstErr` variable is introduced. Each goroutine locks the mutex and records the first non-nil error it encounters. After `wg.Wait()` completes, `ImportCSV` returns `firstErr` instead of a hard-coded `nil`.

**Explanation:** Goroutines share memory with their parent but have no built-in return channel. The two standard patterns for collecting goroutine errors are a shared variable protected by a mutex, or a buffered channel. The mutex approach used here is straightforward: all goroutines run to completion (so `wg.Wait()` still works correctly), and the caller receives at least one concrete error if anything went wrong. A production system might want to collect all errors rather than just the first, but returning even one non-nil error is enough to change the exit code, fire the alert, and break the silent-failure mode the operators were observing.
