## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Deferred Error Overwrites Real Error
// ------------------------------------------------------------------------

package storage

import (
	"fmt"
	"os"
)

func writeBatch(dst string, records [][]byte) (err error) {
	tmp, err := os.CreateTemp("", "batch-*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	defer func() {
		cErr := tmp.Close()
		// CHANGE 1: Only assign cErr to err when there is no existing error already set; this prevents a successful Close from silently discarding a write or rename error that was already stored in the named return.
		if cErr != nil && err == nil {
			err = fmt.Errorf("close temp: %w", cErr)
		}
	}()

	for _, rec := range records {
		if _, wErr := tmp.Write(rec); wErr != nil {
			return fmt.Errorf("write: %w", wErr)
		}
	}

	if err = os.Rename(tmp.Name(), dst); err != nil {
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}
```

## Explanation

### Issue 1: Deferred Close Silently Discards Earlier Error

**Problem:** When a `Write` call fails (e.g., disk full), the function sets the named return `err` to a non-nil value and returns. The deferred function then runs, calls `tmp.Close()`, which succeeds and returns `nil`. The deferred body assigns `err = ...` only when `cErr != nil` — but in the original code the condition is simply `if cErr != nil`, so when `cErr` is `nil` the body does nothing. Wait — actually the real problem is the opposite path: the deferred body *does* assign to `err` when `cErr != nil`, but the crucial missing guard is `&& err == nil`. Without that guard, a future scenario where both fail would overwrite the write error with the close error. More critically in the reported scenario: `return fmt.Errorf("write: %w", wErr)` sets the named return `err` to the write error, then the deferred closure runs and `cErr` is `nil`, so the `if cErr != nil` body is skipped — `err` is left as the write error. So the write error *is* returned in that specific path. The real latent bug is that if *both* `Write` fails *and* `Close` fails, the close error overwrites the write error, making root-cause diagnosis impossible for operators.

**Fix:** Add `&& err == nil` to the condition on the `if cErr != nil` line inside the deferred closure, so it becomes `if cErr != nil && err == nil`. This means an already-set error (from write or rename) is never replaced by a subsequent close error.

**Explanation:** Named return values in Go are ordinary variables that deferred functions can read and write after a `return` statement has already set them. When `tmp.Write` fails, `return fmt.Errorf("write: %w", wErr)` stores the write error in `err` and jumps to the deferred cleanup. If `Close` also fails, the deferred assignment `err = fmt.Errorf("close temp: %w", cErr)` replaces the write error entirely. The caller now sees only a close error (or, depending on timing, could see `nil` if neither branch fires as expected). Adding `&& err == nil` makes the deferred assignment act as a fallback: it only fills in an error when none exists yet. A related pitfall: if you ever change the deferred close to run before the rename, the same guard protects rename errors from being overwritten too.

---
