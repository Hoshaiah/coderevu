## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Wrapped Nil Error Becomes Non-Nil
// ------------------------------------------------------------------------

package db

import (
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("not found")

type opFunc func() error

func withRetry(op opFunc, maxAttempts int) error {
	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		if i > 0 {
			time.Sleep(time.Duration(i*100) * time.Millisecond)
		}
		lastErr = op()
		if lastErr == nil {
			break
		}
		if !isTransient(lastErr) {
			break
		}
	}
	// CHANGE 1: Return nil directly when lastErr is nil instead of wrapping it with fmt.Errorf, which would produce a non-nil error whose message is "operation failed: <nil>".
	if lastErr == nil {
		return nil
	}
	// CHANGE 2: Only wrap with fmt.Errorf when there is an actual error, preserving nil semantics and keeping errors.Is/errors.As working for real errors.
	return fmt.Errorf("operation failed: %w", lastErr)
}

func isTransient(err error) bool {
	// checks for connection reset, timeout, etc.
	return false
}
```

## Explanation

### Issue 1: `fmt.Errorf` wraps nil into non-nil error

**Problem:** Callers see a non-nil error returned from `withRetry` even when the operation succeeded on a retry. The error's string representation is `"operation failed: <nil>"`, which looks like a bug report but carries no real failure information. Any `if err != nil` guard in the calling code triggers incorrectly, and the code that should run on success is skipped.

**Fix:** A nil-check is added before the `fmt.Errorf` call. When `lastErr == nil`, the function returns `nil` immediately. The `fmt.Errorf` line is only reached when `lastErr` is an actual non-nil error.

**Explanation:** `fmt.Errorf` always returns a concrete `*errors.errorString`-like struct (specifically a `*fmt.wrapError` when `%w` is used), even when the value passed to `%w` is `nil`. The returned pointer itself is non-nil, so the caller's `err != nil` check is `true`. The nil stored inside the wrapper is not the same as a nil interface — a Go interface value is nil only when both its type and value fields are nil, but here the type field is `*fmt.wrapError` and is set. A related pitfall: `errors.Is(err, ErrNotFound)` also returns `false` because the wrapped value is untyped nil, not the `ErrNotFound` sentinel. The fix ensures `fmt.Errorf` is only called with a real error, so both `err != nil` and `errors.Is` behave as callers expect.

---

### Issue 2: Nil sentinel destroyed, breaking `errors.Is` for all wrapped errors

**Problem:** Even when the operation returns a well-known sentinel like `ErrNotFound` (which is not transient and should be returned as-is), the error escapes `withRetry` wrapped inside a `fmt.wrapError`. This is correct behavior — `%w` is designed for this — but it becomes a problem when callers rely on `errors.Is(err, ErrNotFound)` without understanding that wrapping is always happening, including on the nil case. The nil case is the most damaging because it is silent and hard to detect without inspecting the error string.

**Fix:** By guarding the `fmt.Errorf` call with `if lastErr == nil { return nil }` (CHANGE 1 and CHANGE 2 together), the nil path is separated from the error path. Non-nil errors still get wrapped with `%w`, so `errors.Is` and `errors.As` continue to work correctly for actual failures, while the nil case now returns a true nil interface value.

**Explanation:** A Go `error` interface holds two words: a type pointer and a value pointer. `fmt.Errorf("...": %w", nil)` sets the type word to `*fmt.wrapError` and the value word to a pointer to a struct whose inner `err` field is nil. The resulting interface is non-nil because the type word is non-nil. Returning plain `nil` sets both words to zero, which is the only way `err == nil` is true in the caller. The fix makes `withRetry` return an untyped nil when there is no error, which is what every caller convention in Go expects from a function whose return type is `error`.
